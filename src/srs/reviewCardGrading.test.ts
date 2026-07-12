import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "./types"
import { gradeReviewCard } from "./reviewCardGrading"
import { ensureCardSrsStateWithInitialDue, updateSrsState } from "./storage"

vi.mock("./storage", () => ({
  updateSrsState: vi.fn(async () => {
    throw new Error("storage failed")
  }),
  updateClozeSrsState: vi.fn(),
  updateDirectionSrsState: vi.fn(),
  ensureCardSrsStateWithInitialDue: vi.fn(),
  invalidateBlockCache: vi.fn()
}))

vi.mock("./reviewLogStorage", () => ({
  saveReviewLog: vi.fn(),
  createReviewLogId: vi.fn(() => "log-1")
}))

vi.mock("./srsEvents", () => ({
  emitCardGraded: vi.fn(),
  emitCardPostponed: vi.fn(),
  emitCardSuspended: vi.fn()
}))

function sampleCard(): ReviewCard {
  return {
    id: 1,
    front: "Q",
    back: "A",
    srs: {
      stability: 1,
      difficulty: 5,
      interval: 2,
      due: new Date("2026-01-20T08:00:00"),
      lastReviewed: new Date("2026-01-10T08:00:00"),
      reps: 2,
      lapses: 0
    },
    isNew: false,
    deck: "Default"
  }
}

describe("reviewCardGrading", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { orca: unknown }).orca = {
      commands: {
        invokeEditorCommand: vi.fn(async () => undefined)
      }
    }
  })

  it("returns failure without throwing when grading fails", async () => {
    const result = await gradeReviewCard(sampleCard(), "good", "orca-srs", Date.now())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(String(result.error)).toContain("storage failed")
    }
  })

  it("unlocks the next list item without appending it to the current snapshot", async () => {
    const nextState = {
      ...sampleCard().srs,
      due: new Date("2026-01-21T00:00:00")
    }
    vi.mocked(updateSrsState).mockResolvedValueOnce({ state: nextState, log: {} } as never)
    vi.mocked(ensureCardSrsStateWithInitialDue).mockResolvedValueOnce(nextState)

    const card: ReviewCard = {
      ...sampleCard(),
      id: 10,
      listItemId: 11,
      listItemIndex: 1,
      listItemIds: [11, 12]
    }
    const result = await gradeReviewCard(card, "good", "orca-srs", Date.now())

    expect(result.ok).toBe(true)
    expect(ensureCardSrsStateWithInitialDue).toHaveBeenCalledWith(12, expect.any(Date))
    expect(orca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [12],
      [{ name: "srs.due", type: 5, value: expect.any(Date) }]
    )
  })

  it("keeps a successful grade when list progression fails", async () => {
    const nextState = {
      ...sampleCard().srs,
      due: new Date("2026-01-21T00:00:00")
    }
    vi.mocked(updateSrsState).mockResolvedValueOnce({ state: nextState, log: {} } as never)
    vi.mocked(ensureCardSrsStateWithInitialDue).mockRejectedValueOnce(new Error("list progression failed"))

    const result = await gradeReviewCard({
      ...sampleCard(),
      id: 10,
      listItemId: 11,
      listItemIndex: 1,
      listItemIds: [11, 12]
    }, "good", "orca-srs", Date.now())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.warning).toContain("list progression failed")
    }
  })
})
