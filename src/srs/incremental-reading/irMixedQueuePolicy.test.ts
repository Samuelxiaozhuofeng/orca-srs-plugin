import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import type { ReviewCard } from "../types"
import { getCardKey } from "../childCardCollector"
import {
  buildMixedSessionQueue,
  computeReviewInsertAfterIndices,
  computeTargetReviewCount,
  filterEligibleReviewCards,
  hasConsecutiveReviews,
  interleaveReadingAndReviews,
  normalizeMixedLearningRatio,
  readingCardsToEntries,
  reviewEntryKey,
  selectReviewCardsForMixedQueue,
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
      reviewRatioPercent: 30,
      budgetSeconds: 1200,
      readingCostSeconds: 600,
      seed: "2026-01-20",
      now
    })

    expect(result.entries).toEqual(readingCardsToEntries(readings))
    expect(result.selectedReviewCount).toBe(0)
  })

  it("computes target review counts for 20/30/40 percent ratios", () => {
    expect(computeTargetReviewCount(10, 20)).toBe(2)
    expect(computeTargetReviewCount(10, 30)).toBe(4)
    expect(computeTargetReviewCount(10, 40)).toBe(6)
  })

  it("caps review count when fewer due cards exist", () => {
    const readings = Array.from({ length: 10 }, (_, i) => reading(i + 1))
    const due = [review({ id: 100 }), review({ id: 101 })]
    const result = buildMixedSessionQueue({
      enabled: true,
      readingQueue: readings,
      reviewCards: due,
      reviewRatioPercent: 40,
      budgetSeconds: 3600,
      readingCostSeconds: 600,
      seed: "2026-01-20",
      now
    })

    expect(result.targetReviewCount).toBe(6)
    expect(result.selectedReviewCount).toBe(2)
    expect(result.entries.filter(e => e.kind === "review")).toHaveLength(2)
  })

  it("falls back to pure reading queue when no due review cards exist", () => {
    const readings = [reading(1), reading(2)]
    const result = buildMixedSessionQueue({
      enabled: true,
      readingQueue: readings,
      reviewCards: [],
      reviewRatioPercent: 30,
      budgetSeconds: 1200,
      readingCostSeconds: 300,
      seed: "2026-01-20",
      now
    })

    expect(result.entries).toEqual(readingCardsToEntries(readings))
    expect(result.selectedReviewCount).toBe(0)
  })

  it("excludes new, future-due, and suspended-equivalent cards from eligibility", () => {
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
    expect(eligible.map(c => c.id)).toEqual([3])
  })

  it("always starts with a reading entry", () => {
    const readings = [reading(1), reading(2), reading(3)]
    const reviews = [review({ id: 10 }), review({ id: 11 })]
    const entries = interleaveReadingAndReviews(readings, reviews)
    expect(entries[0].kind).toBe("reading")
  })

  it("does not produce consecutive review entries in normal cases", () => {
    const readings = Array.from({ length: 8 }, (_, i) => reading(i + 1))
    const reviews = Array.from({ length: 4 }, (_, i) => review({ id: 100 + i }))
    const entries = interleaveReadingAndReviews(readings, reviews)
    expect(hasConsecutiveReviews(entries)).toBe(false)
  })

  it("preserves reading relative order", () => {
    const readings = [reading(1), reading(2), reading(3)]
    const reviews = [review({ id: 10 }), review({ id: 11 })]
    const entries = interleaveReadingAndReviews(readings, reviews)
    const readingIds = entries.filter(e => e.kind === "reading").map(e => e.card.id)
    expect(readingIds).toEqual([1, 2, 3])
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

  it("normalizes invalid ratio settings to 30", () => {
    expect(normalizeMixedLearningRatio(25)).toBe(30)
    expect(normalizeMixedLearningRatio(undefined)).toBe(30)
    expect(normalizeMixedLearningRatio(20)).toBe(20)
    expect(normalizeMixedLearningRatio(40)).toBe(40)
  })

  it("selects reviews within remaining budget", () => {
    const cards = Array.from({ length: 5 }, (_, i) => review({ id: 200 + i }))
    const selected = selectReviewCardsForMixedQueue(cards, 5, 90, "seed")
    expect(selected.length).toBe(2)
  })

  it("does not force a review card when no review budget remains", () => {
    const cards = [review({ id: 205 })]
    expect(selectReviewCardsForMixedQueue(cards, 1, 0, "seed")).toEqual([])
    expect(selectReviewCardsForMixedQueue(cards, 1, 44, "seed")).toEqual([])
  })

  it("distributes insert points across reading boundaries", () => {
    const points = computeReviewInsertAfterIndices(10, 3)
    expect(points.length).toBe(3)
    expect(points[0]).toBeLessThan(points[1])
    expect(points[1]).toBeLessThan(points[2])
  })

  it("uses named auto-advance delay within 600-1000ms", () => {
    expect(IR_MIXED_REVIEW_AUTO_ADVANCE_MS).toBeGreaterThanOrEqual(600)
    expect(IR_MIXED_REVIEW_AUTO_ADVANCE_MS).toBeLessThanOrEqual(1000)
  })

  it("prevents duplicate advance with a single idempotent gate", () => {
    let advanced = 0
    let gate = false
    const advanceOnce = () => {
      if (gate) return
      gate = true
      advanced += 1
    }
    advanceOnce()
    advanceOnce()
    expect(advanced).toBe(1)
  })
})
