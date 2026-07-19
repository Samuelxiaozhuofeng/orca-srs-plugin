import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import {
  computeNewExtractCap,
  computeTopicFloor,
  isNewExtract,
  selectQueueWithPolicy,
  MIN_EXPLORATION_QUEUE_LENGTH
} from "./irQueuePolicy"
import { baseConfig, card, now } from "./irQueuePolicyTestUtils"

describe("irQueuePolicy constraints (A2–A4)", () => {
  describe("A2 final newExtractMaxRatio", () => {
    it("final new-extract count respects cap from final queue length", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 30; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 70,
          due: new Date("2026-01-10"),
          isNew: true,
          readCount: 0
        }))
      }
      for (let i = 0; i < 30; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 40,
          due: new Date("2026-01-10"),
          isNew: false,
          readCount: 3
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        newExtractMaxRatio: 0.2,
        topicMinRatio: 0,
        topicMinCount: 0,
        dailyLimit: 10,
        explorationRatio: 0
      }), now)

      const n = result.queue.length
      const newCount = result.queue.filter(isNewExtract).length
      const cap = computeNewExtractCap(n, 0.2)
      expect(newCount).toBeLessThanOrEqual(cap)
      expect(cap).toBe(Math.floor(n * 0.2))
    })

    it("fill phase cannot reintroduce new extracts past final cap", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 15; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 75,
          due: new Date("2026-01-01"),
          isNew: true,
          readCount: 0
        }))
      }
      for (let i = 0; i < 15; i++) {
        cards.push(card({
          id: 200 + i,
          cardType: "extracts",
          priority: 30,
          due: new Date("2026-01-10"),
          isNew: false,
          readCount: 4
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        newExtractMaxRatio: 0.2,
        topicMinRatio: 0,
        topicMinCount: 0,
        dailyLimit: 10,
        explorationRatio: 0
      }), now)

      expect(result.queue.filter(isNewExtract).length).toBeLessThanOrEqual(
        computeNewExtractCap(result.queue.length, 0.2)
      )
    })

    it("newExtractMaxRatio 0 yields zero new extracts and keeps dailyLimit when mature packable", () => {
      // 高价值新 Extract 先入队；至少 5 张可装箱非新卡同成本量级
      const cards: IRCard[] = []
      for (let i = 0; i < 5; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 70,
          isNew: true,
          readCount: 0,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 5; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 40,
          isNew: false,
          readCount: 3,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        newExtractMaxRatio: 0,
        topicMinRatio: 0,
        topicMinCount: 0,
        dailyLimit: 5,
        timeBudgetMinutes: 30,
        explorationRatio: 0
      }), now)

      expect(result.queue.filter(isNewExtract)).toHaveLength(0)
      // 回归：不得因只删不回填而欠填（例如 4 张）
      expect(result.queue.length).toBe(5)
    })

    it("replaces excess new extracts with unselected non-new to avoid underfill", () => {
      const cards: IRCard[] = []
      // 多张高优先新 Extract + 足量同成本非新
      for (let i = 0; i < 8; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 72,
          isNew: true,
          readCount: 0,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 8; i++) {
        cards.push(card({
          id: 200 + i,
          cardType: "extracts",
          priority: 35,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        newExtractMaxRatio: 0,
        topicMinRatio: 0,
        topicMinCount: 0,
        dailyLimit: 5,
        timeBudgetMinutes: 30,
        explorationRatio: 0
      }), now)

      expect(result.queue.length).toBe(5)
      expect(result.queue.filter(isNewExtract)).toHaveLength(0)
    })

    it("does not use fixed-20 denominator when dailyLimit is unlimited", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 8; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 50 + i,
          isNew: true,
          readCount: 0,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 8; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 40,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        dailyLimit: 0,
        newExtractMaxRatio: 0.2,
        topicMinRatio: 0,
        topicMinCount: 0,
        timeBudgetMinutes: 10,
        explorationRatio: 0
      }), now)

      const n = result.queue.length
      expect(n).toBeGreaterThan(0)
      const finalCap = computeNewExtractCap(n, 0.2)
      expect(finalCap).toBe(Math.floor(n * 0.2))
      expect(result.queue.filter(isNewExtract).length).toBeLessThanOrEqual(finalCap)
      if (n < 20) {
        expect(finalCap).toBeLessThan(4)
      }
    })

    it("small queue: sole new extract stays non-empty with diagnostic when cap would be 0", () => {
      const cards = [
        card({ id: 1, cardType: "extracts", priority: 50, isNew: true, readCount: 0, due: new Date("2026-01-10") })
      ]
      const result = selectQueueWithPolicy(cards, baseConfig({
        newExtractMaxRatio: 0.2,
        topicMinRatio: 0,
        topicMinCount: 0,
        dailyLimit: 10,
        explorationRatio: 0
      }), now)

      expect(result.queue).toHaveLength(1)
      expect(isNewExtract(result.queue[0])).toBe(true)
      expect(
        result.diagnostics.some(
          d =>
            d.code === "new_extract_cap_unsatisfiable" &&
            d.reason === "sole_candidate"
        )
      ).toBe(true)
    })
  })

  describe("A3 topic floor final constraint", () => {
    it("final queue meets topic floor when topics and budget allow", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 20; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 55,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 5; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "topic",
          priority: 40,
          due: new Date("2026-01-20")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        topicMinRatio: 0.2,
        topicMinCount: 1,
        dailyLimit: 10,
        explorationRatio: 0
      }), now)

      const floor = computeTopicFloor(result.queue.length, 0.2, 1, 5)
      const topicCount = result.queue.filter(c => c.cardType === "topic").length
      expect(topicCount).toBeGreaterThanOrEqual(floor)
      expect(
        result.diagnostics.some(d => d.code === "topic_floor_unsatisfied")
      ).toBe(false)
    })

    it("exploration cannot remove topic-floor seats", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 3; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "topic",
          priority: 50,
          due: new Date("2026-01-20")
        }))
      }
      for (let i = 0; i < 20; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 40 + (i % 10),
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        topicMinRatio: 0.2,
        topicMinCount: 2,
        dailyLimit: 10,
        explorationRatio: 0.5,
        timeBudgetMinutes: 30
      }), now)

      const floor = computeTopicFloor(result.queue.length, 0.2, 2, 3)
      const topicCount = result.queue.filter(c => c.cardType === "topic").length
      expect(topicCount).toBeGreaterThanOrEqual(floor)
    })

    it("returns testable reason when topic floor is unsatisfiable", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 10; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 60,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }
      cards.push(card({
        id: 1,
        cardType: "topic",
        priority: 50,
        due: new Date("2026-01-20")
      }))

      const result = selectQueueWithPolicy(cards, baseConfig({
        topicMinRatio: 0,
        topicMinCount: 3,
        dailyLimit: 5,
        explorationRatio: 0
      }), now)

      const diag = result.diagnostics.find(d => d.code === "topic_floor_unsatisfied")
      expect(diag).toBeDefined()
      expect(diag?.reason).toBe("insufficient_topics")
      expect(diag?.detail?.availableTopics).toBe(1)
    })
  })

  describe("A4 exploration budget and quotas", () => {
    it("first card may exceed budget; later cards may not", () => {
      const cards = [
        card({ id: 1, cardType: "topic", priority: 90, isNew: true, readCount: 0 }),
        card({ id: 2, cardType: "extracts", priority: 50, isNew: true, readCount: 0 })
      ]
      const result = selectQueueWithPolicy(cards, baseConfig({
        timeBudgetMinutes: 1,
        dailyLimit: 10,
        topicMinRatio: 0,
        topicMinCount: 0,
        newExtractMaxRatio: 1,
        explorationRatio: 0
      }), now)

      expect(result.queue.length).toBeGreaterThanOrEqual(1)
      if (result.queue.length === 1) {
        expect(result.totalCostSeconds).toBeGreaterThan(result.budgetSeconds)
        expect(
          result.diagnostics.some(d => d.code === "first_card_exceeds_budget")
        ).toBe(true)
      } else {
        expect(result.totalCostSeconds).toBeLessThanOrEqual(result.budgetSeconds)
      }
    })

    it("exploration rejects over-budget swaps and keeps total within budget for multi-card queues", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 8; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 70,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 5; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "topic",
          priority: 20,
          isNew: false,
          readCount: 5,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        timeBudgetMinutes: 5,
        dailyLimit: 20,
        topicMinRatio: 0,
        topicMinCount: 0,
        newExtractMaxRatio: 0,
        explorationRatio: 0.5
      }), now)

      if (result.queue.length > 1) {
        expect(result.totalCostSeconds).toBeLessThanOrEqual(result.budgetSeconds)
      }
    })

    it("when explorationRatio>0, queue>=4, legal pool exists → at least one explore attempt", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 10; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 80,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 5; i++) {
        cards.push(card({
          id: 200 + i,
          cardType: "extracts",
          priority: 10,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        explorationRatio: 0.05,
        topicMinRatio: 0,
        topicMinCount: 0,
        newExtractMaxRatio: 0,
        dailyLimit: 6,
        timeBudgetMinutes: 30
      }), now)

      expect(result.queue.length).toBeGreaterThanOrEqual(MIN_EXPLORATION_QUEUE_LENGTH)
      const skippedSmall = result.diagnostics.some(
        d => d.code === "exploration_skipped" && d.reason === "queue_too_small"
      )
      expect(skippedSmall).toBe(false)
      const noLegal = result.diagnostics.find(d => d.code === "exploration_no_legal_swap")
      if (noLegal) {
        expect(Number(noLegal.detail?.attemptedSlots ?? 0)).toBeGreaterThanOrEqual(1)
      }
    })

    it("short queue below min length skips exploration with diagnostic", () => {
      const cards = [
        card({ id: 1, cardType: "extracts", priority: 50, isNew: false, readCount: 2 }),
        card({ id: 2, cardType: "extracts", priority: 40, isNew: false, readCount: 2 }),
        card({ id: 3, cardType: "extracts", priority: 30, isNew: false, readCount: 2 }),
        card({ id: 99, cardType: "extracts", priority: 5, isNew: false, readCount: 2 })
      ]
      const result = selectQueueWithPolicy(cards, baseConfig({
        dailyLimit: 3,
        explorationRatio: 0.05,
        topicMinRatio: 0,
        topicMinCount: 0,
        newExtractMaxRatio: 0
      }), now)

      expect(result.queue.length).toBeLessThan(MIN_EXPLORATION_QUEUE_LENGTH)
      expect(
        result.diagnostics.some(
          d => d.code === "exploration_skipped" && d.reason === "queue_too_small"
        )
      ).toBe(true)
    })

    it("exploration cannot break new-extract cap", () => {
      const cards: IRCard[] = []
      for (let i = 0; i < 6; i++) {
        cards.push(card({
          id: 1 + i,
          cardType: "extracts",
          priority: 70,
          isNew: false,
          readCount: 2,
          due: new Date("2026-01-10")
        }))
      }
      for (let i = 0; i < 6; i++) {
        cards.push(card({
          id: 100 + i,
          cardType: "extracts",
          priority: 15,
          isNew: true,
          readCount: 0,
          due: new Date("2026-01-10")
        }))
      }

      const result = selectQueueWithPolicy(cards, baseConfig({
        newExtractMaxRatio: 0.2,
        topicMinRatio: 0,
        topicMinCount: 0,
        dailyLimit: 5,
        explorationRatio: 0.5,
        timeBudgetMinutes: 30
      }), now)

      expect(result.queue.filter(isNewExtract).length).toBeLessThanOrEqual(
        computeNewExtractCap(result.queue.length, 0.2)
      )
    })
  })
})
