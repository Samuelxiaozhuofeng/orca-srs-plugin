/**
 * 队列策略共享核心：types / constants / 无副作用 helpers
 * 生产依赖单向：core ← select/constraints ← 公共入口 irQueuePolicy
 * 调用方请从 irQueuePolicy 导入，不要直接依赖本文件。
 */

import type { IRCard } from "../incrementalReadingCollector"

export type QueueCostEstimateSeconds = number

export type IRQueuePolicyConfig = {
  /** 分钟；传 UNLIMITED_TIME_BUDGET_MINUTES 表示不按时间截断（今日学习主路径） */
  timeBudgetMinutes: number
  dailyLimit: number
  topicMinRatio: number
  topicMinCount: number
  newExtractMaxRatio: number
  explorationRatio: number
  highPriorityThreshold: number
  /** 稳定随机种子（通常为本地日 YYYY-MM-DD） */
  seed: string
}

export const DEFAULT_QUEUE_POLICY: Omit<
  IRQueuePolicyConfig,
  "seed" | "timeBudgetMinutes" | "dailyLimit"
> = {
  topicMinRatio: 0.1,
  topicMinCount: 1,
  newExtractMaxRatio: 0.2,
  explorationRatio: 0.05,
  highPriorityThreshold: 80
}

/** 探索在队列长度达到该阈值后至少尝试 1 槽（当 explorationRatio > 0） */
export const MIN_EXPLORATION_QUEUE_LENGTH = 4

export type QueuePolicyDiagnosticCode =
  | "topic_floor_unsatisfied"
  | "new_extract_cap_softened"
  | "new_extract_cap_unsatisfiable"
  | "exploration_skipped"
  | "exploration_no_legal_swap"
  | "exploration_applied"
  | "first_card_exceeds_budget"

export type QueuePolicyDiagnostic = {
  code: QueuePolicyDiagnosticCode
  /** 机器可测 reason（snake_case） */
  reason: string
  detail?: Record<string, number | string | boolean>
}

export type SelectQueueResult = {
  queue: IRCard[]
  protectedIds: Set<number>
  totalCostSeconds: number
  budgetSeconds: number
  diagnostics: QueuePolicyDiagnostic[]
}

/**
 * 本地自然日 key：YYYY-MM-DD（使用本地年月日，非 UTC ISO）
 */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * 将设置中的 Topic 配额百分比（0..100）转为 topicMinRatio（0..1）。
 * 非有限数值回退到 fallbackPercent（默认 20，与 schema 一致）。
 */
export function topicQuotaPercentToMinRatio(
  percent: unknown,
  fallbackPercent: number = 20
): number {
  const raw =
    typeof percent === "number" && Number.isFinite(percent)
      ? percent
      : Number.isFinite(fallbackPercent)
        ? fallbackPercent
        : 20
  const clamped = Math.min(100, Math.max(0, raw))
  return clamped / 100
}

/**
 * 将任意比例配置钳到 [0, 1]；非有限值用 fallback。
 */
export function clampUnitRatio(value: unknown, fallback: number): number {
  const raw =
    typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.min(1, Math.max(0, raw))
}

export function estimateCardCostSeconds(card: IRCard): QueueCostEstimateSeconds {
  if (card.cardType === "extracts") {
    // 粗略：读次数少/新卡视为短 Extract
    return card.isNew || card.readCount <= 1 ? 30 : 60
  }
  return card.isNew || card.readCount <= 1 ? 90 : 180
}

/**
 * 无时间盒：队列长度只由每日上限决定（今日学习主路径，2026-07-27 起）。
 *
 * 时间盒原本只是"按固定估时反推排多长队列"的旋钮，估时（卡 45s / 摘录 30-60s /
 * 主题 90-180s）对每个人都不准，而计时器到点又不打断，等于用一个猜出来的数字
 * 白砍队列。真正的闸门是各自的每日上限（SRS new/review、IR dailyLimit）。
 */
export const UNLIMITED_TIME_BUDGET_MINUTES = Number.POSITIVE_INFINITY

export function budgetSeconds(timeBudgetMinutes: number): number {
  if (!Number.isFinite(timeBudgetMinutes)) return Number.POSITIVE_INFINITY
  return Math.max(60, Math.floor(timeBudgetMinutes * 60))
}

