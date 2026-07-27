/**
 * 统一「今日学习」摘要：SRS 日额度剩余 + IR 今日到期可读（扣 IR 日额度），耗时向上取整。
 *
 * 完成数口径（避免混合复习双算）：
 * - SRS：今日 review log 唯一 cardKey 数
 * - IR reading：topicProcessed + extractProcessed（不含 reviewProcessed）
 * - 统一 completed 仅在两侧完成数均可信时合并；任一失败 → completedUnified=null
 *
 * partial/error 侧不得展示精确 remaining / 统一 total / 统一 ETA。
 */

import type { ReviewCard, ReviewLogEntry } from "../types"
import type { IRCard } from "../incrementalReadingCollector"
import { buildReviewQueue } from "../reviewQueueBuilder"
import {
  getLocalTodayBounds,
  remainingDailyLimitsFromLogs,
  resolveDailyQueueLimits,
  stableCardKeyFromReviewLog
} from "../reviewSessionBudget"
import { DEFAULT_REVIEW_CARD_COST_SECONDS } from "../incremental-reading/irMixedQueuePolicy"
import { estimateCardCostSecondsCalibrated } from "../incremental-reading/irCostCalibration"
import { formatLocalDateKey } from "../incremental-reading/irQueuePolicyCore"
import {
  effectiveDailyLimitForQueue,
  loadIRDailyStats,
  resolveEffectiveIRDailyLimit,
  resolveOrcaRepo,
  type IRDailyStatsLoadResult,
  type IRDailyStatsTotals
} from "../incremental-reading/irDailyStatsStorage"
import { summarizeTodayReadableIRCards } from "../../components/incremental-reading/workspace/irLibraryFilters"
import { getReviewSettings } from "../settings/reviewSettingsSchema"
import {
  getIncrementalReadingSettings
} from "../settings/incrementalReadingSettingsSchema"
import { collectReviewCards } from "../cardCollector"
import { getReviewLogs } from "../reviewLogStorage"

export type TodayLearningLoadStatus = "ok" | "partial" | "error" | "empty"

export type TodayLearningSummary = {
  readonly loadStatus: TodayLearningLoadStatus
  /** 仅 status=ok 的侧有精确数字；partial/error → null */
  readonly srsRemaining: number | null
  readonly irRemaining: number | null
  /** 两侧均 ok 时才有统一总数；否则 null（禁止把 lower-bound 当精确 total） */
  readonly remainingTotal: number | null
  readonly estimatedMinutes: number | null
  readonly srsCompleted: number | null
  readonly irReadingCompleted: number | null
  /** 两侧完成数均可信时才合并；否则 null */
  readonly completedUnified: number | null
  readonly srsCostSeconds: number | null
  readonly irCostSeconds: number | null
  readonly recommendation: string
  readonly errorMessage: string | null
  readonly warnings: readonly string[]
  readonly dateKey: string
  readonly fetchedAt: number
}

export type SrsTodayQuotaInput = {
  cards: readonly ReviewCard[]
  todayLogs: readonly ReviewLogEntry[]
  rawNewCardsPerDay: unknown
  rawReviewCardsPerDay: unknown
  now?: Date
}

export type SrsTodayQuotaResult = {
  remainingCount: number
  costSeconds: number
  usedNew: number
  usedReview: number
  completedCardKeys: number
  queue: ReviewCard[]
}

/**
 * 纯函数：按日额度扣减后的正式根卡剩余队列与估时（尊重 injected now）。
 */
export function computeSrsTodayRemaining(
  input: SrsTodayQuotaInput
): SrsTodayQuotaResult {
  const now = input.now ?? new Date()
  const configured = resolveDailyQueueLimits(
    input.rawNewCardsPerDay,
    input.rawReviewCardsPerDay
  )
  const remaining = remainingDailyLimitsFromLogs(
    configured,
    input.todayLogs
  )
  const queue = buildReviewQueue(
    [...input.cards],
    {
      newCardsPerDay: remaining.newCardsPerDay,
      reviewCardsPerDay: remaining.reviewCardsPerDay
    },
    now
  )
  const completedKeys = new Set<string>()
  for (const log of input.todayLogs) {
    completedKeys.add(stableCardKeyFromReviewLog(log))
  }
  return {
    remainingCount: queue.length,
    costSeconds: queue.length * DEFAULT_REVIEW_CARD_COST_SECONDS,
    usedNew: remaining.usedNew,
    usedReview: remaining.usedReview,
    completedCardKeys: completedKeys.size,
    queue
  }
}

