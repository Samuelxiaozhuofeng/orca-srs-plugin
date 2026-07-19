/**
 * Session-scoped reading context: near-parent strip vs chapter browse.
 * Resolves extract parent and owns IRReadingContextState reducers.
 */

import type { Block, DbId } from "../../orca.d.ts"
import type { IRCard } from "../../srs/incrementalReadingCollector"
import {
  createTopicFocusState,
  reduceBreadcrumbClick,
  reduceReturnFromBrowse,
  reduceToggleNearContext,
  resetContextForCard,
  resolveBreakpointPreviewId,
  shouldShowReturnButton,
  type IRReadingContextState
} from "./irReadingContextModel"

const { useCallback, useEffect, useState } = window.React

async function resolveParentBlockId(blockId: DbId): Promise<DbId | null> {
  const fromState = orca.state.blocks?.[blockId] as Block | undefined
  if (fromState?.parent != null && Number.isFinite(Number(fromState.parent))) {
    return fromState.parent as DbId
  }
  try {
    const block = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
    if (block?.parent != null && Number.isFinite(Number(block.parent))) {
      return block.parent as DbId
    }
  } catch (error) {
    console.warn("[IR] resolveParentBlockId failed", { blockId, error })
  }
  return null
}

export type UseIRReadingContextResult = {
  contextState: IRReadingContextState
  /** For useIRReadingBreakpoint — never browseBlockId */
  breakpointPreviewId: DbId | null
  showReturn: boolean
  onBreadcrumbClick: (targetId: DbId) => void
  onToggleNearContext: () => void
  onReturnFromBrowse: () => void
}

/**
 * Owns context state for the current reading card.
 * Resets on card change; async-fills extract parent when missing from state.
 */
export function useIRReadingContext(
  currentCard: IRCard | undefined
): UseIRReadingContextResult {
  const [contextState, setContextState] = useState<IRReadingContextState>(() =>
    createTopicFocusState()
  )

  useEffect(() => {
    if (!currentCard) {
      setContextState(createTopicFocusState())
      return
    }

    let cancelled = false
    const cardId = currentCard.id
    const cardType = currentCard.cardType
    const savedPreview = currentCard.readingBreakpoint?.previewBlockId ?? null

    if (cardType === "topic") {
      setContextState(
        resetContextForCard({
          cardType,
          cardId,
          parentBlockId: null,
          savedPreviewBlockId: savedPreview
        })
      )
      return
    }

    // Immediate optimistic reset (parent may fill async)
    const cached = orca.state.blocks?.[cardId] as Block | undefined
    const cachedParent =
      cached?.parent != null && Number.isFinite(Number(cached.parent))
        ? (cached.parent as DbId)
        : null

    setContextState(
      resetContextForCard({
        cardType,
        cardId,
        parentBlockId: cachedParent,
        savedPreviewBlockId: savedPreview
      })
    )

    if (cachedParent != null) return

    void resolveParentBlockId(cardId).then((parent) => {
      if (cancelled) return
      setContextState(
        resetContextForCard({
          cardType,
          cardId,
          parentBlockId: parent,
          savedPreviewBlockId: savedPreview
        })
      )
    })

    return () => {
      cancelled = true
    }
  }, [currentCard?.id, currentCard?.cardType])

  const onBreadcrumbClick = useCallback(
    (targetId: DbId) => {
      if (!currentCard) return
      setContextState((prev: IRReadingContextState) =>
        reduceBreadcrumbClick(prev, {
          targetId,
          cardId: currentCard.id,
          cardType: currentCard.cardType
        })
      )
    },
    [currentCard?.id, currentCard?.cardType]
  )

  const onToggleNearContext = useCallback(() => {
    setContextState((prev: IRReadingContextState) => reduceToggleNearContext(prev))
  }, [])

  const onReturnFromBrowse = useCallback(() => {
    if (!currentCard) return
    setContextState((prev: IRReadingContextState) =>
      reduceReturnFromBrowse(prev, {
        cardType: currentCard.cardType,
        nearContextBlockId: prev.nearContextBlockId
      })
    )
  }, [currentCard?.cardType])

  return {
    contextState,
    breakpointPreviewId: resolveBreakpointPreviewId(contextState),
    showReturn: shouldShowReturnButton(contextState),
    onBreadcrumbClick,
    onToggleNearContext,
    onReturnFromBrowse
  }
}
