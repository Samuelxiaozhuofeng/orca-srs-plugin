import { describe, expect, it } from "vitest"
import {
  computeActionFailureRate,
  computeBreakpointRestoreRate,
  IRSessionMetrics
} from "./irMetrics"

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
})