/** 简单稳定 hash → [0,1) */
export function stableUnitRandom(seed: string, id: number): number {
  let h = 2166136261
  const text = `${seed}:${id}`
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * 探索采样的独立播种 salt。
 * 探索换入者用它做均匀采样，与价值排序 tie-break 的 stableUnitRandom(seed, id)
 * 走**不同**的随机流，避免"平票顺序"与"探索顺序"耦合。
 */
export const EXPLORATION_SEED_SALT = "exploration"

/** 探索均匀采样用的稳定随机（当日确定性；与价值 tie-break 独立）。 */
export function explorationUnitRandom(seed: string, id: number): number {
  return stableUnitRandom(`${seed}:${EXPLORATION_SEED_SALT}`, id)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function getDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isOverdue(card: IRCard, now: Date): boolean {
  return getDayStart(card.due).getTime() < getDayStart(now).getTime()
}

/**
 * 逾期天数（整数，按**本地日边界**计）。
 * due 当日为 0；此后每过一个本地日 +1；未到期为 0。
 * 用 floor(ms/天) 吸收可能的 DST 偏移。
 */
export function overdueDays(card: IRCard, now: Date): number {
  const dueDay = getDayStart(card.due).getTime()
  const nowDay = getDayStart(now).getTime()
  if (dueDay >= nowDay) return 0
  return Math.floor((nowDay - dueDay) / MS_PER_DAY)
}

/**
 * 老化（aging）常量：把"逾期布尔"升级为**加性得分**，遏制低优先级无限饥饿。
 *
 * 设计（排序价值 = priority + agingBonus）：
 * - IR_AGING_RATE = 0.5：每逾期 1 天 +0.5 分 → 满 cap 需 **50 天**。
 * - IR_AGING_CAP  = 25：老化最多把价值抬高 25。
 *   于是 p=50 逾期 50 天可达 75，胜过刚到期的 p=74（旧比较器里 p=51 永远压过逾期 100 天的 p=50）；
 *   而普通卡封顶 priority+25，一张 p=50 老化到极限也只有 75 < 80，**绝不越过** 80 的高优先级
 *   硬保护线，保证高优先级保护语义不被老化淹没。
 */
export const IR_AGING_CAP = 25
export const IR_AGING_RATE = 0.5

/** 老化加成：min(IR_AGING_CAP, overdueDays × IR_AGING_RATE)。 */
export function agingBonus(card: IRCard, now: Date): number {
  return Math.min(IR_AGING_CAP, overdueDays(card, now) * IR_AGING_RATE)
}

/**
 * 排序价值（**单一真相**）：priority + agingBonus。
 * 所有队列比较器与"最低值受害者"选择都必须统一走本函数，
 * 不得在别处另立第二套价值定义。
 */
export function cardValue(card: IRCard, now: Date): number {
  return card.priority + agingBonus(card, now)
}

/**
 * 价值降序比较器：cardValue 高者在前；平票用当日稳定 stableUnitRandom(seed, id)。
 * select 的填充/回填与 constraints 的约束都复用它。
 */
export function sortByValue(list: IRCard[], seed: string, now: Date): IRCard[] {
  return [...list].sort((a, b) => {
    const av = cardValue(a, now)
    const bv = cardValue(b, now)
    if (bv !== av) return bv - av
    return stableUnitRandom(seed, a.id) - stableUnitRandom(seed, b.id)
  })
}

/**
 * "最低值受害者优先"比较器：cardValue 低者在前（sortByValue 的镜像）。
 * 用于 Topic floor 换出、新 Extract cap 换出、探索换出的受害者选择。
 */
export function sortVictimsLowValueFirst(
  list: IRCard[],
  seed: string,
  now: Date
): IRCard[] {
  return [...list].sort((a, b) => {
    const av = cardValue(a, now)
    const bv = cardValue(b, now)
    if (av !== bv) return av - bv
    return stableUnitRandom(seed, b.id) - stableUnitRandom(seed, a.id)
  })
}

export function isHighPriority(card: IRCard, threshold: number): boolean {
  return card.priority >= threshold
}

export function isNewExtract(card: IRCard): boolean {
  return card.cardType === "extracts" && (card.isNew || card.readCount === 0)
}

export function computeTopicFloor(
  queueLength: number,
  topicMinRatio: number,
  topicMinCount: number,
  availableTopics: number
): number {
  if (queueLength <= 0 || availableTopics <= 0) return 0
  const ratioFloor = Math.ceil(queueLength * topicMinRatio)
  const desired = Math.max(topicMinCount, ratioFloor)
  return Math.min(desired, availableTopics, queueLength)
}

export function computeNewExtractCap(
  queueLength: number,
  newExtractMaxRatio: number
): number {
  if (queueLength <= 0) return 0
  return Math.max(0, Math.floor(queueLength * newExtractMaxRatio))
}

/**
 * 调整优先级时的间隔比例修正（保留已有间隔增长成果）。
 * 单一真相在 `irSchedulingHelpers.adjustIntervalForPriorityChange`（含 cardType clamp）。
 * 本导出保持历史导入路径；必须传入 cardType。
 */
export { adjustIntervalForPriorityChange } from "./irSchedulingHelpers"

export function priorityToTier(priority: number): "low" | "medium" | "high" {
  if (priority >= 70) return "high"
  if (priority >= 30) return "medium"
  return "low"
}

export function tierToPriority(tier: "low" | "medium" | "high"): number {
  if (tier === "high") return 80
  if (tier === "medium") return 50
  return 20
}
