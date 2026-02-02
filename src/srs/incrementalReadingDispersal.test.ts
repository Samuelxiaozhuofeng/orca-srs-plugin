import { describe, expect, it } from "vitest"
import { computeDispersedIntervalDays, computeDueFromIntervalDays } from "./incrementalReadingDispersal"

describe("incrementalReadingDispersal", () => {
  it("should compute due from intervalDays", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const due = computeDueFromIntervalDays(baseDate, 2)
    expect(due.getTime() - baseDate.getTime()).toBe(2 * 24 * 60 * 60 * 1000)
  })

  it("should be deterministic for same blockId + same local day", () => {
    const baseA = new Date(2026, 0, 15, 8, 0, 0)
    const baseB = new Date(2026, 0, 15, 23, 59, 59)
    const first = computeDispersedIntervalDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: baseA,
      baseIntervalDays: 10,
      isNew: false
    })
    const second = computeDispersedIntervalDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: baseB,
      baseIntervalDays: 10,
      isNew: false
    })
    expect(second).toBe(first)
  })

  it("should change across different local days", () => {
    const day1 = new Date(2026, 0, 15, 12, 0, 0)
    const day2 = new Date(2026, 0, 16, 12, 0, 0)
    const first = computeDispersedIntervalDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: day1,
      baseIntervalDays: 10,
      isNew: false
    })
    const second = computeDispersedIntervalDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: day2,
      baseIntervalDays: 10,
      isNew: false
    })
    expect(second).not.toBe(first)
  })

  it("should only disperse forward for new cards", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 1
    const interval = computeDispersedIntervalDays({
      blockId: 1,
      cardType: "extracts",
      baseDate,
      baseIntervalDays,
      isNew: true
    })
    expect(interval).toBeGreaterThanOrEqual(baseIntervalDays)
    expect(interval).toBeLessThanOrEqual(baseIntervalDays + 0.5)
  })

  it("should add queue delay for new cards", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 4
    const queueDelayDays = 4.5
    const interval = computeDispersedIntervalDays({
      blockId: 10,
      cardType: "extracts",
      baseDate,
      baseIntervalDays,
      isNew: true,
      queueDelayDays
    })
    // For extracts, forward max is base * 0.5 (no 1-day cap).
    expect(interval).toBeGreaterThanOrEqual(baseIntervalDays + queueDelayDays)
    expect(interval).toBeLessThanOrEqual(baseIntervalDays + queueDelayDays + baseIntervalDays * 0.5)
  })

  it("should disperse within expected ± range for non-new cards", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 10
    const interval = computeDispersedIntervalDays({
      blockId: 2,
      cardType: "topic",
      baseDate,
      baseIntervalDays,
      isNew: false
    })

    const ratio = 0.2
    const maxAbsDays = 2
    const maxAbs = Math.min(maxAbsDays, baseIntervalDays * ratio)
    expect(interval).toBeGreaterThanOrEqual(baseIntervalDays - maxAbs)
    expect(interval).toBeLessThanOrEqual(baseIntervalDays + maxAbs)
  })
})
