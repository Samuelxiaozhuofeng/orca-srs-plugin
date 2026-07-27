import { describe, expect, it } from "vitest"
import { resolveIRSessionViewportResetKey } from "./irSessionViewportReset"

describe("resolveIRSessionViewportResetKey", () => {
  const readingBase = {
    loadFailed: false,
    showSummary: false,
    queueLength: 3,
    isReviewEntry: false,
    currentEntryKey: "reading:101"
  }

  it("returns null for reading entries (breakpoint restore owns the scroll)", () => {
    expect(resolveIRSessionViewportResetKey(readingBase)).toBeNull()
  })

  it("marks the completion page so it is not stuck at the last card's position", () => {
    expect(
      resolveIRSessionViewportResetKey({ ...readingBase, showSummary: true })
    ).toBe("summary")
  })

  it("treats an emptied queue as the completion page", () => {
    expect(
      resolveIRSessionViewportResetKey({ ...readingBase, queueLength: 0 })
    ).toBe("summary")
  })

  it("changes key per mixed review entry so consecutive review cards each reset", () => {
    const first = resolveIRSessionViewportResetKey({
      ...readingBase,
      isReviewEntry: true,
      currentEntryKey: "review:1"
    })
    const second = resolveIRSessionViewportResetKey({
      ...readingBase,
      isReviewEntry: true,
      currentEntryKey: "review:2"
    })
    expect(first).toBe("review:review:1")
    expect(second).toBe("review:review:2")
    expect(first).not.toBe(second)
  })

  it("prioritises the load-failure view", () => {
    expect(
      resolveIRSessionViewportResetKey({
        ...readingBase,
        loadFailed: true,
        showSummary: true
      })
    ).toBe("load-failed")
  })
})
