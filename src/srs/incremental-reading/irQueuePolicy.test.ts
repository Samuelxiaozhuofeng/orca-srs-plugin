import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import {
  adjustIntervalForPriorityChange,
  estimateCardCostSeconds,
  selectQueueWithPolicy,
  DEFAULT_QUEUE_POLICY
} from "./irQueuePolicy"

function card(partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType,
    priority: partial.priority ?? 50,
    position: partial.position ?? (partial.cardType === "topic" ? 1 : null),
    due: partial.due ?? new Date("2026-01-19T08:00:00"),
    intervalDays: partial.intervalDays ?? 5,
    postponeCount: partial.postponeCount ?? 0,
    stage: partial.cardType === "topic" ? "topic.preview" : "extract.raw",
    lastAction: "init",
    lastRead: partial.lastRead ?? null,
    readCount: partial.readCount ?? 0,
    isNew: partial.isNew ?? true,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("irQueuePolicy", () => {
  const now = new Date("2026-01-20T12:00:00")

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

    const result = selectQueueWithPolicy(cards, {
      ...DEFAULT_QUEUE_POLICY,
      timeBudgetMinutes: 10,
      dailyLimit: 8,
      seed: "2026-01-20"
    }, now)

    expect(result.queue.length).toBeLessThanOrEqual(8)
    expect(result.totalCostSeconds).toBeLessThanOrEqual(result.budgetSeconds + estimateCardCostSeconds(result.queue[0] ?? card({ id: 0, cardType: "extracts" })))
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

    const result = selectQueueWithPolicy(cards, {
      ...DEFAULT_QUEUE_POLICY,
      timeBudgetMinutes: 20,
      dailyLimit: 15,
      seed: "2026-01-20"
    }, now)

    const topicCount = result.queue.filter(c => c.cardType === "topic").length
    expect(topicCount).toBeGreaterThanOrEqual(1)
  })

  it("protects high-priority overdue cards", () => {
    const cards = [
      card({ id: 1, cardType: "extracts", priority: 90, due: new Date("2026-01-01"), isNew: false, readCount: 2 }),
      card({ id: 2, cardType: "extracts", priority: 10, due: new Date("2026-01-01"), isNew: false, readCount: 2 }),
      card({ id: 3, cardType: "topic", priority: 20, due: new Date("2026-01-20") })
    ]
    const result = selectQueueWithPolicy(cards, {
      ...DEFAULT_QUEUE_POLICY,
      timeBudgetMinutes: 10,
      dailyLimit: 2,
      seed: "2026-01-20"
    }, now)
    expect(result.queue.map(c => c.id)).toContain(1)
  })

  it("adjusts interval proportionally without hard reset", () => {
    const next = adjustIntervalForPriorityChange(30, 50, 80)
    expect(next).toBeGreaterThanOrEqual(30 * 0.6)
    expect(next).toBeLessThanOrEqual(30 * 1.6)
    expect(next).not.toBe(1)
  })
})
