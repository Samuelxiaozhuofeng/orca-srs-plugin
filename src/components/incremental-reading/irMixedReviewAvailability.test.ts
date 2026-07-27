import { describe, expect, it, vi } from "vitest"
import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import { cardKeyFromReviewCard } from "../../srs/cardIdentity"
import type { BlockExistenceResult } from "../../srs/blockExistence"
import {
  phaseFromRequiredBlocksOutcome,
  preflightMixedReviewCard
} from "./irMixedReviewAvailability"
import { decideRequiredBlocksOutcome } from "../../srs/reviewSessionBlockLoad"

function makeCard(overrides: Partial<ReviewCard> & { id: DbId }): ReviewCard {
  const { id, cardType, clozeNumber, directionType, listItemId, listItemIndex, listItemIds, ...rest } =
    overrides
  return {
    front: "q",
    back: "a",
    deck: "d",
    isNew: false,
    srs: {
      stability: 1,
      difficulty: 5,
      interval: 1,
      due: new Date(2026, 0, 1),
      lastReviewed: null,
      reps: 1,
      lapses: 0,
      state: 2
    },
    ...rest,
    id,
    cardType: cardType ?? "basic",
    clozeNumber,
    directionType,
    listItemId,
    listItemIndex,
    listItemIds
  } as ReviewCard
}

function exists(blockId: DbId): BlockExistenceResult {
  return {
    status: "exists",
    blockId,
    block: { id: blockId } as never
  }
}

function missing(blockId: DbId): BlockExistenceResult {
  return { status: "missing", blockId }
}

function unknown(blockId: DbId, error = new Error("timeout")): BlockExistenceResult {
  return { status: "unknown", blockId, error }
}

describe("phaseFromRequiredBlocksOutcome", () => {
  it("maps ready / missing / unknown", () => {
    const key = "basic:1"
    expect(
      phaseFromRequiredBlocksOutcome(decideRequiredBlocksOutcome(key, [exists(1 as DbId)]))
    ).toEqual({ status: "ready", cardKey: key })

    const drop = phaseFromRequiredBlocksOutcome(
      decideRequiredBlocksOutcome(key, [missing(1 as DbId)])
    )
    expect(drop.status).toBe("missing")
    if (drop.status === "missing") {
      expect(drop.userMessage).toMatch(/不存在/)
    }

    const unk = phaseFromRequiredBlocksOutcome(
      decideRequiredBlocksOutcome(key, [unknown(1 as DbId)])
    )
    expect(unk.status).toBe("unknown")
    if (unk.status === "unknown") {
      expect(unk.userMessage).toMatch(/重试/)
    }
  })
})

describe("preflightMixedReviewCard", () => {
  it("state miss + backend exists => ready (writeToState requested)", async () => {
    const card = makeCard({ id: 42 as DbId })
    const resolve = vi.fn(async (blockId: DbId, opts?: { writeToState?: boolean }) => {
      expect(opts?.writeToState).toBe(true)
      return exists(blockId)
    })

    const phase = await preflightMixedReviewCard(card, {
      resolveBlockExistence: resolve as never
    })

    expect(phase).toEqual({
      status: "ready",
      cardKey: cardKeyFromReviewCard(card)
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith(42, { writeToState: true })
  })

  it("missing => missing phase, single required parent for basic", async () => {
    const card = makeCard({ id: 7 as DbId })
    const resolve = vi.fn(async (blockId: DbId) => missing(blockId))

    const phase = await preflightMixedReviewCard(card, {
      resolveBlockExistence: resolve as never
    })

    expect(phase.status).toBe("missing")
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it("list requires parent + list item; item unknown => unknown", async () => {
    const parent = 100 as DbId
    const item = 201 as DbId
    const card = makeCard({
      id: parent,
      cardType: "list",
      listItemId: item,
      listItemIndex: 1,
      listItemIds: [item]
    })

    const resolve = vi.fn(async (blockId: DbId) => {
      if (blockId === parent) return exists(parent)
      return unknown(blockId)
    })

    const phase = await preflightMixedReviewCard(card, {
      resolveBlockExistence: resolve as never
    })

    expect(phase.status).toBe("unknown")
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(resolve.mock.calls.map(c => c[0])).toEqual([parent, item])
  })

  it("unknown does not report ready", async () => {
    const card = makeCard({ id: 9 as DbId })
    const phase = await preflightMixedReviewCard(card, {
      resolveBlockExistence: async () => unknown(9 as DbId)
    })
    expect(phase.status).toBe("unknown")
    if (phase.status === "unknown") {
      expect(phase.cardKey).toBe(cardKeyFromReviewCard(card))
    }
  })
})
