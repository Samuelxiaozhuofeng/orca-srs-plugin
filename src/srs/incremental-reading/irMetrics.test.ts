import { describe, expect, it } from "vitest"
import {
  computeActionFailureRate,
  computeBreakpointRestoreRate,
  IRSessionMetrics
} from "./irMetrics"
import {
  addSessionPlannedItem,
  createSessionProgress,
  markSessionItemCompleted
} from "./irSessionProgress"
import { irDailyQuotaUsedFromTotals } from "../todayLearning/todayLearningSummary"

describe("IRSessionMetrics", () => {
  it("aggregates session load and action events without storing content", () => {
    const metrics = new IRSessionMetrics()
    metrics.record("session.start", 10)
    metrics.record("queue.load", 120)
    metrics.record("action.next", 4000, { cardType: "topic" })
    metrics.record("action.extract")
    metrics.record("action.itemize")
    metrics.record("action.failure", undefined, { kind: "itemize" })
    metrics.record("breakpoint.save")
    metrics.record("breakpoint.restore_failure")
    metrics.record("session.end", 2)

    const snap = metrics.getSnapshot()
    expect(snap.plannedCount).toBe(10)
    expect(snap.queueLoadMs).toBe(120)
    expect(snap.topicProcessed).toBe(1)
    expect(snap.extractCreated).toBe(1)
    expect(snap.itemCreated).toBe(1)
    expect(snap.itemizeFailure).toBe(1)
    expect(snap.breakpointSaveSuccess).toBe(1)
    expect(snap.breakpointRestoreFailure).toBe(1)
    expect(snap.completedCount).toBe(2)

    const events = metrics.getEvents()
    for (const event of events) {
      expect(JSON.stringify(event)).not.toMatch(/selectedText|body|content/)
    }
  })

  it("takes an undone 下一篇 back out of the processed counts", () => {
    const metrics = new IRSessionMetrics()
    metrics.record("action.next", 3000, { cardType: "topic" })
    metrics.record("action.next", 3000, { cardType: "extracts" })
    metrics.record("action.next.undo", undefined, { cardType: "extracts" })

    const snap = metrics.getSnapshot()
    expect(snap.completedCount).toBe(1)
    expect(snap.topicProcessed).toBe(1)
    expect(snap.extractProcessed).toBe(0)
  })

  it("never lets an undo push counters below zero", () => {
    const metrics = new IRSessionMetrics()
    metrics.record("action.next.undo", undefined, { cardType: "topic" })

    const snap = metrics.getSnapshot()
    expect(snap.completedCount).toBe(0)
    expect(snap.topicProcessed).toBe(0)
  })

  it("computes restore and failure rates", () => {
    const metrics = new IRSessionMetrics()
    metrics.record("breakpoint.restore")
    metrics.record("breakpoint.restore")
    metrics.record("breakpoint.restore_failure")
    metrics.record("action.extract")
    metrics.record("action.failure", undefined, { kind: "extract" })

    const snap = metrics.getSnapshot()
    expect(computeBreakpointRestoreRate(snap)).toBeCloseTo(2 / 3)
    expect(computeActionFailureRate(snap)).toBeCloseTo(0.5)
  })

  it("uses active time for durationMs: pause/resume excludes hidden gaps", () => {
    const metrics = new IRSessionMetrics()
    const t0 = 1_000_000
    const realNow = Date.now
    let fakeNow = t0
    Date.now = () => fakeNow
    try {
      metrics.record("session.start", 2)
      fakeNow = t0 + 10_000
      metrics.record("session.pause")
      // 隐藏 1 小时
      fakeNow = t0 + 10_000 + 3_600_000
      metrics.record("session.resume")
      fakeNow = t0 + 10_000 + 3_600_000 + 5_000
      metrics.record("session.end", 1)
      const snap = metrics.getSnapshot()
      // 仅 10s + 5s = 15s，不含 1 小时
      expect(snap.durationMs).toBe(15_000)
    } finally {
      Date.now = realNow
    }
  })

  it("increments plannedCount once per session.plan_more", () => {
    const metrics = new IRSessionMetrics()
    metrics.record("session.start", 3)
    metrics.record("session.plan_more", 1)
    expect(metrics.getSnapshot().plannedCount).toBe(4)
  })

  /**
   * 回归：会话内短期重学回流不得侵蚀 IR 阅读日额度。
   * session.end 曾用被 planned 封顶的 progress.completed 覆盖 completedCount，
   * 而 reviewProcessed 逐次累加不封顶 → 每回流一次，
   * irDailyQuotaUsedFromTotals 就少算一条阅读。
   */
  it("keeps the IR reading quota intact when review cards requeue mid-session", () => {
    const metrics = new IRSessionMetrics()
    // 队列：1 条阅读 + 2 张复习
    let progress = createSessionProgress(3)
    metrics.record("session.start", 3)

    metrics.record("action.next", 1000, { cardType: "topic" })
    progress = markSessionItemCompleted(progress)

    metrics.record("action.review")
    progress = markSessionItemCompleted(progress)

    // 第 2 张评 Again → 回流队尾：计划 +1，再处理一次
    metrics.record("action.review")
    progress = markSessionItemCompleted(addSessionPlannedItem(progress))

    metrics.record("action.review")
    progress = markSessionItemCompleted(progress)

    metrics.record("session.end", progress.completed)

    const snap = metrics.getSnapshot()
    expect(snap.reviewProcessed).toBe(3)
    expect(snap.completedCount).toBe(4)
    expect(snap.topicProcessed).toBe(1)
    // 真实读了 1 条 → 额度只能扣 1
    expect(irDailyQuotaUsedFromTotals(snap)).toBe(1)
  })

  it("never lets session.end shrink the accumulated completed count", () => {
    const metrics = new IRSessionMetrics()
    metrics.record("action.next", 1000, { cardType: "topic" })
    metrics.record("action.review")
    metrics.record("action.review")
    metrics.record("session.end", 1)
    expect(metrics.getSnapshot().completedCount).toBe(3)
  })
})
