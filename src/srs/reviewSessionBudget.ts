/**
 * 复习会话正式根卡每日额度（FC-01）
 *
 * - 核心函数只接受显式、纯数据的 limits / budget，不读全局 Orca settings / storage
 * - 额度按「正式根卡」cardKey 计：子卡展开不消耗；已接纳身份短期重入不重复消耗
 * - 跨普通会话：按本地时区「今天」复习日志累计 used，剩余额度 = max(0, configured - used)
 * - fixed 会话传 null budget = 不限额
 */

import type { ReviewCard, ReviewLogEntry } from "./types"
import {
  cardKeyFromReviewCard,
  normalizeReviewLogIdentity
} from "./cardIdentity"
import {
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_REVIEW_CARDS_PER_DAY
} from "./settings/reviewSettingsSchema"

/**
 * 安全上限：防止异常大值导致内存/队列膨胀。
 * 超过此值视为无效设置并回退默认。
 */
export const MAX_DAILY_CARD_LIMIT = 10_000

/** 显式每日限额输入（已通过校验后的有限非负整数） */
export type ReviewQueueLimits = {
  readonly newCardsPerDay: number
  readonly reviewCardsPerDay: number
}

/** 校验结果：始终给出可用 limits；无效输入会写入 warnings 并回退默认 */
export type ResolvedReviewQueueLimits = ReviewQueueLimits & {
  readonly warnings: readonly string[]
  readonly usedDefaults: boolean
}

/**
 * 会话级正式根卡额度状态（可变 Set，表示「本会话已接纳过」的身份）。
 * currentIndex 前移或卡片暂时离开待复习尾部不得释放额度。
 */
export type SessionRootCardBudget = {
  readonly newLimit: number
  readonly reviewLimit: number
  readonly acceptedNewKeys: Set<string>
  readonly acceptedReviewKeys: Set<string>
}

export type ResolveDailyLimitOptions = {
  /** 默认 console.warn；测试可注入收集器 */
  warn?: (message: string) => void
  /** 覆盖默认回退值（测试用） */
  defaultNew?: number
  defaultReview?: number
  maxLimit?: number
}

/**
 * 校验单日限额原始值。
 *
 * 仅接受：有限、非负整数，且 ≤ maxLimit。
 * 拒绝：负数、NaN、Infinity、小数、非数字、超过安全最大值。
 */
export function isValidDailyCardLimit(
  value: unknown,
  maxLimit: number = MAX_DAILY_CARD_LIMIT
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maxLimit
  )
}

/**
 * 从原始设置解析冻结的每日限额。
 * 任一字段无效 → console.warn（或 options.warn）并回退 schema 默认 30/200；
 * 不静默，不返回“空队列假装成功”的特殊状态。
 */
export function resolveDailyQueueLimits(
  rawNew: unknown,
  rawReview: unknown,
  options: ResolveDailyLimitOptions = {}
): ResolvedReviewQueueLimits {
  const warn = options.warn ?? ((msg: string) => console.warn(msg))
  const defaultNew = options.defaultNew ?? DEFAULT_NEW_CARDS_PER_DAY
  const defaultReview = options.defaultReview ?? DEFAULT_REVIEW_CARDS_PER_DAY
  const maxLimit = options.maxLimit ?? MAX_DAILY_CARD_LIMIT
  const warnings: string[] = []

  let newCardsPerDay = defaultNew
  let reviewCardsPerDay = defaultReview
  let usedDefaults = false

  if (!isValidDailyCardLimit(rawNew, maxLimit)) {
    const msg =
      `[SRS] 无效的 review.newCardsPerDay=${String(rawNew)}，` +
      `仅接受 0..${maxLimit} 的有限非负整数；已回退默认值 ${defaultNew}`
    warnings.push(msg)
    warn(msg)
    newCardsPerDay = defaultNew
    usedDefaults = true
  } else {
    newCardsPerDay = rawNew
  }

  if (!isValidDailyCardLimit(rawReview, maxLimit)) {
    const msg =
      `[SRS] 无效的 review.reviewCardsPerDay=${String(rawReview)}，` +
      `仅接受 0..${maxLimit} 的有限非负整数；已回退默认值 ${defaultReview}`
    warnings.push(msg)
    warn(msg)
    reviewCardsPerDay = defaultReview
    usedDefaults = true
  } else {
    reviewCardsPerDay = rawReview
  }

  return Object.freeze({
    newCardsPerDay,
    reviewCardsPerDay,
    warnings: Object.freeze(warnings),
    usedDefaults
  })
}

