import { describe, expect, it } from "vitest"
import type { ReviewCard, ReviewLogEntry, SrsState } from "../types"
import type { IRCard } from "../incrementalReadingCollector"
import {
  buildTodayLearningSummary,
  ceilSecondsToMinutes,
  computeIrTodayRemaining,
  computeSrsTodayRemaining,
  irDailyQuotaUsedFromTotals,
  irReadingCompletedFromTotals,
  requireIRDailyStatsForSession
} from "./todayLearningSummary"
import { DEFAULT_REVIEW_CARD_COST_SECONDS } from "../incremental-reading/irMixedQueuePolicy"
import { createEmptyIRDailyStatsRecord } from "../incremental-reading/irDailyStatsStorage"

function srsState(partial: Partial<SrsState> & { due: Date }): SrsState {
  return {
    due: partial.due,
    stability: partial.stability ?? 1,
    difficulty: partial.difficulty ?? 5,
    interval: partial.interval ?? 1,
    reps: partial.reps ?? 1,
    lapses: partial.lapses ?? 0,
    state: partial.state ?? 2,
    lastReviewed: partial.lastReviewed ?? null
  }
}

function reviewCard(
  id: number,
  opts: { isNew?: boolean; due?: Date; deck?: string } = {}
): ReviewCard {
  const due = opts.due ?? new Date(2026, 0, 10, 8, 0, 0)
  return {
    id,
    deck: opts.deck ?? "default",
    isNew: opts.isNew ?? false,
    front: `f${id}`,
    back: `b${id}`,
    srs: srsState({
      due,
      state: opts.isNew ? 0 : 2,
      reps: opts.isNew ? 0 : 1
    }),
    type: "basic"
  } as unknown as ReviewCard
}

function irCard(
  id: number,
  opts: { due: Date; cardType?: "topic" | "extracts"; priority?: number }
): IRCard {
  return {
    id,
    cardType: opts.cardType ?? "extracts",
    priority: opts.priority ?? 5,
    lastRead: null,
    readCount: 0,
    due: opts.due,
    intervalDays: 1,
    postponeCount: 0,
    stage: opts.cardType === "topic" ? "topic.work" : "extract.raw",
    lastAction: "init",
    position: null,
    resumeBlockId: null
  } as IRCard
}

function log(
  cardId: number,
  previousState: "new" | "learning" | "review" | "relearning"
): ReviewLogEntry {
  return {
    id: `log-${cardId}-${previousState}`,
    cardId,
    cardKey: `card:${cardId}`,
    rating: 3,
    grade: 3,
    state: 2,
    previousState,
    due: new Date().toISOString(),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: 1,
    review: new Date().toISOString(),
    timestamp: Date.now(),
    duration: 0,
    previousInterval: 0,
    deckName: "default"
  } as unknown as ReviewLogEntry
}

describe("computeSrsTodayRemaining", () => {
  const now = new Date(2026, 0, 10, 12, 0, 0)

  it("applies daily limits after log deduction", () => {
    const cards = [
      reviewCard(1, { isNew: false, due: new Date(2026, 0, 10, 9) }),
      reviewCard(2, { isNew: false, due: new Date(2026, 0, 10, 9) }),
      reviewCard(3, { isNew: true, due: new Date(2026, 0, 10, 9) }),
      reviewCard(4, { isNew: true, due: new Date(2026, 0, 10, 9) })
    ]
    const todayLogs = [log(99, "review")]
    const result = computeSrsTodayRemaining({
      cards,
      todayLogs,
      rawNewCardsPerDay: 1,
      rawReviewCardsPerDay: 1,
      now
    })
    expect(result.remainingCount).toBe(1)
    expect(result.queue.every((c) => c.isNew)).toBe(true)
    expect(result.costSeconds).toBe(1 * DEFAULT_REVIEW_CARD_COST_SECONDS)
    expect(result.completedCardKeys).toBe(1)
  })

  it("excludes cards not yet due relative to injected now", () => {
    const cards = [
      reviewCard(1, { isNew: false, due: new Date(2026, 0, 10, 11, 0, 0) }),
      reviewCard(2, { isNew: false, due: new Date(2026, 0, 10, 13, 0, 0) })
    ]
    const result = computeSrsTodayRemaining({
      cards,
      todayLogs: [],
      rawNewCardsPerDay: 30,
      rawReviewCardsPerDay: 200,
      now: new Date(2026, 0, 10, 12, 0, 0)
    })
    expect(result.remainingCount).toBe(1)
    expect(result.queue.map((c) => c.id)).toEqual([1])
  })
})

