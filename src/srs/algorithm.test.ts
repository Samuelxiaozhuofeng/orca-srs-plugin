import { describe, expect, it } from "vitest"

import {
  createInitialSrsState,
  nextReviewState,
  previewIntervals,
  resetCardState,
} from "./algorithm"

const fixedNow = new Date("2026-07-12T12:00:00.000Z")

describe("algorithm resets", () => {
  it.each(["Basic", "Cloze", "Direction", "List"])(
    "%s 评分后保留重置次数",
    () => {
      const resetState = resetCardState(createInitialSrsState(fixedNow), fixedNow)

      const { state } = nextReviewState(resetState, "good", fixedNow)

      expect(state.resets).toBe(1)
    },
  )

  it("多次重置后评分保留累计值", () => {
    const initialState = createInitialSrsState(fixedNow)
    const resetOnce = resetCardState(initialState, fixedNow)
    const resetTwice = resetCardState(resetOnce, fixedNow)

    const { state } = nextReviewState(resetTwice, "hard", fixedNow)

    expect(state.resets).toBe(2)
  })

  it("未重置卡片评分后重置次数为零", () => {
    const { state } = nextReviewState(createInitialSrsState(fixedNow), "easy", fixedNow)

    expect(state.resets).toBe(0)
  })

  it("预览评分不会修改原状态", () => {
    const previousState = {
      ...resetCardState(createInitialSrsState(fixedNow), fixedNow),
      due: new Date("2026-07-13T12:00:00.000Z"),
      lastReviewed: new Date("2026-07-11T12:00:00.000Z"),
    }
    const snapshot = structuredClone(previousState)

    previewIntervals(previousState, fixedNow)

    expect(previousState).toEqual(snapshot)
    expect(previousState.resets).toBe(1)
  })
})
