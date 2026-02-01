import { describe, expect, it } from "vitest"
import type { IRCard } from "./incrementalReadingCollector"
import { buildIRQueue } from "./incrementalReadingCollector"

function makeCard(partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">): IRCard {
  const base: IRCard = {
    id: partial.id,
    cardType: partial.cardType,
    priority: 50,
    position: partial.cardType === "topic" ? 1 : null,
    due: new Date("2026-01-19T08:00:00"),
    intervalDays: 5,
    postponeCount: 0,
    stage: partial.cardType === "topic" ? "topic.preview" : "extract.raw",
    lastAction: "init",
    lastRead: null,
    readCount: 0,
    isNew: true,
    resumeBlockId: null
  }
  return { ...base, ...partial }
}

describe("incrementalReadingQueue", () => {
  it("should prioritize overdue extracts over topics (dailyLimit)", async () => {
    const now = new Date("2026-01-19T12:00:00")
    const cards: IRCard[] = [
      makeCard({ id: 1, cardType: "topic", priority: 100, position: 1, due: new Date("2026-01-19T08:00:00") }),
      makeCard({ id: 10, cardType: "extracts", priority: 80, due: new Date("2026-01-18T08:00:00"), isNew: false, lastRead: new Date("2026-01-01T00:00:00"), readCount: 1 })
    ]

    const queue = await buildIRQueue(cards, {
      topicQuotaPercent: 100,
      dailyLimit: 1,
      now
    })
    expect(queue.map(card => card.id)).toEqual([10])
  })

  it("should respect topicQuotaPercent when no overdue extracts", async () => {
    const now = new Date("2026-01-19T12:00:00")
    const cards: IRCard[] = [
      makeCard({ id: 1, cardType: "topic", priority: 90, position: 1, due: new Date("2026-01-19T08:00:00") }),
      makeCard({ id: 2, cardType: "topic", priority: 80, position: 2, due: new Date("2026-01-19T08:00:00") }),
      makeCard({ id: 10, cardType: "extracts", priority: 90, due: new Date("2026-01-19T08:00:00"), isNew: false, lastRead: new Date("2026-01-01T00:00:00"), readCount: 1 }),
      makeCard({ id: 11, cardType: "extracts", priority: 10, due: new Date("2026-01-19T08:00:00"), isNew: false, lastRead: new Date("2026-01-01T00:00:00"), readCount: 1 })
    ]

    const queue = await buildIRQueue(cards, {
      topicQuotaPercent: 50,
      dailyLimit: 2,
      now
    })
    expect(queue.map(card => card.id)).toEqual([1, 10])
  })

  it("should sort extracts by due then priority (no dailyLimit)", async () => {
    const cards: IRCard[] = [
      makeCard({ id: 21, cardType: "extracts", priority: 30, due: new Date("2026-01-19T08:00:00") }),
      makeCard({ id: 22, cardType: "extracts", priority: 90, due: new Date("2026-01-19T08:00:00") }),
      makeCard({ id: 23, cardType: "extracts", priority: 10, due: new Date("2026-01-20T08:00:00") })
    ]

    const queue = await buildIRQueue(cards, {
      topicQuotaPercent: 0,
      dailyLimit: 0
    })
    expect(queue.map(card => card.id)).toEqual([22, 21, 23])
  })
})
