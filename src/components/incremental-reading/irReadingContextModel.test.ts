import { describe, expect, it } from "vitest"
import {
  createExtractFocusState,
  createTopicFocusState,
  reduceBreadcrumbClick,
  reduceReturnFromBrowse,
  reduceToggleNearContext,
  resetContextForCard,
  resolveBodyBlockId,
  resolveBreakpointPreviewId,
  resolveNearContextRenderId,
  shouldShowExtractBody,
  shouldShowReturnButton,
  type IRReadingContextState
} from "./irReadingContextModel"

const CARD = 100 as const
const PARENT = 200 as const
const ROOT = 300 as const
const ANCESTOR = 400 as const

describe("createExtractFocusState / createTopicFocusState", () => {
  it("extract init defaults contextOpen true and no browse", () => {
    const state = createExtractFocusState({ nearContextBlockId: PARENT })
    expect(state).toEqual({
      mode: "extract_focus",
      nearContextBlockId: PARENT,
      contextOpen: true,
      browseBlockId: null
    })
  })

  it("extract allows contextOpen false override", () => {
    const state = createExtractFocusState({
      nearContextBlockId: PARENT,
      contextOpen: false
    })
    expect(state.contextOpen).toBe(false)
  })

  it("topic has no near context and context closed", () => {
    const state = createTopicFocusState()
    expect(state).toEqual({
      mode: "extract_focus",
      nearContextBlockId: null,
      contextOpen: false,
      browseBlockId: null
    })
  })
})

describe("resetContextForCard", () => {
  it("extracts with parent → near parent, context open", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: CARD,
      parentBlockId: PARENT
    })
    expect(state.mode).toBe("extract_focus")
    expect(state.nearContextBlockId).toBe(PARENT)
    expect(state.contextOpen).toBe(true)
    expect(state.browseBlockId).toBeNull()
  })

  it("extracts without parent stays null near context", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: CARD,
      parentBlockId: null
    })
    expect(state.nearContextBlockId).toBeNull()
    expect(state.contextOpen).toBe(true)
  })

  it("applies savedPreview only when parent-like and !== cardId (fills missing parent)", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: CARD,
      parentBlockId: null,
      savedPreviewBlockId: PARENT
    })
    expect(state.nearContextBlockId).toBe(PARENT)
  })

  it("does not apply savedPreview when it equals cardId", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: CARD,
      parentBlockId: null,
      savedPreviewBlockId: CARD
    })
    expect(state.nearContextBlockId).toBeNull()
  })

  it("does not let savedPreview override known parent", () => {
    const state = resetContextForCard({
      cardType: "extracts",
      cardId: CARD,
      parentBlockId: PARENT,
      savedPreviewBlockId: ANCESTOR
    })
    expect(state.nearContextBlockId).toBe(PARENT)
  })

  it("topic ignores parent and preview", () => {
    const state = resetContextForCard({
      cardType: "topic",
      cardId: CARD,
      parentBlockId: PARENT,
      savedPreviewBlockId: ROOT
    })
    expect(state).toEqual(createTopicFocusState())
  })
})

describe("reduceBreadcrumbClick", () => {
  const extractFocus: IRReadingContextState = createExtractFocusState({
    nearContextBlockId: PARENT
  })

  it("parent breadcrumb when context closed opens near context only", () => {
    const closed = createExtractFocusState({
      nearContextBlockId: PARENT,
      contextOpen: false
    })
    const next = reduceBreadcrumbClick(closed, {
      targetId: PARENT,
      cardId: CARD,
      cardType: "extracts"
    })
    expect(next.mode).toBe("extract_focus")
    expect(next.contextOpen).toBe(true)
    expect(next.browseBlockId).toBeNull()
    expect(next.nearContextBlockId).toBe(PARENT)
  })

  it("parent breadcrumb when context already open enters chapter_browse", () => {
    const open = createExtractFocusState({
      nearContextBlockId: PARENT,
      contextOpen: true
    })
    const next = reduceBreadcrumbClick(open, {
      targetId: PARENT,
      cardId: CARD,
      cardType: "extracts"
    })
    expect(next.mode).toBe("chapter_browse")
    expect(next.browseBlockId).toBe(PARENT)
    expect(next.contextOpen).toBe(false)
    expect(next.nearContextBlockId).toBe(PARENT)
  })

  it("root/ancestor breadcrumb enters chapter_browse", () => {
    const next = reduceBreadcrumbClick(extractFocus, {
      targetId: ROOT,
      cardId: CARD,
      cardType: "extracts"
    })
    expect(next.mode).toBe("chapter_browse")
    expect(next.browseBlockId).toBe(ROOT)
    expect(next.contextOpen).toBe(false)
    // preserve near for return
    expect(next.nearContextBlockId).toBe(PARENT)
  })

  it("card breadcrumb clears browse back to extract_focus", () => {
    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    const next = reduceBreadcrumbClick(browsing, {
      targetId: CARD,
      cardId: CARD,
      cardType: "extracts"
    })
    expect(next.mode).toBe("extract_focus")
    expect(next.browseBlockId).toBeNull()
    expect(next.nearContextBlockId).toBe(PARENT)
  })

  it("topic ancestor enters chapter_browse; card clears", () => {
    const topic = createTopicFocusState()
    const browsed = reduceBreadcrumbClick(topic, {
      targetId: ROOT,
      cardId: CARD,
      cardType: "topic"
    })
    expect(browsed.mode).toBe("chapter_browse")
    expect(browsed.browseBlockId).toBe(ROOT)

    const cleared = reduceBreadcrumbClick(browsed, {
      targetId: CARD,
      cardId: CARD,
      cardType: "topic"
    })
    expect(cleared).toEqual(createTopicFocusState())
  })
})

