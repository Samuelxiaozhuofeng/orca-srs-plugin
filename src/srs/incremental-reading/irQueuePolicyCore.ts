/**
 * 队列策略共享核心：types / constants / 无副作用 helpers
 * 生产依赖单向：core ← select/constraints ← 公共入口 irQueuePolicy
 * 调用方请从 irQueuePolicy 导入，不要直接依赖本文件。
 */

import type { IRCard } from "../incrementalReadingCollector"
import type { IRTimeBudgetMinutes } from "./irTypes"

export type QueueCostEstimateSeconds = number

export type IRQueuePolicyConfig = {
  timeBudgetMinutes: IRTimeBudgetMinutes | number
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

export function budgetSeconds(timeBudgetMinutes: number): number {
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

function getDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isOverdue(card: IRCard, now: Date): boolean {
  return getDayStart(card.due).getTime() < getDayStart(now).getTime()
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
