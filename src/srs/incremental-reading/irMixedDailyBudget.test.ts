import { describe, expect, it, vi } from "vitest"
import type { ReviewCard, ReviewLogEntry, SrsState } from "../types"
import {
  buildMixedEligibleReviewCardsFromDailyBudget,
  loadMixedEligibleReviewCards
} from "./irMixedDailyBudget"

function srsState(due: Date, isNew: boolean): SrsState {
  return {
    due,
    stability: 1,
    difficulty: 5,
    interval: 1,
    reps: isNew ? 0 : 1,
    lapses: 0,
    state: isNew ? 0 : 2,
    lastReviewed: null
  }
}

function card(
  id: number,
  opts: { isNew?: boolean; due?: Date } = {}
): ReviewCard {
  const due = opts.due ?? new Date(2026, 0, 10, 8)
  return {
    id,
    front: `f${id}`,
    back: `b${id}`,
    deck: "default",
    isNew: opts.isNew ?? false,
    srs: srsState(due, opts.isNew ?? false)
  } as unknown as ReviewCard
}

function log(
  cardId: number,
  previousState: "new" | "review"
): ReviewLogEntry {
  return {
    cardId,
    cardKey: `card:${cardId}`,
    previousState,
    deckName: "default"
  } as unknown as ReviewLogEntry
}

describe("buildMixedEligibleReviewCardsFromDailyBudget", () => {
  const now = new Date(2026, 0, 10, 12)

  it("caps mixed review candidates by review daily remaining", () => {
    const allCards = [
      card(1, { isNew: false, due: new Date(2026, 0, 10, 9) }),
      card(2, { isNew: false, due: new Date(2026, 0, 10, 9) }),
      card(3, { isNew: false, due: new Date(2026, 0, 10, 9) }),
      card(4, { isNew: true, due: new Date(2026, 0, 10, 9) })
    ]
    // already used 1 review → remaining review limit 1 when configured 2
    const result = buildMixedEligibleReviewCardsFromDailyBudget({
      allCards,
      todayLogs: [log(99, "review")],
      rawNewCardsPerDay: 30,
      rawReviewCardsPerDay: 2,
      now
    })
    expect(result.remainingLimits.reviewCardsPerDay).toBe(1)
    expect(result.eligibleReviewCards).toHaveLength(1)
    expect(result.eligibleReviewCards.every((c) => !c.isNew)).toBe(true)
  })

  it("excludes new cards even if new quota remains", () => {
    const result = buildMixedEligibleReviewCardsFromDailyBudget({
      allCards: [
        card(1, { isNew: true, due: new Date(2026, 0, 10, 9) }),
        card(2, { isNew: false, due: new Date(2026, 0, 10, 9) })
      ],
      todayLogs: [],
      rawNewCardsPerDay: 30,
      rawReviewCardsPerDay: 200,
      now
    })
    expect(result.eligibleReviewCards.map((c) => c.id)).toEqual([2])
  })
})

describe("loadMixedEligibleReviewCards", () => {
  it("propagates getReviewLogs failure (fail-closed)", async () => {
    await expect(
      loadMixedEligibleReviewCards("p", new Date(2026, 0, 10), {
        collectReviewCards: vi.fn(async () => [card(1)]),
        getReviewLogs: vi.fn(async () => {
          throw new Error("logs unavailable")
        }),
        getReviewSettings: () => ({
          newCardsPerDay: 30,
          reviewCardsPerDay: 200
        })
      })
    ).rejects.toThrow("logs unavailable")
  })

  it("loads and applies budget via deps", async () => {
    const result = await loadMixedEligibleReviewCards(
      "p",
      new Date(2026, 0, 10, 12),
      {
        collectReviewCards: vi.fn(async () => [
          card(1, { isNew: false, due: new Date(2026, 0, 10, 9) }),
          card(2, { isNew: false, due: new Date(2026, 0, 10, 9) })
        ]),
        getReviewLogs: vi.fn(async () => [log(50, "review")]),
        getReviewSettings: () => ({
          newCardsPerDay: 30,
          reviewCardsPerDay: 1
        })
      }
    )
    // configured 1, used 1 → remaining 0 review
    expect(result.eligibleReviewCards).toHaveLength(0)
    expect(result.remainingLimits.reviewCardsPerDay).toBe(0)
  })
})
