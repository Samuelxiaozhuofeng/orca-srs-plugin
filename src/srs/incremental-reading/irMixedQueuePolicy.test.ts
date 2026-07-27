import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import type { ReviewCard } from "../types"
import { getCardKey } from "../childCardCollector"
import {
  buildMixedSessionQueue,
  filterEligibleReviewCards,
  hasConsecutiveReviews,
  interleaveReadingAndReviews,
  readingCardsToEntries,
  reviewCardsToEntries,
  reviewEntryKey,
  shouldRequeueReviewInSession,
  IR_MIXED_REVIEW_AUTO_ADVANCE_MS
} from "./irMixedQueuePolicy"

function reading(id: number): IRCard {
  return {
    id,
    cardType: "topic",
    priority: 50,
    position: 1,
    due: new Date("2026-01-20T08:00:00"),
    intervalDays: 5,
    postponeCount: 0,
    stage: "topic.preview",
    lastAction: "init",
    lastRead: null,
    readCount: 0,
    isNew: false,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

function review(
  partial: Partial<ReviewCard> & Pick<ReviewCard, "id">
): ReviewCard {
  const due = partial.srs?.due ?? new Date("2026-01-19T08:00:00")
  return {
    id: partial.id,
    front: partial.front ?? "front",
    back: partial.back ?? "back",
    srs: partial.srs ?? {
      stability: 1,
      difficulty: 5,
      interval: 3,
      due,
      lastReviewed: new Date("2026-01-10T08:00:00"),
      reps: 2,
      lapses: 0
    },
    isNew: partial.isNew ?? false,
    deck: partial.deck ?? "Default",
    clozeNumber: partial.clozeNumber,
    directionType: partial.directionType,
    listItemId: partial.listItemId
  }
}



describe("irMixedQueuePolicy", () => {
  const now = new Date("2026-01-20T12:00:00")

  it("returns only reading entries when mixed mode is disabled", () => {
    const readings = [reading(1), reading(2)]
    const result = buildMixedSessionQueue({
      enabled: false,
      readingQueue: readings,
      reviewCards: [review({ id: 100 })],
      now
    })

    expect(result.entries).toEqual(readingCardsToEntries(readings))
    expect(result.selectedReviewCount).toBe(0)
  })

  it("pushes every due review card, regardless of how few reading items exist", () => {
    // 旧口径：floor(2 * 0.3 / 0.7) = 0 张；再旧一点的时间盒口径也只放得下 20 多张
    const readings = [reading(1), reading(2)]
    const due = Array.from({ length: 100 }, (_, i) => review({ id: 100 + i }))
    const result = buildMixedSessionQueue({
      enabled: true,
      readingQueue: readings,
      reviewCards: due,
      now
    })

    expect(result.selectedReviewCount).toBe(100)
    expect(result.eligibleReviewCount).toBe(100)
    expect(result.entries).toHaveLength(102)
  })

  it("builds a review-only queue when nothing is due for reading", () => {
    const due = [review({ id: 100 }), review({ id: 101 })]
    const result = buildMixedSessionQueue({
      enabled: true,
      readingQueue: [],
      reviewCards: due,
      now
    })

    expect(result.entries).toEqual(reviewCardsToEntries(due))
    expect(result.selectedReviewCount).toBe(2)
  })

  it("falls back to pure reading queue when no due review cards exist", () => {
    const readings = [reading(1), reading(2)]
    const result = buildMixedSessionQueue({
      enabled: true,
      readingQueue: readings,
      reviewCards: [],
      now
    })

    expect(result.entries).toEqual(readingCardsToEntries(readings))
    expect(result.selectedReviewCount).toBe(0)
  })

  it("keeps new cards eligible but still excludes future-due cards", () => {
    const cards = [
      review({ id: 1, isNew: true }),
      review({
        id: 2,
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date("2026-01-21T08:00:00"),
          lastReviewed: new Date("2026-01-10T08:00:00"),
          reps: 2,
          lapses: 0
        }
      }),
      review({ id: 3 })
    ]

    const eligible = filterEligibleReviewCards(cards, now)
    expect(eligible.map(c => c.id)).toEqual([1, 3])
  })

  it("always starts with a reading entry when reading items exist", () => {
    const readings = [reading(1), reading(2), reading(3)]
    const reviews = Array.from({ length: 9 }, (_, i) => review({ id: 10 + i }))
    const entries = interleaveReadingAndReviews(readings, reviews)
    expect(entries[0].kind).toBe("reading")
  })

  it("does not produce consecutive review entries when reading items outnumber reviews", () => {
    const readings = Array.from({ length: 8 }, (_, i) => reading(i + 1))
    const reviews = Array.from({ length: 4 }, (_, i) => review({ id: 100 + i }))
    const entries = interleaveReadingAndReviews(readings, reviews)
    expect(hasConsecutiveReviews(entries)).toBe(false)
  })

  it("spreads a handful of reading items evenly through a long review queue", () => {
    // 6 篇阅读 + 100 张卡：阅读应均匀铺开，不是全堆在开头
    const readings = Array.from({ length: 6 }, (_, i) => reading(i + 1))
    const reviews = Array.from({ length: 100 }, (_, i) => review({ id: 100 + i }))
    const entries = interleaveReadingAndReviews(readings, reviews)

    expect(entries).toHaveLength(106)
    expect(new Set(entries.map(e => e.key)).size).toBe(106)
    const readingPositions = entries
      .map((e, idx) => (e.kind === "reading" ? idx : -1))
      .filter(idx => idx >= 0)
    expect(readingPositions).toHaveLength(6)
    expect(readingPositions[0]).toBe(0)
    // 相邻两篇阅读之间的间隔应接近均匀（100/6 ≈ 17）
    for (let i = 1; i < readingPositions.length; i++) {
      const gap = readingPositions[i] - readingPositions[i - 1]
      expect(gap).toBeGreaterThanOrEqual(14)
      expect(gap).toBeLessThanOrEqual(21)
    }
  })

  it("never drops entries when reviews outnumber reading items", () => {
    const readings = [reading(1), reading(2)]
    const reviews = Array.from({ length: 12 }, (_, i) => review({ id: 100 + i }))
    const entries = interleaveReadingAndReviews(readings, reviews)
    expect(entries).toHaveLength(14)
    expect(entries.filter(e => e.kind === "review")).toHaveLength(12)
    expect(entries.filter(e => e.kind === "reading")).toHaveLength(2)
    expect(new Set(entries.map(e => e.key)).size).toBe(14)
  })

  it("preserves reading and review relative order", () => {
    const readings = [reading(1), reading(2), reading(3)]
    const reviews = [review({ id: 10 }), review({ id: 11 })]
    const entries = interleaveReadingAndReviews(readings, reviews)
    const readingIds = entries.filter(e => e.kind === "reading").map(e => e.card.id)
    const reviewIds = entries.filter(e => e.kind === "review").map(e => e.card.id)
    expect(readingIds).toEqual([1, 2, 3])
    expect(reviewIds).toEqual([10, 11])
  })

  it("uses stable review keys for cloze and direction cards from same block", () => {
    const clozeA = review({ id: 42, clozeNumber: 1 })
    const clozeB = review({ id: 42, clozeNumber: 2 })
    const dirF = review({ id: 42, directionType: "forward" })
    const dirB = review({ id: 42, directionType: "backward" })

    const keys = [clozeA, clozeB, dirF, dirB].map(reviewEntryKey)
    expect(new Set(keys).size).toBe(4)
    expect(keys[0]).toBe(`review-${getCardKey(clozeA)}`)
  })

  it("does not mutate reading queue when new items are hypothetically added later", () => {
    const snapshot = [reading(1), reading(2)]
    const frozen = readingCardsToEntries(snapshot)
    snapshot.push(reading(99))
    expect(frozen).toHaveLength(2)
    expect(frozen[0].key).toBe("reading-1")
  })

  it("requeues short-relearn cards inside the session but not postponed ones", () => {
    const nowMs = now.getTime()
    const relearn = review({
      id: 300,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 0,
        due: new Date(nowMs + 10 * 60 * 1000),
        lastReviewed: now,
        reps: 3,
        lapses: 1
      }
    })
    expect(
      shouldRequeueReviewInSession({ grade: "again", updatedCard: relearn, nowMs })
    ).toBe(true)
    expect(
      shouldRequeueReviewInSession({ grade: "good", updatedCard: relearn, nowMs })
    ).toBe(false)

    const tomorrow = review({
      id: 301,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 1,
        due: new Date(nowMs + 24 * 60 * 60 * 1000),
        lastReviewed: now,
        reps: 3,
        lapses: 0
      }
    })
    expect(
      shouldRequeueReviewInSession({ grade: "again", updatedCard: tomorrow, nowMs })
    ).toBe(false)
  })

  it("uses named auto-advance delay within 600-1000ms", () => {
    expect(IR_MIXED_REVIEW_AUTO_ADVANCE_MS).toBeGreaterThanOrEqual(600)
    expect(IR_MIXED_REVIEW_AUTO_ADVANCE_MS).toBeLessThanOrEqual(1000)
  })
})
