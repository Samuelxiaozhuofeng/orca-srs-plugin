import { afterEach, describe, expect, it, vi } from "vitest"
import { CHAPTER_QUIZ_PANEL_VIEW } from "./chapterQuiz"
import {
  bindChapterQuizPanelRegistration,
  cancelSharedGeneration,
  createGenerationRegistry,
  createLiveSyncRegistry,
  createChapterQuizPanelNavDetail,
  isGenerationCurrent,
  mergeQuestionCardAdds,
  publishQuizLive,
  resolveQuizBlockIdFromPanelNav,
  shouldApplyChapterQuizPanelNav,
  startSharedGeneration,
  subscribeQuizLive,
  type ChapterQuizPanelNavDetail
} from "./chapterQuizLive"
import type { ChapterQuizRepr } from "./chapterQuiz"

describe("shared generation coordination", () => {
  it("registers the entry before work checks isCurrent", async () => {
    const reg = createGenerationRegistry()
    let currentAtStart = false
    const entry = startSharedGeneration(reg, 9, async ({ isCurrent }) => {
      currentAtStart = isCurrent()
    })

    await entry.promise
    expect(currentAtStart).toBe(true)
  })

  it("shares one AbortController; cancel from any path aborts work", async () => {
    const reg = createGenerationRegistry()
    let sawAbort = false
    const entry = startSharedGeneration(reg, 10, async ({ signal, isCurrent }) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          sawAbort = true
          resolve()
        })
        // hang until aborted
      })
      expect(isCurrent()).toBe(false)
    })

    // second start joins same generation
    const again = startSharedGeneration(reg, 10, async () => {
      throw new Error("should not start a second worker")
    })
    expect(again.generationId).toBe(entry.generationId)
    expect(again.controller).toBe(entry.controller)

    const cancelled = cancelSharedGeneration(reg, 10)
    expect(cancelled).toBe(true)
    expect(entry.cancelled).toBe(true)
    expect(isGenerationCurrent(reg, 10, entry.generationId)).toBe(false)

    await entry.promise
    expect(sawAbort).toBe(true)
    expect(getGone(reg, 10)).toBe(true)
  })

  it("late success is skipped when cancelled mid-flight", async () => {
    const reg = createGenerationRegistry()
    const writes: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })

    const entry = startSharedGeneration(
      reg,
      42,
      async ({ isCurrent }) => {
        writes.push("start")
        await gate
        if (!isCurrent()) {
          writes.push("skip-late")
          return
        }
        writes.push("success")
      }
    )

    cancelSharedGeneration(reg, 42)
    release()
    await entry.promise
    expect(writes).toEqual(["start", "skip-late"])
    expect(writes).not.toContain("success")
  })

  it("cancel on missing entry returns false", () => {
    const reg = createGenerationRegistry()
    expect(cancelSharedGeneration(reg, 999)).toBe(false)
  })
})

function getGone(
  reg: ReturnType<typeof createGenerationRegistry>,
  blockId: number
): boolean {
  return !reg.entries.has(blockId)
}

describe("live sync broadcast", () => {
  it("publishes to other instances only (no echo to self)", () => {
    const reg = createLiveSyncRegistry()
    const a = Symbol("a")
    const b = Symbol("b")
    const receivedA: ChapterQuizRepr[] = []
    const receivedB: ChapterQuizRepr[] = []
    const unsubA = subscribeQuizLive(reg, 1, a, (r) => receivedA.push(r))
    const unsubB = subscribeQuizLive(reg, 1, b, (r) => receivedB.push(r))

    const next = {
      type: "srs.chapter-quiz" as const,
      pluginName: "orca-srs",
      topicBlockId: 1,
      phase: "quiz" as const,
      questionCount: 2,
      currentIndex: 1
    }
    publishQuizLive(reg, 1, next, a)
    expect(receivedA).toHaveLength(0)
    expect(receivedB).toHaveLength(1)
    expect(receivedB[0].currentIndex).toBe(1)

    unsubA()
    unsubB()
    publishQuizLive(reg, 1, { ...next, currentIndex: 2 }, a)
    expect(receivedB).toHaveLength(1) // unsubscribed
  })

  it("unsubscribe is symmetric and removes empty sets", () => {
    const reg = createLiveSyncRegistry()
    const id = Symbol("x")
    const unsub = subscribeQuizLive(reg, 7, id, () => {})
    expect(reg.byBlock.has(7)).toBe(true)
    unsub()
    expect(reg.byBlock.has(7)).toBe(false)
  })
})

describe("panel nav event resolution", () => {
  it("applies only matching panelId and validates quizBlockId", () => {
    const detail = createChapterQuizPanelNavDetail("right-1", 55)
    expect(shouldApplyChapterQuizPanelNav("right-1", detail)).toBe(true)
    expect(shouldApplyChapterQuizPanelNav("right-2", detail)).toBe(false)
    expect(resolveQuizBlockIdFromPanelNav(detail)).toBe(55)

    const bad: ChapterQuizPanelNavDetail = {
      panelId: "right-1",
      quizBlockId: 0
    }
    expect(resolveQuizBlockIdFromPanelNav(bad)).toBeNull()
  })

  it("supports A→B switch logic for reused panel", () => {
    let localId: number | null = 100
    const apply = (detail: ChapterQuizPanelNavDetail) => {
      if (!shouldApplyChapterQuizPanelNav("p-right", detail)) return localId
      const next = resolveQuizBlockIdFromPanelNav(detail)
      if (next == null) {
        localId = null
        return localId
      }
      localId = next
      return localId
    }

    expect(
      apply(createChapterQuizPanelNavDetail("p-right", 200))
    ).toBe(200)
    expect(localId).toBe(200)
    // other panel ignored
    expect(
      apply(createChapterQuizPanelNavDetail("other", 300))
    ).toBe(200)
    // illegal clears
    expect(
      apply({ panelId: "p-right", quizBlockId: -1 })
    ).toBeNull()
  })
})

describe("mergeQuestionCardAdds", () => {
  it("writes card id under the target question, not another key", () => {
    const next = mergeQuestionCardAdds(
      { last: { basicBlockId: 1 } },
      "wrong-q",
      { basicBlockId: 99 }
    )
    expect(next["wrong-q"]?.basicBlockId).toBe(99)
    expect(next.last?.basicBlockId).toBe(1)
  })
})

describe("registerPanel / unregisterPanel symmetry", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("bindChapterQuizPanelRegistration register/unregister pair", () => {
    const registerPanel = vi.fn()
    const unregisterPanel = vi.fn()
    const renderer = { name: "ChapterQuizPanel" }
    const bound = bindChapterQuizPanelRegistration(
      { registerPanel, unregisterPanel },
      CHAPTER_QUIZ_PANEL_VIEW,
      renderer
    )
    bound.register()
    expect(registerPanel).toHaveBeenCalledWith(
      CHAPTER_QUIZ_PANEL_VIEW,
      renderer
    )
    bound.unregister()
    expect(unregisterPanel).toHaveBeenCalledWith(CHAPTER_QUIZ_PANEL_VIEW)
    expect(registerPanel).toHaveBeenCalledTimes(1)
    expect(unregisterPanel).toHaveBeenCalledTimes(1)
  })
})
