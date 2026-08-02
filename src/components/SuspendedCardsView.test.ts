import { beforeAll, describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "../srs/types"

vi.mock("./SafeBlockPreview", () => ({ default: () => null }))

beforeAll(() => {
  ;(globalThis as unknown as { window: unknown }).window = {
    React: {
      useState: vi.fn(),
      useRef: vi.fn(),
      useEffect: vi.fn(),
      useMemo: vi.fn()
    }
  }
  ;(globalThis as unknown as { orca: unknown }).orca = {
    components: { Button: () => null }
  }
})

function card(clozeNumber: number): ReviewCard {
  return {
    id: 7,
    cardType: "cloze",
    clozeNumber,
    front: "front",
    back: "back",
    deck: "default",
    isNew: false,
    isSuspended: true,
    srs: {
      stability: 1,
      difficulty: 1,
      interval: 1,
      due: new Date(0),
      lastReviewed: new Date(0),
      reps: 1,
      lapses: 0
    }
  }
}

describe("SuspendedCardsView state helpers", () => {
  it("removes exactly one variant by stable cardKey", async () => {
    const { removeCardByKey } = await import("./SuspendedCardsView")
    const cards = [card(1), card(2)]
    const result = removeCardByKey(cards, "cloze:7:c1")
    expect(result.map((item) => item.clozeNumber)).toEqual([2])
    expect(cards).toHaveLength(2)
  })

  it("sets and clears a row error without mutating the previous map", async () => {
    const { applyRowError } = await import("./SuspendedCardsView")
    const initial = { "cloze:7:c2": "other" }
    const withError = applyRowError(initial, "cloze:7:c1", "backend failed")
    expect(withError).toEqual({
      "cloze:7:c1": "backend failed",
      "cloze:7:c2": "other"
    })
    expect(initial).toEqual({ "cloze:7:c2": "other" })
    expect(applyRowError(withError, "cloze:7:c1", null)).toEqual(initial)
  })
})
