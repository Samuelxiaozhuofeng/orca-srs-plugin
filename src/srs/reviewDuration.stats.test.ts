/**
 * FC-10：statisticsManager 全部时长累计入口 + 旧/新日志兼容
 */
import { describe, expect, it } from "vitest"
import type { ReviewLogEntry, CardState, Grade } from "./types"
import {
  calculateTodayStatistics,
  calculateReviewTimeStats,
} from "./statisticsManager"
import {
  calculateEffectiveDuration,
  effectiveDurationFromReviewLog,
  MAX_EFFECTIVE_CARD_DURATION_MS,
} from "./sessionProgressTracker"

function makeLog(
  overrides: Partial<ReviewLogEntry> & { timestamp: number; duration: number }
): ReviewLogEntry {
  return {
    id: `${overrides.timestamp}_x`,
    cardId: 1,
    blockId: 1,
    cardType: "basic",
    cardKey: "basic:1",
    legacy: false,
    deckName: "Default",
    grade: "good" as Grade,
    previousInterval: 1,
    newInterval: 2,
    previousState: "review" as CardState,
    newState: "review" as CardState,
    ...overrides,
  }
}

/** 构造「今天」中午的时间戳，避免边界 flaky */
function todayNoon(): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

describe("FC-10 statistics duration entries", () => {
  it("today totalTime uses effective helper (20s kept)", () => {
    const ts = todayNoon()
    const logs = [makeLog({ timestamp: ts, duration: 20_000 })]
    const stats = calculateTodayStatistics(logs)
    expect(stats.totalTime).toBe(20_000)
    expect(stats.totalTime).toBe(effectiveDurationFromReviewLog(logs[0]))
  })

  it("today totalTime caps historical 120s to 60s", () => {
    const ts = todayNoon()
    const logs = [makeLog({ timestamp: ts, duration: 120_000 })]
    const stats = calculateTodayStatistics(logs)
    expect(stats.totalTime).toBe(MAX_EFFECTIVE_CARD_DURATION_MS)
  })

  it("today totalTime maps neg/NaN to 0", () => {
    const ts = todayNoon()
    const logs = [
      makeLog({ timestamp: ts, duration: -100 }),
      makeLog({ timestamp: ts + 1, duration: Number.NaN, id: "nan" }),
    ]
    const stats = calculateTodayStatistics(logs)
    expect(stats.totalTime).toBe(0)
  })

  it("new logs: stats use duration not rawDuration", () => {
    const ts = todayNoon()
    const logs = [
      makeLog({
        timestamp: ts,
        duration: 25_000,
        rawDuration: 180_000,
      }),
    ]
    const stats = calculateTodayStatistics(logs)
    expect(stats.totalTime).toBe(25_000)
    expect(stats.totalTime).not.toBe(180_000)
    expect(stats.totalTime).not.toBe(60_000)
  })

  it("daily trend / review time stats same cap rules", () => {
    const day = new Date("2024-06-15T12:00:00Z")
    const start = new Date("2024-06-15T00:00:00Z")
    const end = new Date("2024-06-15T23:59:59Z")
    const logs = [
      makeLog({ timestamp: day.getTime(), duration: 10_000, id: "a" }),
      makeLog({ timestamp: day.getTime() + 1, duration: 120_000, id: "b" }),
      makeLog({
        timestamp: day.getTime() + 2,
        duration: 30_000,
        rawDuration: 99_000,
        id: "c",
      }),
      makeLog({ timestamp: day.getTime() + 3, duration: -5, id: "d" }),
    ]
    const stats = calculateReviewTimeStats(logs, start, end)
    // 10k + 60k + 30k + 0
    expect(stats.totalTime).toBe(100_000)
    const dayEntry = stats.dailyTime.find(
      (d) => d.date.toISOString().slice(0, 10) === "2024-06-15"
    )
    expect(dayEntry?.time).toBe(100_000)

    const manual = logs.reduce(
      (sum, log) => sum + effectiveDurationFromReviewLog(log),
      0
    )
    expect(stats.totalTime).toBe(manual)
  })

  it("effectiveDurationFromReviewLog matches calculateEffectiveDuration on duration", () => {
    const samples = [0, 1, 20_000, 60_000, 60_001, 120_000, -1, NaN, Infinity]
    for (const d of samples) {
      expect(effectiveDurationFromReviewLog({ duration: d })).toBe(
        calculateEffectiveDuration(d)
      )
    }
  })
})