describe("reduceReturnFromBrowse", () => {
  it("returns to extract_focus with near parent context open", () => {
    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    const next = reduceReturnFromBrowse(browsing, {
      cardType: "extracts",
      nearContextBlockId: PARENT
    })
    expect(next).toEqual({
      mode: "extract_focus",
      nearContextBlockId: PARENT,
      contextOpen: true,
      browseBlockId: null
    })
  })

  it("falls back to state.nearContextBlockId when arg is null", () => {
    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    const next = reduceReturnFromBrowse(browsing, {
      cardType: "extracts",
      nearContextBlockId: null
    })
    expect(next.nearContextBlockId).toBe(PARENT)
    expect(next.contextOpen).toBe(true)
  })

  it("topic return clears browse", () => {
    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: null,
      contextOpen: false,
      browseBlockId: ROOT
    }
    const next = reduceReturnFromBrowse(browsing, {
      cardType: "topic",
      nearContextBlockId: null
    })
    expect(next).toEqual(createTopicFocusState())
  })
})

describe("reduceToggleNearContext", () => {
  it("toggles contextOpen in extract_focus with near id", () => {
    const open = createExtractFocusState({ nearContextBlockId: PARENT })
    const closed = reduceToggleNearContext(open)
    expect(closed.contextOpen).toBe(false)
    expect(reduceToggleNearContext(closed).contextOpen).toBe(true)
  })

  it("no-ops without near context or in chapter_browse", () => {
    const noNear = createExtractFocusState({ nearContextBlockId: null })
    expect(reduceToggleNearContext(noNear)).toEqual(noNear)

    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    expect(reduceToggleNearContext(browsing)).toEqual(browsing)
  })
})

describe("render / body / breakpoint resolvers", () => {
  it("near context render id only when extract_focus + open", () => {
    const open = createExtractFocusState({ nearContextBlockId: PARENT })
    expect(resolveNearContextRenderId(open, CARD)).toBe(PARENT)

    const closed = { ...open, contextOpen: false }
    expect(resolveNearContextRenderId(closed, CARD)).toBeNull()

    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    expect(resolveNearContextRenderId(browsing, CARD)).toBeNull()
  })

  it("body id is card in extract_focus and browse target in chapter_browse", () => {
    const focus = createExtractFocusState({ nearContextBlockId: PARENT })
    expect(resolveBodyBlockId(focus, CARD)).toBe(CARD)

    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    expect(resolveBodyBlockId(browsing, CARD)).toBe(ROOT)
  })

  it("extract body shown only in extract_focus; return only in chapter_browse", () => {
    const focus = createExtractFocusState({ nearContextBlockId: PARENT })
    expect(shouldShowExtractBody(focus)).toBe(true)
    expect(shouldShowReturnButton(focus)).toBe(false)

    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    expect(shouldShowExtractBody(browsing)).toBe(false)
    expect(shouldShowReturnButton(browsing)).toBe(true)
  })

  it("breakpoint preview uses near context only; ignores browseBlockId", () => {
    const open = createExtractFocusState({ nearContextBlockId: PARENT })
    expect(resolveBreakpointPreviewId(open)).toBe(PARENT)

    const closed = { ...open, contextOpen: false }
    expect(resolveBreakpointPreviewId(closed)).toBeNull()

    const browsing: IRReadingContextState = {
      mode: "chapter_browse",
      nearContextBlockId: PARENT,
      contextOpen: false,
      browseBlockId: ROOT
    }
    expect(resolveBreakpointPreviewId(browsing)).toBeNull()
  })
})

describe("product flow: extract → chapter → return", () => {
  it("walks parent open, root browse, return to extract with context", () => {
    let state = resetContextForCard({
      cardType: "extracts",
      cardId: CARD,
      parentBlockId: PARENT
    })
    expect(resolveBodyBlockId(state, CARD)).toBe(CARD)
    expect(resolveNearContextRenderId(state, CARD)).toBe(PARENT)
    expect(shouldShowExtractBody(state)).toBe(true)

    // click parent again (context already open) → chapter_browse on parent
    state = reduceBreadcrumbClick(state, {
      targetId: PARENT,
      cardId: CARD,
      cardType: "extracts"
    })
    expect(state.mode).toBe("chapter_browse")
    expect(resolveBodyBlockId(state, CARD)).toBe(PARENT)
    expect(shouldShowReturnButton(state)).toBe(true)

    // click root → chapter_browse single body on root
    state = reduceBreadcrumbClick(state, {
      targetId: ROOT,
      cardId: CARD,
      cardType: "extracts"
    })
    expect(state.mode).toBe("chapter_browse")
    expect(resolveBodyBlockId(state, CARD)).toBe(ROOT)
    expect(shouldShowExtractBody(state)).toBe(false)
    expect(resolveNearContextRenderId(state, CARD)).toBeNull()
    expect(resolveBreakpointPreviewId(state)).toBeNull()
    expect(shouldShowReturnButton(state)).toBe(true)

    // return → extract focus + near open
    state = reduceReturnFromBrowse(state, {
      cardType: "extracts",
      nearContextBlockId: PARENT
    })
    expect(state.mode).toBe("extract_focus")
    expect(state.contextOpen).toBe(true)
    expect(resolveBodyBlockId(state, CARD)).toBe(CARD)
    expect(resolveNearContextRenderId(state, CARD)).toBe(PARENT)
    expect(resolveBreakpointPreviewId(state)).toBe(PARENT)
  })
})