export type IrTodayRemainingInput = {
  cards: readonly IRCard[]
  /** 配置 dailyLimit；≤0 = unlimited */
  configuredDailyLimit: number
  /** 今日已完成（IR daily stats completedCount） */
  usedCompletedCount: number
  now?: Date
}

export type IrTodayRemainingResult = {
  remainingCount: number
  costSeconds: number
  topics: number
  extracts: number
  dueCards: IRCard[]
  /** 额度截断前的 due 总数（诊断） */
  uncappedDueCount: number
  effectiveRemainingCap: number | null
}

/** 稳定顺序：due 升序 → priority 降序 → id 升序（估时代表卡，非随机） */
export function compareIrCardsForRemainingEstimate(
  a: IRCard,
  b: IRCard
): number {
  const dueA = a.due.getTime()
  const dueB = b.due.getTime()
  if (dueA !== dueB) return dueA - dueB
  if (a.priority !== b.priority) return b.priority - a.priority
  const idA = typeof a.id === "number" ? a.id : Number(a.id)
  const idB = typeof b.id === "number" ? b.id : Number(b.id)
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA - idB
  }
  return String(a.id).localeCompare(String(b.id))
}

/**
 * 纯函数：逾期 + 今日到期，再按 IR 日额度 cap；估时只计 cap 内卡片。
 */
export function computeIrTodayRemaining(
  input: IrTodayRemainingInput
): IrTodayRemainingResult {
  const now = input.now ?? new Date()
  const summary = summarizeTodayReadableIRCards([...input.cards], now)
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const allDue = input.cards
    .filter((card) => {
      const dueStart = new Date(
        card.due.getFullYear(),
        card.due.getMonth(),
        card.due.getDate()
      ).getTime()
      return dueStart <= todayStart
    })
    .sort(compareIrCardsForRemainingEstimate)

  const effective = resolveEffectiveIRDailyLimit(
    input.configuredDailyLimit,
    input.usedCompletedCount
  )
  const cap =
    effective.kind === "limited" ? effective.remaining : null
  const dueCards =
    cap == null ? allDue : allDue.slice(0, Math.max(0, cap))

  let costSeconds = 0
  for (const card of dueCards) {
    costSeconds += estimateCardCostSecondsCalibrated(card)
  }

  // 截断后 topics/extracts 按实际剩余集合计
  let topics = 0
  let extracts = 0
  for (const card of dueCards) {
    if (card.cardType === "topic") topics += 1
    else extracts += 1
  }

  return {
    remainingCount: dueCards.length,
    costSeconds,
    topics,
    extracts,
    dueCards: [...dueCards],
    uncappedDueCount: summary.total,
    effectiveRemainingCap: cap
  }
}

/**
 * IR 阅读完成数：topic + extract 处理，不含 mixed 中的 reviewProcessed。
 */
export function irReadingCompletedFromTotals(
  totals: Pick<
    IRDailyStatsTotals,
    "topicProcessed" | "extractProcessed" | "completedCount" | "reviewProcessed"
  >
): number {
  const fromParts =
    Math.max(0, Math.floor(totals.topicProcessed)) +
    Math.max(0, Math.floor(totals.extractProcessed))
  const fromDiff = Math.max(
    0,
    Math.floor(totals.completedCount) -
      Math.max(0, Math.floor(totals.reviewProcessed))
  )
  if (fromParts > 0) return fromParts
  return fromDiff
}

/**
 * IR 日额度已用量：完成条目数扣掉统一会话里的 SRS 复习。
 *
 * `completedCount` 对阅读推进 / 推迟 / 归档与 mixed 复习一视同仁地 +1，
 * 但复习卡受 SRS 自己的 new/review 日额度约束，不应再吃掉阅读额度
 * （统一推送后一次会话可能复习几十张，否则当天阅读队列会被直接清零）。
 */
export function irDailyQuotaUsedFromTotals(
  totals: Pick<IRDailyStatsTotals, "completedCount" | "reviewProcessed">
): number {
  const completed = Math.max(0, Math.floor(totals.completedCount))
  const reviewed = Math.max(0, Math.floor(totals.reviewProcessed))
  return Math.max(0, completed - reviewed)
}

