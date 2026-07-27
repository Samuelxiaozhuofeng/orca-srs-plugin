import { describe, expect, it } from "vitest"
import {
  buildReviewQueue,
  clusterCardsByBatch,
  partitionDueAndNewCards
} from "./reviewQueueBuilder"
import type { ReviewCard } from "./types"

function card(
  id: number,
  dueOffsetMs: number,
  extra: Partial<ReviewCard> = {}
): ReviewCard {
  return {
    id,
    front: `front-${id}`,
    back: `back-${id}`,
    isNew: false,
    deck: "default",
    srs: {
      stability: 1,
      difficulty: 1,
      interval: 1,
      due: new Date(1_700_000_000_000 + dueOffsetMs),
      lastReviewed: new Date(1_699_000_000_000),
      reps: 1,
      lapses: 0
    },
    ...extra
  } as ReviewCard
}

describe("clusterCardsByBatch", () => {
  it("leaves a queue without batch ids untouched", () => {
    const cards = [card(1, 0), card(2, 100), card(3, 200)]
    expect(clusterCardsByBatch(cards).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it("pulls same-batch cards up to their earliest member", () => {
    // 同批的 1 和 4 原本被 2、3 隔开，聚簇后应紧邻
    const cards = [
      card(1, 0, { batchId: "ai-1" }),
      card(2, 100),
      card(3, 200),
      card(4, 300, { batchId: "ai-1" })
    ]
    expect(clusterCardsByBatch(cards).map((c) => c.id)).toEqual([1, 4, 2, 3])
  })

  it("keeps a single-card batch in place", () => {
    const cards = [card(1, 0), card(2, 100, { batchId: "ai-solo" }), card(3, 200)]
    expect(clusterCardsByBatch(cards).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it("anchors each batch independently and preserves batch order", () => {
    const cards = [
      card(1, 0, { batchId: "ai-a" }),
      card(2, 100, { batchId: "ai-b" }),
      card(3, 200, { batchId: "ai-a" }),
      card(4, 300, { batchId: "ai-b" })
    ]
    expect(clusterCardsByBatch(cards).map((c) => c.id)).toEqual([1, 3, 2, 4])
  })

  it("preserves within-batch due order", () => {
    const cards = [
      card(5, 0, { batchId: "ai-1" }),
      card(6, 50, { batchId: "ai-1" }),
      card(7, 90, { batchId: "ai-1" })
    ]
    expect(clusterCardsByBatch(cards).map((c) => c.id)).toEqual([5, 6, 7])
  })

  it("never drops or duplicates a card", () => {
    const cards = [
      card(1, 0, { batchId: "ai-a" }),
      card(2, 100),
      card(3, 200, { batchId: "ai-b" }),
      card(4, 300, { batchId: "ai-a" }),
      card(5, 400, { batchId: "ai-b" })
    ]
    const out = clusterCardsByBatch(cards)
    expect(out).toHaveLength(cards.length)
    expect(new Set(out.map((c) => c.id)).size).toBe(cards.length)
  })
})

describe("pending cards", () => {
  const now = new Date(1_700_000_500_000)

  it("are excluded from both due and new partitions", () => {
    const cards = [
      card(1, 0),
      card(2, 0, { isPending: true }),
      card(3, 0, { isNew: true, srs: card(3, 0).srs }),
      card(4, 0, { isNew: true, isPending: true })
    ]
    const { dueCards, newCards } = partitionDueAndNewCards(cards, now)
    expect(dueCards.map((c) => c.id)).toEqual([1])
    expect(newCards.map((c) => c.id)).toEqual([3])
  })

  it("never reach the built queue", () => {
    const cards = [card(1, 0), card(2, 0, { isPending: true })]
    const queue = buildReviewQueue(cards, null, now)
    expect(queue.map((c) => c.id)).toEqual([1])
  })

  it("do not consume the daily limit", () => {
    // pending 卡若占额度，激活前队列会莫名变短
    const cards = [
      card(1, 0, { isPending: true }),
      card(2, 100, { isPending: true }),
      card(3, 200),
      card(4, 300)
    ]
    const queue = buildReviewQueue(
      cards,
      { newCardsPerDay: 10, reviewCardsPerDay: 2 },
      now
    )
    expect(queue.map((c) => c.id)).toEqual([3, 4])
  })
})