describe("computeIrTodayRemaining", () => {
  const now = new Date(2026, 0, 10, 12, 0, 0)

  it("merges overdue + today due then caps by IR daily remaining", () => {
    const cards = [
      irCard(1, { due: new Date(2026, 0, 8), cardType: "topic", priority: 1 }),
      irCard(2, { due: new Date(2026, 0, 10, 18), cardType: "extracts", priority: 9 }),
      irCard(3, { due: new Date(2026, 0, 11), cardType: "extracts" })
    ]
    const unlimited = computeIrTodayRemaining({
      cards,
      configuredDailyLimit: 0,
      usedCompletedCount: 0,
      now
    })
    expect(unlimited.remainingCount).toBe(2)
    expect(unlimited.uncappedDueCount).toBe(2)

    const capped = computeIrTodayRemaining({
      cards,
      configuredDailyLimit: 30,
      usedCompletedCount: 29,
      now
    })
    expect(capped.remainingCount).toBe(1)
    expect(capped.effectiveRemainingCap).toBe(1)
    // 稳定顺序：due 更早的优先
    expect(capped.dueCards[0].id).toBe(1)
    expect(capped.costSeconds).toBeLessThan(unlimited.costSeconds)
  })

  it("remaining 0 when daily limit exhausted", () => {
    const cards = [
      irCard(1, { due: new Date(2026, 0, 8), cardType: "topic" })
    ]
    const result = computeIrTodayRemaining({
      cards,
      configuredDailyLimit: 10,
      usedCompletedCount: 10,
      now
    })
    expect(result.remainingCount).toBe(0)
    expect(result.costSeconds).toBe(0)
  })
})

describe("ceilSecondsToMinutes / completed", () => {
  it("ceils seconds to user minutes", () => {
    expect(ceilSecondsToMinutes(0)).toBe(0)
    expect(ceilSecondsToMinutes(1)).toBe(1)
    expect(ceilSecondsToMinutes(60)).toBe(1)
    expect(ceilSecondsToMinutes(61)).toBe(2)
  })

  it("ir reading completed excludes reviewProcessed", () => {
    expect(
      irReadingCompletedFromTotals({
        topicProcessed: 2,
        extractProcessed: 3,
        completedCount: 10,
        reviewProcessed: 5
      })
    ).toBe(5)
  })

  it("mixed completed does not double-count review in unified sum", () => {
    const summary = buildTodayLearningSummary({
      srs: {
        status: "ok",
        data: {
          remainingCount: 2,
          costSeconds: 90,
          usedNew: 0,
          usedReview: 1,
          completedCardKeys: 3,
          queue: []
        }
      },
      ir: {
        status: "ok",
        data: {
          remainingCount: 1,
          costSeconds: 120,
          topics: 0,
          extracts: 1,
          dueCards: [],
          uncappedDueCount: 1,
          effectiveRemainingCap: null
        }
      },
      irReadingCompleted: { status: "ok", data: 4 },
      dateKey: "2026-01-10"
    })
    expect(summary.completedUnified).toBe(3 + 4)
    expect(summary.remainingTotal).toBe(3)
    expect(summary.estimatedMinutes).toBe(ceilSecondsToMinutes(210))
  })

  it("completedUnified is null when completion stats fail", () => {
    const summary = buildTodayLearningSummary({
      srs: {
        status: "ok",
        data: {
          remainingCount: 1,
          costSeconds: 45,
          usedNew: 0,
          usedReview: 0,
          completedCardKeys: 2,
          queue: []
        }
      },
      ir: {
        status: "ok",
        data: {
          remainingCount: 0,
          costSeconds: 0,
          topics: 0,
          extracts: 0,
          dueCards: [],
          uncappedDueCount: 0,
          effectiveRemainingCap: 0
        }
      },
      irReadingCompleted: { status: "error", error: new Error("stats") },
      dateKey: "2026-01-10"
    })
    expect(summary.completedUnified).toBeNull()
    expect(summary.srsCompleted).toBe(2)
    expect(summary.irReadingCompleted).toBeNull()
  })
})

