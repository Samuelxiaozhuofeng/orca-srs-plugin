import { describe, expect, it } from "vitest"
import type { IRCard } from "./incrementalReadingCollector"
import { buildIRQueue } from "./incrementalReadingCollector"

describe("incrementalReadingQueue", () => {
  it("should mix topic and extracts with quota and due ordering", async () => {
    const cards: IRCard[] = [
      { id: 1, cardType: "topic", priority: 5, position: 1, due: new Date("2025-01-01"), lastRead: null, readCount: 0, isNew: true },
      { id: 2, cardType: "topic", priority: 5, position: 2, due: new Date("2025-01-01"), lastRead: null, readCount: 0, isNew: true },
      { id: 3, cardType: "topic", priority: 5, position: 3, due: new Date("2025-01-01"), lastRead: null, readCount: 0, isNew: true },
      { id: 4, cardType: "extracts", priority: 5, position: null, due: new Date("2025-01-01"), lastRead: new Date(), readCount: 1, isNew: false },
      { id: 5, cardType: "extracts", priority: 9, position: null, due: new Date("2025-01-02"), lastRead: new Date(), readCount: 2, isNew: false },
      { id: 6, cardType: "extracts", priority: 7, position: null, due: new Date("2025-01-01"), lastRead: new Date(), readCount: 3, isNew: false }
    ]

    const queue = await buildIRQueue(cards, {
      topicQuotaPercent: 40,
      dailyLimit: 5,
      enableAutoDefer: false
    })
    expect(queue.map(card => card.id)).toEqual([1, 6, 4, 2, 5])
  })
})
