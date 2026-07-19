/**
 * Pure IR extract reading context / browse mode state machine.
 * No React, no DOM, no Orca side effects — shell wires these reducers later.
 */

import type { DbId } from "../../orca.d.ts"

export type IRReadingBrowseMode = "extract_focus" | "chapter_browse"

export type IRReadingContextState = {
  mode: IRReadingBrowseMode
  /** Direct parent for near context when extract; null if unknown/no parent */
  nearContextBlockId: DbId | null
  /** Open state of near-context panel (extract_focus only) */
  contextOpen: boolean
  /** Block shown as full-page browse (chapter_browse only) */
  browseBlockId: DbId | null
}

function isValidParentLikePreview(
  preview: DbId | null | undefined,
  cardId: DbId
): preview is DbId {
  return typeof preview === "number" && Number.isFinite(preview) && preview !== cardId
}

/** Extract default: near parent context open, body shows extract. */
export function createExtractFocusState(args: {
  nearContextBlockId: DbId | null
  contextOpen?: boolean
}): IRReadingContextState {
  return {
    mode: "extract_focus",
    nearContextBlockId: args.nearContextBlockId,
    contextOpen: args.contextOpen ?? true,
    browseBlockId: null
  }
}

/**
 * Topic: no near-context strip; mode is still extract_focus conceptually
 * (body = topic card) with nearContext null and contextOpen false.
 */
export function createTopicFocusState(): IRReadingContextState {
  return {
    mode: "extract_focus",
    nearContextBlockId: null,
    contextOpen: false,
    browseBlockId: null
  }
}

/**
 * Reset when the active card changes.
 * - extracts: near context = direct parent; contextOpen true
 * - topic: no near context
 * - savedPreviewBlockId: only applied when parent-like and !== cardId
 *   (fills near context when parent is unknown; never overrides a known parent)
 */
export function resetContextForCard(args: {
  cardType: "topic" | "extracts"
  cardId: DbId
  parentBlockId: DbId | null
  savedPreviewBlockId?: DbId | null
}): IRReadingContextState {
  if (args.cardType === "topic") {
    return createTopicFocusState()
  }

  let near: DbId | null = args.parentBlockId
  if (near == null && isValidParentLikePreview(args.savedPreviewBlockId, args.cardId)) {
    near = args.savedPreviewBlockId
  }

  return createExtractFocusState({
    nearContextBlockId: near,
    contextOpen: true
  })
}

/**
 * Breadcrumb click reducer.
 * - target === cardId → extract focus (clear browse)
 * - target === nearContextBlockId (direct parent) → extract_focus, contextOpen true
 *   (never enter chapter_browse for the direct parent)
 * - else (ancestor / chapter) → chapter_browse with browseBlockId = target
 * - topics: target !== cardId → chapter_browse; else clear browse
 */
export function reduceBreadcrumbClick(
  state: IRReadingContextState,
  args: { targetId: DbId; cardId: DbId; cardType: "topic" | "extracts" }
): IRReadingContextState {
  const { targetId, cardId, cardType } = args

  if (targetId === cardId) {
    if (cardType === "topic") {
      return createTopicFocusState()
    }
    return {
      mode: "extract_focus",
      nearContextBlockId: state.nearContextBlockId,
      contextOpen: state.contextOpen || state.nearContextBlockId != null,
      browseBlockId: null
    }
  }

  if (cardType === "topic") {
    return {
      mode: "chapter_browse",
      nearContextBlockId: null,
      contextOpen: false,
      browseBlockId: targetId
    }
  }

  // extracts: direct parent — first click opens near context; if already open,
  // second click enters chapter_browse (covers extract-as-direct-child-of-chapter).
  if (state.nearContextBlockId != null && targetId === state.nearContextBlockId) {
    if (state.mode === "extract_focus" && state.contextOpen) {
      return {
        mode: "chapter_browse",
        nearContextBlockId: state.nearContextBlockId,
        contextOpen: false,
        browseBlockId: targetId
      }
    }
    return {
      mode: "extract_focus",
      nearContextBlockId: state.nearContextBlockId,
      contextOpen: true,
      browseBlockId: null
    }
  }

  // ancestor / chapter → full-page browse; preserve near id for return
  return {
    mode: "chapter_browse",
    nearContextBlockId: state.nearContextBlockId,
    contextOpen: false,
    browseBlockId: targetId
  }
}

/** Leave chapter_browse and restore extract_focus with near parent context open. */
export function reduceReturnFromBrowse(
  state: IRReadingContextState,
  args: { cardType: "topic" | "extracts"; nearContextBlockId: DbId | null }
): IRReadingContextState {
  if (args.cardType === "topic") {
    return createTopicFocusState()
  }

  const near =
    args.nearContextBlockId ?? state.nearContextBlockId

  return createExtractFocusState({
    nearContextBlockId: near,
    contextOpen: true
  })
}

/** Toggle near-context panel; only meaningful in extract_focus with a near id. */
export function reduceToggleNearContext(
  state: IRReadingContextState
): IRReadingContextState {
  if (state.mode !== "extract_focus") {
    return state
  }
  if (state.nearContextBlockId == null) {
    return state
  }
  return {
    ...state,
    contextOpen: !state.contextOpen
  }
}

/**
 * Block id for the near-context slot (extract_focus + open only).
 * Never returns the card itself.
 */
export function resolveNearContextRenderId(
  state: IRReadingContextState,
  cardId: DbId
): DbId | null {
  if (state.mode !== "extract_focus" || !state.contextOpen) {
    return null
  }
  if (state.nearContextBlockId == null || state.nearContextBlockId === cardId) {
    return null
  }
  return state.nearContextBlockId
}

/** Main body block: browse target in chapter_browse, otherwise the card. */
export function resolveBodyBlockId(
  state: IRReadingContextState,
  cardId: DbId
): DbId {
  if (state.mode === "chapter_browse" && state.browseBlockId != null) {
    return state.browseBlockId
  }
  return cardId
}

/** Separate extract body only in extract_focus (chapter_browse is single body). */
export function shouldShowExtractBody(state: IRReadingContextState): boolean {
  return state.mode === "extract_focus"
}

export function shouldShowReturnButton(state: IRReadingContextState): boolean {
  return state.mode === "chapter_browse"
}

/**
 * previewBlockId for the breakpoint hook:
 * only near context while extract_focus + open; never browseBlockId.
 */
export function resolveBreakpointPreviewId(
  state: IRReadingContextState
): DbId | null {
  if (state.mode !== "extract_focus" || !state.contextOpen) {
    return null
  }
  return state.nearContextBlockId
}
