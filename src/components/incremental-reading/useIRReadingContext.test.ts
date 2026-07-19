/**
 * Pure-ish tests for reset helpers used by useIRReadingContext.
 * Full hook needs React runtime; cover parent resolve + model integration via model tests.
 */
import { describe, expect, it } from "vitest"
import {
  reduceBreadcrumbClick,
  reduceReturnFromBrowse,
  resetContextForCard,
  resolveBodyBlockId,
  resolveNearContextRenderId,
  shouldShowReturnButton
} from "./irReadingContextModel"

describe("useIRReadingContext integration (model path)", () => {
  it("extract card defaults to open near parent and extract body", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: 39,
      parentBlockId: 19
    })
    expect(state.mode).toBe("extract_focus")
    expect(state.contextOpen).toBe(true)
    expect(resolveNearContextRenderId(state, 39)).toBe(19)
    expect(resolveBodyBlockId(state, 39)).toBe(39)
    expect(shouldShowReturnButton(state)).toBe(false)
  })

  it("chapter breadcrumb replaces body and shows return", () => {
    const focus = resetContextForCard({
      cardType: "extracts",
      cardId: 39,
      parentBlockId: 19
    })
    const browsed = reduceBreadcrumbClick(focus, {
      targetId: 1,
      cardId: 39,
      cardType: "extracts"
    })
    expect(browsed.mode).toBe("chapter_browse")
    expect(resolveBodyBlockId(browsed, 39)).toBe(1)
    expect(resolveNearContextRenderId(browsed, 39)).toBeNull()
    expect(shouldShowReturnButton(browsed)).toBe(true)

    const back = reduceReturnFromBrowse(browsed, {
      cardType: "extracts",
      nearContextBlockId: 19
    })
    expect(back.mode).toBe("extract_focus")
    expect(resolveBodyBlockId(back, 39)).toBe(39)
    expect(resolveNearContextRenderId(back, 39)).toBe(19)
  })

  it("parent breadcrumb when context already open enters chapter_browse", () => {
    const focus = resetContextForCard({
      cardType: "extracts",
      cardId: 39,
      parentBlockId: 19
    })
    // default contextOpen true → second parent click = broader browse
    const again = reduceBreadcrumbClick(focus, {
      targetId: 19,
      cardId: 39,
      cardType: "extracts"
    })
    expect(again.mode).toBe("chapter_browse")
    expect(resolveBodyBlockId(again, 39)).toBe(19)
    expect(shouldShowReturnButton(again)).toBe(true)
  })
})
