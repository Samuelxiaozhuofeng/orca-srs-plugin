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
  it("extract card defaults to closed near parent and extract body", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: 39,
      parentBlockId: 19
    })
    expect(state.mode).toBe("extract_focus")
    expect(state.contextOpen).toBe(false)
    expect(resolveNearContextRenderId(state, 39)).toBeNull()
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
    expect(back.contextOpen).toBe(false)
    expect(resolveBodyBlockId(back, 39)).toBe(39)
    expect(resolveNearContextRenderId(back, 39)).toBeNull()
  })

  it("parent breadcrumb: first opens near context, second enters chapter_browse", () => {
    const focus = resetContextForCard({
      cardType: "extracts",
      cardId: 39,
      parentBlockId: 19
    })
    // default contextOpen false → first parent click opens near context
    const opened = reduceBreadcrumbClick(focus, {
      targetId: 19,
      cardId: 39,
      cardType: "extracts"
    })
    expect(opened.mode).toBe("extract_focus")
    expect(opened.contextOpen).toBe(true)
    expect(resolveNearContextRenderId(opened, 39)).toBe(19)

    // second parent click = broader browse
    const again = reduceBreadcrumbClick(opened, {
      targetId: 19,
      cardId: 39,
      cardType: "extracts"
    })
    expect(again.mode).toBe("chapter_browse")
    expect(resolveBodyBlockId(again, 39)).toBe(19)
    expect(shouldShowReturnButton(again)).toBe(true)
  })
})
