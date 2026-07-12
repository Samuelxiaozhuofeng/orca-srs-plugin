/**
 * FC-10：有效时长归一化、会话进度与展示边界
 */
import { describe, expect, it } from "vitest"
import type { ReviewLogEntry } from "./types"
import {
  MAX_EFFECTIVE_CARD_DURATION_MS,
  IDLE_TIMEOUT_THRESHOLD,
  calculateEffectiveDuration,
  safeRawDuration,
  computeReviewTiming,
  effectiveDurationFromReviewLog,
  createInitialProgressState,
  recordGrade,
  recordEffectiveGrade,
  formatDuration,
  generateStatsSummary,
} from "./sessionProgressTracker"

describe("sessionProgressTracker FC-10 duration", () => {
  it("exposes 60s cap as the single shared constant", () => {
    expect(MAX_EFFECTIVE_CARD_DURATION_MS).toBe(60_000)
    expect(IDLE_TIMEOUT_THRESHOLD).toBe(MAX_EFFECTIVE_CARD_DURATION_MS)
  })

  describe("calculateEffectiveDuration", () => {
    it("keeps values under 60s", () => {
      expect(calculateEffectiveDuration(0)).toBe(0)
      expect(calculateEffectiveDuration(20_000)).toBe(20_000)
      expect(calculateEffectiveDuration(59_999)).toBe(59_999)
    })

    it("caps above 60s to exactly 60000", () => {
      expect(calculateEffectiveDuration(60_000)).toBe(60_000)
      expect(calculateEffectiveDuration(60_001)).toBe(60_000)
      expect(calculateEffectiveDuration(120_000)).toBe(60_000)
      expect(calculateEffectiveDuration(1e12)).toBe(60_000)
    })

    it("maps negative / NaN / Infinity / non-number to 0", () => {
      expect(calculateEffectiveDuration(-1)).toBe(0)
      expect(calculateEffectiveDuration(-9999)).toBe(0)
      expect(calculateEffectiveDuration(NaN)).toBe(0)
      expect(calculateEffectiveDuration(Infinity)).toBe(0)
      expect(calculateEffectiveDuration(-Infinity)).toBe(0)
      expect(calculateEffectiveDuration(undefined)).toBe(0)
      expect(calculateEffectiveDuration(null)).toBe(0)
      expect(calculateEffectiveDuration("5000")).toBe(0)
      expect(calculateEffectiveDuration({})).toBe(0)
    })

    it("is idempotent for already-normalized values", () => {
      const once = calculateEffectiveDuration(90_000)
      expect(once).toBe(60_000)
      expect(calculateEffectiveDuration(once)).toBe(60_000)
      expect(calculateEffectiveDuration(calculateEffectiveDuration(20_000))).toBe(20_000)
    })
  })

  describe("safeRawDuration", () => {
    it("keeps finite non-negative wall values without 60s cap", () => {
      expect(safeRawDuration(120_000)).toBe(120_000)
      expect(safeRawDuration(0)).toBe(0)
      expect(safeRawDuration(45_000)).toBe(45_000)
    })

    it("maps negative / NaN / Infinity / non-number to 0", () => {
      expect(safeRawDuration(-100)).toBe(0)
      expect(safeRawDuration(NaN)).toBe(0)
      expect(safeRawDuration(Infinity)).toBe(0)
      expect(safeRawDuration(undefined)).toBe(0)
      expect(safeRawDuration("10")).toBe(0)
    })
  })

  describe("computeReviewTiming", () => {
    it("produces matching raw/effective under 60s from single now", () => {
      const start = 1_000_000
      const now = start + 25_000
      const t = computeReviewTiming(start, now)
      expect(t.timestamp).toBe(now)
      expect(t.rawDuration).toBe(25_000)
      expect(t.effectiveDuration).toBe(25_000)
    })

    it("caps effective at 60000 while preserving raw", () => {
      const start = 1_000_000
      const now = start + 120_000
      const t = computeReviewTiming(start, now)
      expect(t.timestamp).toBe(now)
      expect(t.rawDuration).toBe(120_000)
      expect(t.effectiveDuration).toBe(60_000)
    })

    it("handles clock rollback (negative wall) as zero", () => {
      const t = computeReviewTiming(2_000_000, 1_000_000)
      expect(t.rawDuration).toBe(0)
      expect(t.effectiveDuration).toBe(0)
      expect(t.timestamp).toBe(1_000_000)
    })
  })

  describe("effectiveDurationFromReviewLog", () => {
    it("old logs: 20s kept, 120s capped, neg/NaN -> 0", () => {
      expect(effectiveDurationFromReviewLog({ duration: 20_000 })).toBe(20_000)
      expect(effectiveDurationFromReviewLog({ duration: 120_000 })).toBe(60_000)
      expect(effectiveDurationFromReviewLog({ duration: -50 })).toBe(0)
      expect(effectiveDurationFromReviewLog({ duration: NaN })).toBe(0)
    })

    it("new logs: uses duration (effective), never adds rawDuration", () => {
      const log = { duration: 40_000, rawDuration: 120_000 }
      expect(effectiveDurationFromReviewLog(log)).toBe(40_000)
      // 若误用 raw 会得到 120k 再截断为 60k — 必须不是
      expect(effectiveDurationFromReviewLog(log)).not.toBe(60_000)
    })

    it("new logs with already-capped duration stay idempotent", () => {
      expect(
        effectiveDurationFromReviewLog({ duration: 60_000, rawDuration: 200_000 })
      ).toBe(60_000)
    })
  })

  describe("recordEffectiveGrade / recordGrade", () => {
    it("session state delta equals effective input for <60s", () => {
      const state = createInitialProgressState()
      const next = recordEffectiveGrade(state, "good", 15_000)
      expect(next.totalGradedCards).toBe(1)
      expect(next.effectiveReviewTime).toBe(15_000)
      expect(next.cardDurations).toEqual([15_000])
      expect(next.gradeDistribution.good).toBe(1)
    })

    it("session state caps >60s and rejects invalid", () => {
      let state = createInitialProgressState()
      state = recordEffectiveGrade(state, "hard", 90_000)
      expect(state.effectiveReviewTime).toBe(60_000)
      expect(state.cardDurations[0]).toBe(60_000)

      state = recordGrade(state, "again", -100)
      expect(state.effectiveReviewTime).toBe(60_000) // +0
      expect(state.cardDurations[1]).toBe(0)

      state = recordEffectiveGrade(state, "easy", NaN)
      expect(state.cardDurations[2]).toBe(0)
      expect(state.effectiveReviewTime).toBe(60_000)
    })

    it("log/session same effective when both use shared helpers", () => {
      const timing = computeReviewTiming(0, 45_000)
      const logLike: Pick<ReviewLogEntry, "duration" | "rawDuration"> = {
        duration: timing.effectiveDuration,
        rawDuration: timing.rawDuration,
      }
      const fromLog = effectiveDurationFromReviewLog(logLike)
      const state = recordEffectiveGrade(
        createInitialProgressState(),
        "good",
        timing.effectiveDuration
      )
      expect(fromLog).toBe(45_000)
      expect(state.effectiveReviewTime).toBe(45_000)
      expect(fromLog).toBe(state.cardDurations[0])
    })
  })

  describe("formatDuration / generateStatsSummary edge cases", () => {
    it("formatDuration never emits NaN:NaN", () => {
      expect(formatDuration(NaN)).toBe("00:00:00")
      expect(formatDuration(Infinity)).toBe("00:00:00")
      expect(formatDuration(-1000)).toBe("00:00:00")
      expect(formatDuration(undefined)).toBe("00:00:00")
      expect(formatDuration(3661000)).toBe("01:01:01")
      expect(formatDuration(0)).toBe("00:00:00")
    })

    it("generateStatsSummary sanitizes bad end time and durations", () => {
      const state = createInitialProgressState()
      state.sessionStartTime = 1_000_000
      state.effectiveReviewTime = Number.NaN
      state.totalGradedCards = 2
      const summary = generateStatsSummary(state, Number.NaN)
      expect(Number.isFinite(summary.totalSessionTime)).toBe(true)
      expect(summary.totalSessionTime).toBe(0)
      expect(summary.effectiveReviewTime).toBe(0)
      expect(Number.isFinite(summary.averageTimePerCard)).toBe(true)
      expect(formatDuration(summary.effectiveReviewTime)).toBe("00:00:00")
    })
  })
})
