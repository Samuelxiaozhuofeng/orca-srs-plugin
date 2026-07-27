/**
 * IR 日统计分段结算：支持 partial-exit / pending reopen 后的增量 commit，
 * 避免同一 sessionId 去重丢进度，也避免全量快照二次 commit 双计。
 */

import type { IRSessionMetricsSnapshot } from "./irMetrics"
import {
  emptyIRDailyStatsTotals,
  snapshotToDailyTotals,
  type IRDailyStatsTotals
} from "./irDailyStatsStorage"

export function subtractIRDailyStatsTotals(
  current: IRDailyStatsTotals,
  previous: IRDailyStatsTotals
): IRDailyStatsTotals {
  return {
    durationMs: Math.max(0, current.durationMs - previous.durationMs),
    plannedCount: Math.max(0, current.plannedCount - previous.plannedCount),
    completedCount: Math.max(0, current.completedCount - previous.completedCount),
    topicProcessed: Math.max(0, current.topicProcessed - previous.topicProcessed),
    extractProcessed: Math.max(0, current.extractProcessed - previous.extractProcessed),
    reviewProcessed: Math.max(0, current.reviewProcessed - previous.reviewProcessed),
    extractCreated: Math.max(0, current.extractCreated - previous.extractCreated),
    itemCreated: Math.max(0, current.itemCreated - previous.itemCreated)
  }
}

export function isZeroIRDailyStatsTotals(totals: IRDailyStatsTotals): boolean {
  return (
    totals.durationMs === 0 &&
    totals.plannedCount === 0 &&
    totals.completedCount === 0 &&
    totals.topicProcessed === 0 &&
    totals.extractProcessed === 0 &&
    totals.reviewProcessed === 0 &&
    totals.extractCreated === 0 &&
    totals.itemCreated === 0
  )
}

/**
 * 是否应把当前快照相对 lastSettled 的增量提交进日统计。
 * - hasSessionActivity 为假：不提交
 * - 增量为零：不提交（幂等 settle）
 * - 有 pending 且不允许 whilePending：不提交（等 due 或关闭）
 */
export function shouldCommitIRDailyStatsSegment(params: {
  hasSessionActivity: boolean
  delta: IRDailyStatsTotals
  hasPendingShortRelearn: boolean
  allowWhilePending: boolean
}): boolean {
  if (!params.hasSessionActivity) return false
  if (isZeroIRDailyStatsTotals(params.delta)) return false
  if (params.hasPendingShortRelearn && !params.allowWhilePending) return false
  return true
}

/** 从会话 metrics 快照相对已结算 totals 计算增量。 */
export function computeIRDailyStatsDelta(
  snapshot: Pick<
    IRSessionMetricsSnapshot,
    | "durationMs"
    | "plannedCount"
    | "completedCount"
    | "topicProcessed"
    | "extractProcessed"
    | "reviewProcessed"
    | "extractCreated"
    | "itemCreated"
  >,
  lastSettled: IRDailyStatsTotals = emptyIRDailyStatsTotals()
): IRDailyStatsTotals {
  return subtractIRDailyStatsTotals(snapshotToDailyTotals(snapshot), lastSettled)
}

/**
 * 把增量 totals 填成可 commit 的 metrics 形状（其它字段置 0）。
 * commitIRSessionToDailyStats 只读 snapshotToDailyTotals 关心的字段。
 */
export function deltaTotalsToCommitSnapshot(
  delta: IRDailyStatsTotals
): IRSessionMetricsSnapshot {
  return {
    sessionStartedAt: null,
    sessionEndedAt: null,
    durationMs: delta.durationMs > 0 ? delta.durationMs : null,
    plannedCount: delta.plannedCount,
    completedCount: delta.completedCount,
    topicProcessed: delta.topicProcessed,
    extractProcessed: delta.extractProcessed,
    reviewProcessed: delta.reviewProcessed,
    itemCreated: delta.itemCreated,
    extractCreated: delta.extractCreated,
    extractSuccess: delta.extractCreated,
    extractFailure: 0,
    itemizeSuccess: delta.itemCreated,
    itemizeFailure: 0,
    postponeCount: 0,
    archiveCount: 0,
    deleteCount: 0,
    breakpointSaveSuccess: 0,
    breakpointSaveFailure: 0,
    breakpointRestoreSuccess: 0,
    breakpointRestoreFailure: 0,
    autoPostponeCount: 0,
    autoPostponeUndoCount: 0,
    queueLoadMs: null,
    queueLoadFailures: 0,
    dwellMsTotal: 0,
    dwellSamples: 0
  }
}