describe("buildTodayLearningSummary status", () => {
  it("empty when zero tasks", () => {
    const summary = buildTodayLearningSummary({
      srs: {
        status: "ok",
        data: {
          remainingCount: 0,
          costSeconds: 0,
          usedNew: 0,
          usedReview: 0,
          completedCardKeys: 5,
          queue: []
        }
      },
      ir: {
        status: "ok",
        data: {
          remainingCount: 0,
          costSeconds: 0,
          topics: 0,
          extracts: 0,
          dueCards: [],
          uncappedDueCount: 0,
          effectiveRemainingCap: null
        }
      },
      irReadingCompleted: { status: "ok", data: 2 },
      dateKey: "2026-01-10"
    })
    expect(summary.loadStatus).toBe("empty")
    expect(summary.recommendation).toContain("今天已完成")
  })

  it("error when both sides fail — does not fake zeros as success", () => {
    const summary = buildTodayLearningSummary({
      srs: { status: "error", error: new Error("logs failed") },
      ir: { status: "error", error: new Error("collect failed") },
      irReadingCompleted: { status: "error", error: new Error("stats") },
      dateKey: "2026-01-10"
    })
    expect(summary.loadStatus).toBe("error")
    expect(summary.srsRemaining).toBeNull()
    expect(summary.irRemaining).toBeNull()
    expect(summary.remainingTotal).toBeNull()
    expect(summary.estimatedMinutes).toBeNull()
    expect(summary.errorMessage).toContain("暂时无法读取")
  })

  it("partial does not claim exact total or partial-side exact remaining", () => {
    const summary = buildTodayLearningSummary({
      srs: {
        status: "ok",
        data: {
          remainingCount: 2,
          costSeconds: 90,
          usedNew: 0,
          usedReview: 0,
          completedCardKeys: 0,
          queue: []
        }
      },
      ir: {
        status: "partial",
        data: {
          remainingCount: 3,
          costSeconds: 100,
          topics: 1,
          extracts: 2,
          dueCards: [],
          uncappedDueCount: 5,
          effectiveRemainingCap: null
        },
        warning: "部分阅读卡片读取失败"
      },
      irReadingCompleted: { status: "ok", data: 0 },
      dateKey: "2026-01-10"
    })
    expect(summary.loadStatus).toBe("partial")
    expect(summary.errorMessage).toContain("部分内容")
    // 统一 total / ETA 必须 null
    expect(summary.remainingTotal).toBeNull()
    expect(summary.estimatedMinutes).toBeNull()
    // SRS 精确侧可展示；partial IR 侧不得展示精确 remaining
    expect(summary.srsRemaining).toBe(2)
    expect(summary.irRemaining).toBeNull()
  })

  it("IR stats error makes IR remaining error side (SRS can stay ok as partial page)", () => {
    const summary = buildTodayLearningSummary({
      srs: {
        status: "ok",
        data: {
          remainingCount: 4,
          costSeconds: 180,
          usedNew: 0,
          usedReview: 0,
          completedCardKeys: 1,
          queue: []
        }
      },
      ir: {
        status: "error",
        error: new Error("今日 IR 额度读取失败")
      },
      irReadingCompleted: {
        status: "error",
        error: new Error("今日 IR 额度读取失败")
      },
      dateKey: "2026-01-10"
    })
    expect(summary.loadStatus).toBe("partial")
    expect(summary.srsRemaining).toBe(4)
    expect(summary.irRemaining).toBeNull()
    expect(summary.remainingTotal).toBeNull()
    expect(summary.completedUnified).toBeNull()
  })
})

describe("requireIRDailyStatsForSession fail-closed", () => {
  it("returns error when load not ok", () => {
    const empty = createEmptyIRDailyStatsRecord("r", "p", "2026-01-10")
    const gate = requireIRDailyStatsForSession({
      ok: false,
      error: new Error("disk"),
      record: empty
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error.message).toContain("disk")
  })

  it("returns used completed when ok", () => {
    const record = createEmptyIRDailyStatsRecord("r", "p", "2026-01-10")
    record.totals.completedCount = 7
    const gate = requireIRDailyStatsForSession({
      ok: true,
      record,
      fromStorage: true
    })
    expect(gate).toEqual({ ok: true, usedCompletedCount: 7 })
  })

  it("does not let mixed SRS reviews eat the IR reading quota", () => {
    const record = createEmptyIRDailyStatsRecord("r", "p", "2026-01-10")
    // 统一会话：3 条阅读 + 24 张记忆卡都算进 completedCount
    record.totals.completedCount = 27
    record.totals.reviewProcessed = 24
    const gate = requireIRDailyStatsForSession({
      ok: true,
      record,
      fromStorage: true
    })
    expect(gate).toEqual({ ok: true, usedCompletedCount: 3 })
    expect(
      irDailyQuotaUsedFromTotals({ completedCount: 2, reviewProcessed: 9 })
    ).toBe(0)
  })
})