/**
 * 本地时区「今天」起止边界：
 * - start：当天 00:00:00.000
 * - end：传入时刻（默认 now）
 *
 * 供会话启动时调用 getReviewLogs(plugin, start, end)。
 */
export function getLocalTodayBounds(now: Date = new Date()): {
  start: Date
  end: Date
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { start, end: now }
}

/**
 * 从复习日志解析稳定卡片身份（cardKey）。
 * 兼容读取层已归一化的 legacy cardKey；缺字段时再走 normalizeReviewLogIdentity。
 */
export function stableCardKeyFromReviewLog(log: ReviewLogEntry): string {
  if (typeof log.cardKey === "string" && log.cardKey.length > 0) {
    return log.cardKey
  }
  const normalized = normalizeReviewLogIdentity(log)
  if (typeof normalized.cardKey === "string" && normalized.cardKey.length > 0) {
    return normalized.cardKey
  }
  // 极端兜底：与 normalize 约定一致，避免 silent empty key 合并
  return `legacy:${normalized.cardId}`
}

/** 今日已消耗额度（按稳定 cardKey 去重） */
export type DailyQuotaUsage = {
  readonly usedNew: number
  readonly usedReview: number
  /** 归为新卡的身份集合（previousState === "new"） */
  readonly newKeys: ReadonlySet<string>
  /** 归为旧复习卡的身份集合（排除已归新卡的身份） */
  readonly reviewKeys: ReadonlySet<string>
}

export type CountUsedDailyQuotasOptions = {
  /**
   * 指定牌组时只统计同名 deckName 日志；
   * null/undefined/空字符串 → 统计全部日志（all scope）。
   */
  deckName?: string | null
}

/**
 * 根据今日 ReviewLogEntry[] 统计已消耗的正式卡额度。
 *
 * 规则：
 * - 新卡：previousState === "new" 的不同 cardKey 数
 * - 旧卡：previousState !== "new" 的不同 cardKey 数
 * - 同一身份若同时出现在新/旧记录中，只计新卡，不双占
 * - 可选 deckName 过滤（限额在会话 scope 内计算）
 *
 * 纯函数：不读 settings/storage。
 */
export function countUsedDailyQuotasFromLogs(
  logs: readonly ReviewLogEntry[],
  options: CountUsedDailyQuotasOptions = {}
): DailyQuotaUsage {
  const deckFilter =
    options.deckName != null && options.deckName !== ""
      ? options.deckName
      : null

  const newKeys = new Set<string>()
  const reviewKeys = new Set<string>()

  for (const log of logs) {
    if (deckFilter != null && log.deckName !== deckFilter) {
      continue
    }
    const key = stableCardKeyFromReviewLog(log)
    if (log.previousState === "new") {
      newKeys.add(key)
    } else {
      reviewKeys.add(key)
    }
  }

  // 新卡优先：不得同时占两边额度
  for (const key of newKeys) {
    reviewKeys.delete(key)
  }

  return {
    usedNew: newKeys.size,
    usedReview: reviewKeys.size,
    newKeys,
    reviewKeys
  }
}

/** 配置上限扣除今日已用后的剩余额度（及 used 诊断字段） */
export type RemainingDailyLimits = ReviewQueueLimits & {
  readonly usedNew: number
  readonly usedReview: number
}

/**
 * remaining = max(0, configured - used)；不可为负。
 * 结果可直接作为会话冻结 limits / createSessionRootCardBudget 输入。
 */
export function computeRemainingDailyLimits(
  configured: ReviewQueueLimits,
  usage: Pick<DailyQuotaUsage, "usedNew" | "usedReview">
): RemainingDailyLimits {
  return Object.freeze({
    newCardsPerDay: Math.max(0, configured.newCardsPerDay - usage.usedNew),
    reviewCardsPerDay: Math.max(
      0,
      configured.reviewCardsPerDay - usage.usedReview
    ),
    usedNew: usage.usedNew,
    usedReview: usage.usedReview
  })
}