/**
 * 日统计读取失败时 fail-closed：不得按 0 已用额度继续。
 */
export function requireIRDailyStatsForSession(
  result: IRDailyStatsLoadResult
):
  | { ok: true; usedCompletedCount: number }
  | { ok: false; error: Error } {
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error instanceof Error
          ? result.error
          : new Error(String(result.error))
    }
  }
  return {
    ok: true,
    usedCompletedCount: irDailyQuotaUsedFromTotals(result.record.totals)
  }
}

export function ceilSecondsToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.ceil(seconds / 60)
}

export function buildTodayLearningRecommendation(input: {
  loadStatus: TodayLearningLoadStatus
  remainingTotal: number | null
  srsRemaining: number | null
  irRemaining: number | null
  estimatedMinutes: number | null
}): string {
  if (input.loadStatus === "error") {
    return "暂时无法读取今日学习，请重试。"
  }
  if (input.loadStatus === "empty" || input.remainingTotal === 0) {
    return "今天已完成，休息一下吧。"
  }
  const parts: string[] = []
  const ir = input.irRemaining
  const srs = input.srsRemaining
  if (ir != null && ir > 0 && srs != null && srs > 0) {
    parts.push("建议开始今日学习（阅读 + 复习混合）")
  } else if (ir != null && ir > 0) {
    parts.push("建议开始今日阅读")
  } else if (srs != null && srs > 0) {
    parts.push("建议开始今日复习")
  } else if (input.loadStatus === "partial") {
    parts.push("部分内容暂时无法读取，请重试或从可信侧开始")
  } else {
    parts.push("今天已完成")
  }
  if (input.estimatedMinutes != null && input.estimatedMinutes > 0) {
    parts.push(`预计约 ${input.estimatedMinutes} 分钟`)
  }
  if (input.loadStatus === "partial") {
    parts.push("（部分内容暂时无法读取）")
  }
  return parts.join(" · ")
}

export type SideOk<T> = { status: "ok"; data: T }
export type SidePartial<T> = { status: "partial"; data: T; warning: string }
export type SideError = { status: "error"; error: Error }
export type SideResult<T> = SideOk<T> | SidePartial<T> | SideError

export type BuildSummaryInput = {
  srs: SideResult<SrsTodayQuotaResult>
  ir: SideResult<IrTodayRemainingResult>
  irReadingCompleted: SideResult<number>
  dateKey: string
  fetchedAt?: number
}

/**
 * 合并两侧结果为统一摘要（纯函数，便于测试）。
 * - 仅 status=ok 侧展示精确 remaining
 * - 任一 remaining 侧 partial/error → remainingTotal / estimatedMinutes = null
 * - completedUnified 仅两侧完成数均 ok 时合并
 */
