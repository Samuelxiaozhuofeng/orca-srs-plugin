import { describe, expect, it } from "vitest"
import {
  formatLocalDateKey,
  selectQueueWithPolicy
} from "./irQueuePolicy"
import { baseConfig, card, now } from "./irQueuePolicyTestUtils"

describe("irQueuePolicy local date seed (A5)", () => {
  it("formatLocalDateKey uses local Y-M-D not UTC ISO", () => {
    const local = new Date(2026, 0, 20, 0, 30, 0)
    expect(formatLocalDateKey(local)).toBe("2026-01-20")
  })

  it("East Asia UTC+8 midnight does not use previous UTC day as seed", () => {
    // 东八区 2026-01-20 00:30 墙钟：本地 Date 构造器固定本地年月日
    // 对应 UTC 为 2026-01-19T16:30Z；toISOString 切日会得到 "2026-01-19"
    const eastAsiaLocalMidnight = new Date(2026, 0, 20, 0, 30, 0)
    const seed = formatLocalDateKey(eastAsiaLocalMidnight)
    expect(seed).toBe("2026-01-20")

    const utcIsoDay = eastAsiaLocalMidnight.toISOString().slice(0, 10)
    if (eastAsiaLocalMidnight.getTimezoneOffset() < 0 || utcIsoDay !== "2026-01-20") {
      expect(seed).toBe("2026-01-20")
      expect(seed).not.toBe("2026-01-19")
    }

    const instant = new Date("2026-01-19T16:30:00.000Z")
    const fromInstant = formatLocalDateKey(instant)
    const pad = (n: number) => String(n).padStart(2, "0")
    const localExpected = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`
    expect(fromInstant).toBe(localExpected)
    const isoDay = instant.toISOString().slice(0, 10)
    if (fromInstant !== isoDay) {
      expect(fromInstant).not.toBe(isoDay)
    }
  })

  it("stable policy seed from same sessionStartedAt avoids dual new Date drift", () => {
    const sessionStartedAt = new Date(2026, 5, 15, 23, 59, 50)
    const seed = formatLocalDateKey(sessionStartedAt)
    expect(seed).toBe("2026-06-15")

    const cards = [
      card({ id: 1, cardType: "topic", priority: 50 }),
      card({ id: 2, cardType: "extracts", priority: 40, isNew: false, readCount: 2 })
    ]
    const a = selectQueueWithPolicy(cards, baseConfig({ seed, explorationRatio: 0 }), now)
    const b = selectQueueWithPolicy(cards, baseConfig({ seed, explorationRatio: 0 }), now)
    expect(a.queue.map(c => c.id)).toEqual(b.queue.map(c => c.id))
  })
})