/**
 * 从已校验 configured limits + 今日日志计算会话剩余额度（纯函数组合）。
 */
export function remainingDailyLimitsFromLogs(
  configured: ReviewQueueLimits,
  todayLogs: readonly ReviewLogEntry[],
  options: CountUsedDailyQuotasOptions = {}
): RemainingDailyLimits {
  const usage = countUsedDailyQuotasFromLogs(todayLogs, options)
  return computeRemainingDailyLimits(configured, usage)
}

/**
 * 创建会话额度；可选将初始正式根卡标记为已接纳（不重复计）。
 * limits === null → 返回 null（不限额，供 fixed 使用）
 */
export function createSessionRootCardBudget(
  limits: ReviewQueueLimits | null | undefined,
  initialFormalRoots: readonly ReviewCard[] = []
): SessionRootCardBudget | null {
  if (limits == null) {
    return null
  }

  const budget: SessionRootCardBudget = {
    newLimit: limits.newCardsPerDay,
    reviewLimit: limits.reviewCardsPerDay,
    acceptedNewKeys: new Set(),
    acceptedReviewKeys: new Set()
  }

  for (const card of initialFormalRoots) {
    acceptFormalRoot(budget, card)
  }

  return budget
}

export function remainingNewSlots(budget: SessionRootCardBudget): number {
  return Math.max(0, budget.newLimit - budget.acceptedNewKeys.size)
}

export function remainingReviewSlots(budget: SessionRootCardBudget): number {
  return Math.max(0, budget.reviewLimit - budget.acceptedReviewKeys.size)
}

/** 是否已作为正式根卡接纳（新或旧任一侧） */
export function isFormalRootAccepted(
  budget: SessionRootCardBudget,
  card: ReviewCard
): boolean {
  const key = cardKeyFromReviewCard(card)
  return budget.acceptedNewKeys.has(key) || budget.acceptedReviewKeys.has(key)
}

/**
 * 尝试接纳一张正式根卡。
 * - 已接纳同一 cardKey → true，不重复消耗
 * - 新身份：按 isNew 占用对应额度，成功则记入 Set
 * - 额度不足 → false
 */
export function acceptFormalRoot(
  budget: SessionRootCardBudget,
  card: ReviewCard
): boolean {
  const key = cardKeyFromReviewCard(card)
  if (budget.acceptedNewKeys.has(key) || budget.acceptedReviewKeys.has(key)) {
    return true
  }

  if (card.isNew) {
    if (budget.acceptedNewKeys.size >= budget.newLimit) {
      return false
    }
    budget.acceptedNewKeys.add(key)
    return true
  }

  if (budget.acceptedReviewKeys.size >= budget.reviewLimit) {
    return false
  }
  budget.acceptedReviewKeys.add(key)
  return true
}

/**
 * 按收集相对顺序，在额度内截取正式根卡候选（不交织）。
 * budget === null → 全部通过。
 * 会 mutate budget（接纳选中的卡）。
 */
export function takeFormalRootsWithinBudget(
  candidates: readonly ReviewCard[],
  budget: SessionRootCardBudget | null
): ReviewCard[] {
  if (budget == null) {
    return [...candidates]
  }

  const selected: ReviewCard[] = []
  for (const card of candidates) {
    if (acceptFormalRoot(budget, card)) {
      selected.push(card)
    }
  }
  return selected
}

/**
 * 将「尚未在 existingKeys 中」的候选按额度过滤并接纳。
 * 已接纳身份（短期重学）若因不在 existingKeys 而再次出现，acceptFormalRoot 不重复消耗。
 */
export function filterAndAcceptNewFormalRoots(
  candidates: readonly ReviewCard[],
  existingKeys: ReadonlySet<string>,
  budget: SessionRootCardBudget | null
): ReviewCard[] {
  const out: ReviewCard[] = []
  for (const card of candidates) {
    const key = cardKeyFromReviewCard(card)
    if (existingKeys.has(key)) {
      continue
    }
    if (budget == null || acceptFormalRoot(budget, card)) {
      out.push(card)
    }
  }
  return out
}
