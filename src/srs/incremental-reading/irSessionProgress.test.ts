import { describe, expect, it } from "vitest"
import {
  createSessionProgress,
  formatSessionProgress,
  isSessionQueueEmpty,
  markSessionItemCompleted,
  syncSessionRemaining,
  unmarkSessionItemCompleted
} from "./irSessionProgress"

describe("irSessionProgress", () => {
  it("shows completed / planned instead of current index / remaining", () => {
    let progress = createSessionProgress(5)
    expect(formatSessionProgress(progress)).toBe("0 / 5")

    progress = markSessionItemCompleted(progress)
    progress = markSessionItemCompleted(progress)
    expect(formatSessionProgress(progress)).toBe("2 / 5")
    expect(progress.remaining).toBe(3)
  })

  it("does not inflate completed beyond planned", () => {
    let progress = createSessionProgress(1)
    progress = markSessionItemCompleted(progress)
    progress = markSessionItemCompleted(progress)
    expect(progress.completed).toBe(1)
    expect(formatSessionProgress(progress)).toBe("1 / 1")
  })

  it("gives the count back when the reader undoes 下一篇", () => {
    let progress = createSessionProgress(4)
    progress = markSessionItemCompleted(progress)
    progress = markSessionItemCompleted(progress)
    progress = unmarkSessionItemCompleted(progress)
    expect(formatSessionProgress(progress)).toBe("1 / 4")
    expect(progress.remaining).toBe(3)
  })

  it("does not push completed below zero or remaining above planned", () => {
    const progress = unmarkSessionItemCompleted(createSessionProgress(2))
    expect(progress.completed).toBe(0)
    expect(progress.remaining).toBe(2)
  })

  it("tracks empty remaining independently of planned", () => {
    let progress = createSessionProgress(3)
    progress = markSessionItemCompleted(progress)
    progress = markSessionItemCompleted(progress)
    progress = markSessionItemCompleted(progress)
    progress = syncSessionRemaining(progress, 0)
    expect(isSessionQueueEmpty(progress)).toBe(true)
    expect(formatSessionProgress(progress)).toBe("3 / 3")
  })
})
