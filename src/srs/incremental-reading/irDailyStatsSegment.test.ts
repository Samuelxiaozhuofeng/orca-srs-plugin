import { describe, expect, it } from "vitest"
import {
  emptyIRDailyStatsTotals,
  type IRDailyStatsTotals
} from "./irDailyStatsStorage"
import {
  computeIRDailyStatsDelta,
  isZeroIRDailyStatsTotals,
  shouldCommitIRDailyStatsSegment,
  subtractIRDailyStatsTotals
} from "./irDailyStatsSegment"
import type { IRSessionMetricsSnapshot } from "./irMetrics"

function snap(partial: Partial<IRSessionMetricsSnapshot>): IRSessionMetricsSnapshot {
  return {
    sessionStartedAt: 1,
    sessionEndedAt: 2,
    durationMs: 1000,
    plannedCount: 0,
    completedCount: 0,
    topicProcessed: 0,
    extractProcessed: 0,
    reviewProcessed: 0,
    itemCreated: 0,
    extractCreated: 0,
    extractSuccess: 0,
    extractFailure: 0,
    itemizeSuccess: 0,
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
    dwellSamples: 0,
    ...partial
  }
}

describe("IR daily stats segment (partial exit / no double count)", () => {
  it("computes delta after a partial settle so a new session only adds new work", () => {
    const afterPartial = snap({
      completedCount: 5,
      plannedCount: 10,
      topicProcessed: 5,
      durationMs: 50_000
    })
    const lastSettled = emptyIRDailyStatsTotals()
    const firstDelta = computeIRDailyStatsDelta(afterPartial, lastSettled)
    expect(firstDelta.completedCount).toBe(5)
    expect(firstDelta.topicProcessed).toBe(5)

    // 模拟 commit 成功后 lastSettled = 全量
    const settled: IRDailyStatsTotals = { ...firstDelta }

    // 同一快照再 settle → 增量为 0
    const zero = computeIRDailyStatsDelta(afterPartial, settled)
    expect(isZeroIRDailyStatsTotals(zero)).toBe(true)
    expect(
      shouldCommitIRDailyStatsSegment({
        hasSessionActivity: true,
        delta: zero,
        hasPendingShortRelearn: false,
        allowWhilePending: false
      })
    ).toBe(false)

    // 新会话又完成 3 条（累计 8）
    const afterMore = snap({
      completedCount: 8,
      plannedCount: 10,
      topicProcessed: 8,
      durationMs: 80_000
    })
    const secondDelta = computeIRDailyStatsDelta(afterMore, settled)
    expect(secondDelta.completedCount).toBe(3)
    expect(secondDelta.topicProcessed).toBe(3)
    expect(secondDelta.durationMs).toBe(30_000)

    // 日合计 = 5 + 3
    const merged = {
      ...settled,
      completedCount: settled.completedCount + secondDelta.completedCount,
      topicProcessed: settled.topicProcessed + secondDelta.topicProcessed
    }
    expect(merged.completedCount).toBe(8)
  })

  it("does not commit while short-relearn pending unless allowWhilePending", () => {
    const delta = subtractIRDailyStatsTotals(
      {
        ...emptyIRDailyStatsTotals(),
        completedCount: 2,
        plannedCount: 2
      },
      emptyIRDailyStatsTotals()
    )
    expect(
      shouldCommitIRDailyStatsSegment({
        hasSessionActivity: true,
        delta,
        hasPendingShortRelearn: true,
        allowWhilePending: false
      })
    ).toBe(false)
    expect(
      shouldCommitIRDailyStatsSegment({
        hasSessionActivity: true,
        delta,
        hasPendingShortRelearn: true,
        allowWhilePending: true
      })
    ).toBe(true)
  })

  it("skips commit when there was no session activity", () => {
    const delta = {
      ...emptyIRDailyStatsTotals(),
      completedCount: 1
    }
    expect(
      shouldCommitIRDailyStatsSegment({
        hasSessionActivity: false,
        delta,
        hasPendingShortRelearn: false,
        allowWhilePending: true
      })
    ).toBe(false)
  })
})
