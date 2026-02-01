import { describe, expect, it } from "vitest"
import type { IRCard } from "./incrementalReadingCollector"
import { buildIRQueue } from "./incrementalReadingCollector"

describe("incrementalReadingQueue", () => {
  it("should keep high priority cards in dailyLimit (strong guarantee)", async () => {
    const cards: IRCard[] = [
      { id: 1, cardType: "topic", effectivePriority: "中优先级", effectivePriorityRank: 2, priority: 5, position: 1, due: new Date("2025-01-01"), intervalDays: 5, postponeCount: 0, stage: "topic.preview", lastAction: "init", lastRead: null, readCount: 0, isNew: true, resumeBlockId: null },
      { id: 2, cardType: "topic", effectivePriority: "中优先级", effectivePriorityRank: 2, priority: 5, position: 2, due: new Date("2025-01-01"), intervalDays: 5, postponeCount: 0, stage: "topic.preview", lastAction: "init", lastRead: null, readCount: 0, isNew: true, resumeBlockId: null },
      { id: 3, cardType: "topic", effectivePriority: "中优先级", effectivePriorityRank: 2, priority: 5, position: 3, due: new Date("2025-01-01"), intervalDays: 5, postponeCount: 0, stage: "topic.preview", lastAction: "init", lastRead: null, readCount: 0, isNew: true, resumeBlockId: null },
      { id: 10, cardType: "extracts", effectivePriority: "高优先级", effectivePriorityRank: 3, priority: 5, position: null, due: new Date("2025-01-01"), intervalDays: 1, postponeCount: 0, stage: "extract.raw", lastAction: "init", lastRead: new Date(), readCount: 1, isNew: false, resumeBlockId: null },
      { id: 11, cardType: "extracts", effectivePriority: "低优先级", effectivePriorityRank: 1, priority: 5, position: null, due: new Date("2025-01-01"), intervalDays: 3, postponeCount: 0, stage: "extract.raw", lastAction: "init", lastRead: new Date(), readCount: 1, isNew: false, resumeBlockId: null }
    ]

    const queue = await buildIRQueue(cards, {
      topicQuotaPercent: 80,
      dailyLimit: 2,
      enableAutoDefer: false
    })
    expect(queue.map(card => card.id)).toEqual([1, 10])
  })

  it("should sort extracts by due then effectivePriorityRank", async () => {
    const cards: IRCard[] = [
      { id: 21, cardType: "extracts", effectivePriority: "中优先级", effectivePriorityRank: 2, priority: 5, position: null, due: new Date("2025-01-01"), intervalDays: 2, postponeCount: 0, stage: "extract.raw", lastAction: "init", lastRead: null, readCount: 0, isNew: true, resumeBlockId: null },
      { id: 22, cardType: "extracts", effectivePriority: "高优先级", effectivePriorityRank: 3, priority: 5, position: null, due: new Date("2025-01-01"), intervalDays: 1, postponeCount: 0, stage: "extract.raw", lastAction: "init", lastRead: null, readCount: 0, isNew: true, resumeBlockId: null },
      { id: 23, cardType: "extracts", effectivePriority: "低优先级", effectivePriorityRank: 1, priority: 5, position: null, due: new Date("2025-01-01"), intervalDays: 3, postponeCount: 0, stage: "extract.raw", lastAction: "init", lastRead: null, readCount: 0, isNew: true, resumeBlockId: null }
    ]

    const queue = await buildIRQueue(cards, {
      topicQuotaPercent: 0,
      dailyLimit: 0,
      enableAutoDefer: false
    })
    expect(queue.map(card => card.id)).toEqual([22, 21, 23])
  })
})