export function buildTodayLearningSummary(
  input: BuildSummaryInput
): TodayLearningSummary {
  const warnings: string[] = []
  const srsExact = input.srs.status === "ok"
  const irExact = input.ir.status === "ok"
  const srsFailed = input.srs.status === "error"
  const irFailed = input.ir.status === "error"

  if (input.srs.status === "partial") warnings.push(input.srs.warning)
  if (input.ir.status === "partial") warnings.push(input.ir.warning)
  if (input.irReadingCompleted.status === "partial") {
    warnings.push(input.irReadingCompleted.warning)
  }
  if (input.srs.status === "error") {
    warnings.push(`复习：${input.srs.error.message}`)
  }
  if (input.ir.status === "error") {
    warnings.push(`阅读：${input.ir.error.message}`)
  }
  if (input.irReadingCompleted.status === "error") {
    warnings.push(`今日完成统计：${input.irReadingCompleted.error.message}`)
  }

  let loadStatus: TodayLearningLoadStatus
  let errorMessage: string | null = null

  if (srsFailed && irFailed) {
    loadStatus = "error"
    errorMessage = "暂时无法读取今日学习"
  } else if (!srsExact || !irExact || warnings.length > 0) {
    loadStatus = "partial"
    if (srsFailed && irExact) {
      errorMessage = "部分内容暂时无法读取（复习侧失败）"
    } else if (srsExact && irFailed) {
      errorMessage = "部分内容暂时无法读取（阅读侧失败）"
    } else {
      errorMessage = "部分内容暂时无法读取"
    }
  } else {
    loadStatus = "ok"
  }

  // 精确数字：仅 ok；partial 不得把 lower-bound 当精确值展示
  const srsData = input.srs.status === "ok" ? input.srs.data : null
  const irData = input.ir.status === "ok" ? input.ir.data : null
  const srsRemaining = srsData ? srsData.remainingCount : null
  const irRemaining = irData ? irData.remainingCount : null
  const srsCostSeconds = srsData ? srsData.costSeconds : null
  const irCostSeconds = irData ? irData.costSeconds : null

  let remainingTotal: number | null = null
  let estimatedMinutes: number | null = null
  if (srsData && irData) {
    remainingTotal = srsRemaining! + irRemaining!
    estimatedMinutes = ceilSecondsToMinutes(
      (srsCostSeconds ?? 0) + (irCostSeconds ?? 0)
    )
    if (remainingTotal === 0 && loadStatus === "ok") {
      loadStatus = "empty"
    }
  }
  // partial/error 侧存在时：禁止统一 total / ETA

  const srsCompleted = srsData ? srsData.completedCardKeys : null
  const irReadingCompleted =
    input.irReadingCompleted.status === "ok"
      ? input.irReadingCompleted.data
      : null
  // 完成数：两侧均可信才统一；禁止只展示 SRS 标成完整今日已完成
  const completedUnified =
    srsCompleted != null && irReadingCompleted != null
      ? srsCompleted + irReadingCompleted
      : null

  const recommendation = buildTodayLearningRecommendation({
    loadStatus,
    remainingTotal,
    srsRemaining,
    irRemaining,
    estimatedMinutes
  })

  return Object.freeze({
    loadStatus,
    srsRemaining,
    irRemaining,
    remainingTotal,
    estimatedMinutes,
    srsCompleted,
    irReadingCompleted,
    completedUnified,
    srsCostSeconds,
    irCostSeconds,
    recommendation,
    errorMessage,
    warnings: Object.freeze(warnings),
    dateKey: input.dateKey,
    fetchedAt: input.fetchedAt ?? Date.now()
  })
}

export type LoadTodayLearningSummaryDeps = {
  collectReviewCards: (pluginName: string) => Promise<ReviewCard[]>
  getReviewLogs: (
    pluginName: string,
    start: Date,
    end: Date
  ) => Promise<ReviewLogEntry[]>
  getReviewSettings: (pluginName: string) => {
    newCardsPerDay: number
    reviewCardsPerDay: number
  }
  getIncrementalReadingSettings: (pluginName: string) => {
    dailyLimit: number
  }
  collectIRCardsDetailed: (
    pluginName: string,
    opts: { readOnly: true }
  ) => Promise<{ cards: IRCard[]; failedCount: number }>
  loadIRDailyStats: typeof loadIRDailyStats
  resolveRepo: () => string
}

const defaultDeps: LoadTodayLearningSummaryDeps = {
  collectReviewCards,
  getReviewLogs,
  getReviewSettings,
  getIncrementalReadingSettings,
  collectIRCardsDetailed: async (pluginName, opts) => {
    const { collectIRCardsDetailed } = await import(
      "../incrementalReadingCollector"
    )
    return collectIRCardsDetailed(pluginName, opts)
  },
  loadIRDailyStats,
  resolveRepo: resolveOrcaRepo
}

/**
 * 加载统一今日摘要。失败传播，不返回伪装的全 0 成功。
 */
