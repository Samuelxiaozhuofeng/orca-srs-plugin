import { describe, expect, it } from "vitest"
import {
  computeDispersalOffsetDays,
  computeDispersedIntervalDays,
  computeDueFromIntervalDays,
  getNewForwardMaxDays,
  getNonNewMaxAbsDays,
  HIGH_IR_PRIORITY_THRESHOLD
} from "./incrementalReadingDispersal"

describe("incrementalReadingDispersal", () => {
  it("should compute due from intervalDays", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const due = computeDueFromIntervalDays(baseDate, 2)
    expect(due.getTime() - baseDate.getTime()).toBe(2 * 24 * 60 * 60 * 1000)
  })

  it("computeDispersedIntervalDays is compat: returns base only (no random)", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const base = 10
    expect(
      computeDispersedIntervalDays({
        blockId: 1,
        cardType: "topic",
        baseDate,
        baseIntervalDays: base,
        isNew: false
      })
    ).toBe(base)
    expect(
      computeDispersedIntervalDays({
        blockId: 999,
        cardType: "extracts",
        baseDate,
        baseIntervalDays: base,
        isNew: true
      })
    ).toBe(base)
    expect(
      computeDispersedIntervalDays({
        blockId: 1,
        cardType: "topic",
        baseDate,
        baseIntervalDays: Number.NaN,
        isNew: false
      })
    ).toBe(1)
  })

  it("must not fold queue delay into intentional intervalDays (compat)", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 4
    const withoutDelay = computeDispersedIntervalDays({
      blockId: 10,
      cardType: "extracts",
      baseDate,
      baseIntervalDays,
      isNew: true
    })
    const withIgnoredDelay = computeDispersedIntervalDays({
      blockId: 10,
      cardType: "extracts",
      baseDate,
      baseIntervalDays,
      isNew: true,
      queueDelayDays: 4.5
    })
    expect(withIgnoredDelay).toBe(withoutDelay)
    expect(withoutDelay).toBe(baseIntervalDays)
  })

  it("offset is deterministic for same blockId + same local day + same ordinal", () => {
    const baseA = new Date(2026, 0, 15, 8, 0, 0)
    const baseB = new Date(2026, 0, 15, 23, 59, 59)
    const first = computeDispersalOffsetDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: baseA,
      baseIntervalDays: 10,
      isNew: false,
      priority: 50,
      scheduleOrdinal: 2
    })
    const second = computeDispersalOffsetDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: baseB,
      baseIntervalDays: 10,
      isNew: false,
      priority: 50,
      scheduleOrdinal: 2
    })
    expect(second).toBe(first)
  })

  it("offset changes across different local days", () => {
    const day1 = new Date(2026, 0, 15, 12, 0, 0)
    const day2 = new Date(2026, 0, 16, 12, 0, 0)
    const first = computeDispersalOffsetDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: day1,
      baseIntervalDays: 10,
      isNew: false,
      priority: 50
    })
    const second = computeDispersalOffsetDays({
      blockId: 123,
      cardType: "extracts",
      baseDate: day2,
      baseIntervalDays: 10,
      isNew: false,
      priority: 50
    })
    expect(second).not.toBe(first)
  })

  it("new offset is always >= 0", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    for (let id = 1; id <= 50; id++) {
      const offset = computeDispersalOffsetDays({
        blockId: id,
        cardType: id % 2 === 0 ? "topic" : "extracts",
        baseDate,
        baseIntervalDays: 8,
        isNew: true,
        priority: 50,
        scheduleOrdinal: 0
      })
      expect(offset).toBeGreaterThanOrEqual(0)
    }
  })

  it("non-new offset stays within priority-aware ± window", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 10
    const priority = 50
    const offset = computeDispersalOffsetDays({
      blockId: 2,
      cardType: "topic",
      baseDate,
      baseIntervalDays,
      isNew: false,
      priority
    })
    const maxAbs = getNonNewMaxAbsDays("topic", baseIntervalDays, priority)
    // topic p<80: min(2, base*0.20) = 2
    expect(maxAbs).toBe(2)
    expect(offset).toBeGreaterThanOrEqual(-maxAbs)
    expect(offset).toBeLessThanOrEqual(maxAbs)
  })

  it("same base intervalDays across ids; offsets may differ", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const base = 8
    const intervals = [1000, 1001, 1002].map(id =>
      computeDispersedIntervalDays({
        blockId: id,
        cardType: "topic",
        baseDate,
        baseIntervalDays: base,
        isNew: true
      })
    )
    expect(new Set(intervals)).toEqual(new Set([base]))
    const offsets = [1000, 1001, 1002].map(id =>
      computeDispersalOffsetDays({
        blockId: id,
        cardType: "topic",
        baseDate,
        baseIntervalDays: base,
        isNew: true,
        priority: 50,
        scheduleOrdinal: 0
      })
    )
    // not required that all three differ, but at least one pair should differ with distinct ids
    const uniqueOffsets = new Set(offsets.map(o => o.toFixed(12)))
    expect(uniqueOffsets.size).toBeGreaterThanOrEqual(2)
  })

  it("high priority window is <= normal priority window", () => {
    const base = 8
    expect(getNewForwardMaxDays("topic", base, 90)).toBeLessThanOrEqual(
      getNewForwardMaxDays("topic", base, 50)
    )
    expect(getNewForwardMaxDays("extracts", base, 90)).toBeLessThanOrEqual(
      getNewForwardMaxDays("extracts", base, 50)
    )
    expect(getNonNewMaxAbsDays("topic", base, 90)).toBeLessThanOrEqual(
      getNonNewMaxAbsDays("topic", base, 50)
    )
    expect(getNonNewMaxAbsDays("extracts", base, 90)).toBeLessThanOrEqual(
      getNonNewMaxAbsDays("extracts", base, 50)
    )
    expect(HIGH_IR_PRIORITY_THRESHOLD).toBe(80)
  })

  it("batch: 20 new topics p=50 base=8 spread across local due days", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 8
    const priority = 50
    const offsets = Array.from({ length: 20 }, (_, i) =>
      computeDispersalOffsetDays({
        blockId: 1000 + i,
        cardType: "topic",
        baseDate,
        baseIntervalDays,
        isNew: true,
        priority,
        scheduleOrdinal: 0
      })
    )
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThanOrEqual(getNewForwardMaxDays("topic", baseIntervalDays, priority))
    }

    // Local calendar day of (baseDate + base + offset)
    const localDayKeys = offsets.map(offset => {
      const due = computeDueFromIntervalDays(baseDate, baseIntervalDays + offset)
      return `${due.getFullYear()}-${due.getMonth()}-${due.getDate()}`
    })
    const distinctDays = new Set(localDayKeys)
    expect(distinctDays.size).toBeGreaterThanOrEqual(3)

    const counts = new Map<string, number>()
    for (const key of localDayKeys) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const busiest = Math.max(...counts.values())
    // Offsets are deterministic per (blockId, local-day, ordinal) seed, and the
    // seed's dayStartMs depends on the runner's local timezone — the exact
    // histogram differs between local (+08:00) and CI (UTC; hit 11 there). A
    // tight upper bound would be flaky, so keep a loose anti-clustering guard:
    // a regression where everything lands on one day would report ~20 here.
    expect(busiest).toBeLessThanOrEqual(13)
  })

  it("batch high p=90: all new topic offsets in [0, min(1, 8*0.25)]", () => {
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const baseIntervalDays = 8
    const priority = 90
    const maxForward = getNewForwardMaxDays("topic", baseIntervalDays, priority)
    expect(maxForward).toBe(Math.min(1, 8 * 0.25))
    for (let i = 0; i < 20; i++) {
      const offset = computeDispersalOffsetDays({
        blockId: 1000 + i,
        cardType: "topic",
        baseDate,
        baseIntervalDays,
        isNew: true,
        priority,
        scheduleOrdinal: 0
      })
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThanOrEqual(maxForward)
    }
  })

  it("determinism: same ordinal/day yields same offset", () => {
    const baseDate = new Date(2026, 2, 1, 9, 30, 0)
    const a = computeDispersalOffsetDays({
      blockId: 42,
      cardType: "topic",
      baseDate,
      baseIntervalDays: 8,
      isNew: true,
      priority: 50,
      scheduleOrdinal: 0
    })
    const b = computeDispersalOffsetDays({
      blockId: 42,
      cardType: "topic",
      baseDate: new Date(2026, 2, 1, 22, 0, 0),
      baseIntervalDays: 8,
      isNew: true,
      priority: 50,
      scheduleOrdinal: 0
    })
    expect(b).toBe(a)
    const differentOrdinal = computeDispersalOffsetDays({
      blockId: 42,
      cardType: "topic",
      baseDate,
      baseIntervalDays: 8,
      isNew: true,
      priority: 50,
      scheduleOrdinal: 1
    })
    // ordinal is in seed; different ordinal should almost always change (assert inequality)
    expect(differentOrdinal).not.toBe(a)
  })

  it("priority is not in seed: same window inputs, different p still same rand path only if window uses same rand", () => {
    // Changing priority changes window size, not seed — so offsets scale with window, not re-seed.
    // At same card/day/ordinal, rand is identical; offset = rand * maxForward differs by maxForward only when both > 0.
    const baseDate = new Date(2026, 0, 15, 12, 0, 0)
    const low = computeDispersalOffsetDays({
      blockId: 7,
      cardType: "topic",
      baseDate,
      baseIntervalDays: 8,
      isNew: true,
      priority: 50,
      scheduleOrdinal: 0
    })
    const high = computeDispersalOffsetDays({
      blockId: 7,
      cardType: "topic",
      baseDate,
      baseIntervalDays: 8,
      isNew: true,
      priority: 90,
      scheduleOrdinal: 0
    })
    const maxLow = getNewForwardMaxDays("topic", 8, 50)
    const maxHigh = getNewForwardMaxDays("topic", 8, 90)
    // rand = offset / max (when max > 0)
    if (maxLow > 0 && maxHigh > 0) {
      const randLow = low / maxLow
      const randHigh = high / maxHigh
      expect(randLow).toBeCloseTo(randHigh, 10)
    }
  })
})
