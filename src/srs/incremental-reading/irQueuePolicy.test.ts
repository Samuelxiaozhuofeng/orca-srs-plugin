import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import {
  adjustIntervalForPriorityChange,
  computeTopicFloor,
  estimateCardCostSeconds,
  selectQueueWithPolicy,
  topicQuotaPercentToMinRatio
} from "./irQueuePolicy"
import { baseConfig, card, now } from "./irQueuePolicyTestUtils"

describe("irQueuePolicy", () => {
  it("never exceeds time budget and daily safety limit", () => {
    const cards: IRCard[] = []
    for (let i = 0; i < 50; i++) {
      cards.push(card({
        id: i + 1,
        cardType: i % 5 === 0 ? "topic" : "extracts",
        priority: 40 + (i % 50),
        due: new Date("2026-01-10T08:00:00"),
        isNew: false,
        readCount: 2
      }))
    }

    const result = selectQueueWithPolicy(cards, baseConfig({
      timeBudgetMinutes: 10,
      dailyLimit: 8
    }), now)

    expect(result.queue.length).toBeLessThanOrEqual(8)
    expect(result.totalCostSeconds).toBeLessThanOrEqual(
      result.budgetSeconds +
        estimateCardCostSeconds(result.queue[0] ?? card({ id: 0, cardType: "extracts" }))
    )
    if (result.queue.length > 1) {
      expect(result.totalCostSeconds).toBeLessThanOrEqual(result.budgetSeconds)
    }
  })

  it("keeps topic exposure when many overdue extracts exist", () => {
    const cards: IRCard[] = []
    for (let i = 0; i < 100; i++) {
      cards.push(card({
        id: 1000 + i,
        cardType: "extracts",
        priority: 60,
        due: new Date("2026-01-01T08:00:00"),
        isNew: false,
        readCount: 3
      }))
    }
    for (let i = 0; i < 5; i++) {
      cards.push(card({
        id: 10 + i,
        cardType: "topic",
        priority: 50,
        due: new Date("2026-01-20T08:00:00"),
        position: i + 1
      }))
    }

    const result = selectQueueWithPolicy(cards, baseConfig({
      timeBudgetMinutes: 20,
      dailyLimit: 15
    }), now)

    const topicCount = result.queue.filter(c => c.cardType === "topic").length
    expect(topicCount).toBeGreaterThanOrEqual(1)
  })

  it("protects high-priority overdue cards", () => {
    const cards = [
      card({ id: 1, cardType: "extracts", priority: 90, due: new Date("2026-01-01"), isNew: false, readCount: 2 }),
      card({ id: 2, cardType: "extracts", priority: 10, due: new Date("2026-01-01"), isNew: false, readCount: 2 }),
      card({ id: 3, cardType: "topic", priority: 20, due: new Date("2026-01-20") })
    ]
    const result = selectQueueWithPolicy(cards, baseConfig({
      timeBudgetMinutes: 10,
      dailyLimit: 2
    }), now)
    expect(result.queue.map(c => c.id)).toContain(1)
  })

  it("adjusts interval proportionally without hard reset (cardType clamp)", () => {
    const next = adjustIntervalForPriorityChange("topic", 30, 50, 80)
    expect(next).toBeGreaterThanOrEqual(30 * 0.6)
    expect(next).toBeLessThanOrEqual(30 * 1.6)
    expect(next).not.toBe(1)
    // Extract 不得越过 30 天上限
    const extractAtCap = adjustIntervalForPriorityChange("extracts", 30, 50, 20)
    expect(extractAtCap).toBeLessThanOrEqual(30)
    // Topic 不得越过 60
    const topicAtCap = adjustIntervalForPriorityChange("topic", 60, 50, 20)
    expect(topicAtCap).toBeLessThanOrEqual(60)
  })

  describe("A1 topicQuotaPercent → topicMinRatio", () => {
    it("clamps percent to 0..100 and maps to 0..1 ratio", () => {
      expect(topicQuotaPercentToMinRatio(20)).toBe(0.2)
      expect(topicQuotaPercentToMinRatio(0)).toBe(0)
      expect(topicQuotaPercentToMinRatio(100)).toBe(1)
      expect(topicQuotaPercentToMinRatio(-10)).toBe(0)
      expect(topicQuotaPercentToMinRatio(150)).toBe(1)
      expect(topicQuotaPercentToMinRatio(Number.NaN)).toBe(0.2)
      expect(topicQuotaPercentToMinRatio(undefined, 30)).toBe(0.3)
    })

    it("honors higher topicMinRatio from settings mapping", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 20; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 70,
          due: new Date("2026-01-10"),
          isNew: false,
          readCount: 2
        }))
      }
      for (let i = 0; i < 10; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "topic",
          priority: 40,
          due: new Date("2026-01-20")
        }))
      }

      const ratio = topicQuotaPercentToMinRatio(50)
      const result = selectQueueWithPolicy(cards, baseConfig({
        topicMinRatio: ratio,
        topicMinCount: 1,
        dailyLimit: 10,
        timeBudgetMinutes: 30,
        explorationRatio: 0
      }), now)

      const topicCount = result.queue.filter(c => c.cardType === "topic").length
      const floor = computeTopicFloor(result.queue.length, ratio, 1, 10)
      expect(topicCount).toBeGreaterThanOrEqual(floor)
    })
  })
})