export async function loadTodayLearningSummary(
  pluginName: string,
  options: {
    now?: Date
    deps?: Partial<LoadTodayLearningSummaryDeps>
  } = {}
): Promise<TodayLearningSummary> {
  const now = options.now ?? new Date()
  const deps = { ...defaultDeps, ...options.deps }
  const dateKey = formatLocalDateKey(now)
  const bounds = getLocalTodayBounds(now)

  let srsSide: SideResult<SrsTodayQuotaResult>
  try {
    const cards = await deps.collectReviewCards(pluginName)
    const todayLogs = await deps.getReviewLogs(
      pluginName,
      bounds.start,
      bounds.end
    )
    const settings = deps.getReviewSettings(pluginName)
    const data = computeSrsTodayRemaining({
      cards,
      todayLogs,
      rawNewCardsPerDay: settings.newCardsPerDay,
      rawReviewCardsPerDay: settings.reviewCardsPerDay,
      now
    })
    srsSide = { status: "ok", data }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    srsSide = { status: "error", error: err }
  }

  // IR 日额度：stats 必须先成功，否则 IR remaining 为 error（与 autoStart fail-closed 一致）
  let completedSide: SideResult<number>
  let irUsedCompleted: number | null = null
  let irConfiguredDailyLimit = 0
  try {
    irConfiguredDailyLimit =
      deps.getIncrementalReadingSettings(pluginName).dailyLimit
    const stats = deps.loadIRDailyStats({
      repo: deps.resolveRepo(),
      pluginName,
      dateKey,
      now
    })
    if (!stats.ok) {
      const err =
        stats.error instanceof Error
          ? stats.error
          : new Error(String(stats.error))
      completedSide = { status: "error", error: err }
      irUsedCompleted = null
    } else {
      irUsedCompleted = irDailyQuotaUsedFromTotals(stats.record.totals)
      completedSide = {
        status: "ok",
        data: irReadingCompletedFromTotals(stats.record.totals)
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    completedSide = { status: "error", error: err }
    irUsedCompleted = null
  }

  let irSide: SideResult<IrTodayRemainingResult>
  if (irUsedCompleted == null) {
    irSide = {
      status: "error",
      error:
        completedSide.status === "error"
          ? completedSide.error
          : new Error("今日 IR 额度读取失败，无法计算阅读剩余")
    }
  } else {
    try {
      const detailed = await deps.collectIRCardsDetailed(pluginName, {
        readOnly: true
      })
      // 证明与会话装配同一 cap 语义
      void effectiveDailyLimitForQueue(
        resolveEffectiveIRDailyLimit(irConfiguredDailyLimit, irUsedCompleted)
      )
      const data = computeIrTodayRemaining({
        cards: detailed.cards,
        configuredDailyLimit: irConfiguredDailyLimit,
        usedCompletedCount: irUsedCompleted,
        now
      })
      if (detailed.failedCount > 0 && detailed.cards.length === 0) {
        irSide = {
          status: "error",
          error: new Error(
            `所有候选阅读卡片均读取失败（${detailed.failedCount}）`
          )
        }
      } else if (detailed.failedCount > 0) {
        irSide = {
          status: "partial",
          data,
          warning: `部分阅读卡片读取失败（${detailed.failedCount}），剩余数不是精确总数`
        }
      } else {
        irSide = { status: "ok", data }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      irSide = { status: "error", error: err }
    }
  }

  return buildTodayLearningSummary({
    srs: srsSide,
    ir: irSide,
    irReadingCompleted: completedSide,
    dateKey,
    fetchedAt: Date.now()
  })
}

// ---------- 短 TTL 缓存 + inflight 去重（与 Flash Home 协同失效） ----------

export const TODAY_LEARNING_SUMMARY_TTL_MS = 45_000

type SummaryCacheEntry = {
  summary: TodayLearningSummary
  fetchedAt: number
  pluginName: string
}

let summaryCache: SummaryCacheEntry | null = null
let summaryInflight: Promise<TodayLearningSummary> | null = null

export function invalidateTodayLearningSummaryCache(): void {
  summaryCache = null
}

export function getTodayLearningSummaryCacheSnapshot(): SummaryCacheEntry | null {
  return summaryCache
}

export async function loadTodayLearningSummaryCached(
  pluginName: string,
  options: {
    force?: boolean
    now?: Date
    deps?: Partial<LoadTodayLearningSummaryDeps>
  } = {}
): Promise<TodayLearningSummary & { fromCache: boolean }> {
  const force = options.force === true
  const nowMs = Date.now()
  if (
    !force &&
    summaryCache &&
    summaryCache.pluginName === pluginName &&
    nowMs - summaryCache.fetchedAt < TODAY_LEARNING_SUMMARY_TTL_MS
  ) {
    return { ...summaryCache.summary, fromCache: true }
  }

  if (summaryInflight) {
    const s = await summaryInflight
    return { ...s, fromCache: false }
  }

  summaryInflight = loadTodayLearningSummary(pluginName, {
    now: options.now,
    deps: options.deps
  })
  try {
    const summary = await summaryInflight
    summaryCache = {
      summary,
      fetchedAt: summary.fetchedAt,
      pluginName
    }
    return { ...summary, fromCache: false }
  } finally {
    summaryInflight = null
  }
}
