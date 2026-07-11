/**
 * 渐进阅读断点：捕获、版本化保存、强制 flush、可见块回退、恢复
 */

import type { CursorData, DbId } from "../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection
} from "../srs/incrementalReadingStorage"
import { updateReadingBreakpoint } from "../srs/incrementalReadingStorage"
import {
  BreakpointSaveChannel,
  pickVisibleResumeBlockId
} from "../srs/incremental-reading/irBreakpointStorage"
import { findBlockElement } from "./irBreakpointDom"
import {
  collectVisibleBlockTops,
  computeVisibleResumeBaseline,
  subscribeToBreakpointScroll
} from "./irBreakpointViewport"
import {
  BreakpointRestoreRunGuard,
  getRestoreTargetKey,
  resolveRestoreTarget,
  scheduleBreakpointRestore
} from "./irBreakpointRestore"

export { findBlockElement } from "./irBreakpointDom"
export { collectVisibleBlockTops } from "./irBreakpointViewport"

const { useCallback, useEffect, useMemo, useRef } = window.React

const DEBOUNCE_MS = 180
const SCROLL_DEBOUNCE_MS = 280

export type UseIRReadingBreakpointOptions = {
  cardId: DbId | null
  panelId: string
  /** 正文 DOM 范围：块查询与选区捕获 */
  containerRef: { current: HTMLElement | null }
  /** 真实滚动 viewport：scroll 监听与可见块边界 */
  scrollContainerRef?: { current: HTMLElement | null }
  previewContainerRef?: { current: HTMLElement | null }
  previewBlockId?: DbId | null
  /** 来自卡片状态的断点 */
  initialBreakpoint?: IRReadingBreakpoint | null
  initialResumeBlockId?: DbId | null
  enabled?: boolean
  onSaveError?: (error: unknown) => void
  onSaveSuccess?: () => void
  onRestoreSuccess?: () => void
  onRestoreFailure?: (error: unknown) => void
}

export type UseIRReadingBreakpointResult = {
  scheduleCapture: () => void
  captureNow: () => void
  flush: () => Promise<void>
  restore: () => void
  lastError: Error | null
}

function buildSelectionFromCursor(cursor: CursorData): IRReadingBreakpointSelection {
  return {
    rootBlockId: cursor.rootBlockId,
    anchor: { ...cursor.anchor },
    focus: { ...cursor.focus },
    isForward: cursor.isForward
  }
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function useIRReadingBreakpoint(
  options: UseIRReadingBreakpointOptions
): UseIRReadingBreakpointResult {
  const {
    cardId,
    panelId,
    containerRef,
    scrollContainerRef,
    previewContainerRef,
    previewBlockId = null,
    initialBreakpoint = null,
    initialResumeBlockId = null,
    enabled = true,
    onSaveError,
    onSaveSuccess,
    onRestoreSuccess,
    onRestoreFailure
  } = options

  const onSaveErrorRef = useLatestRef(onSaveError)
  const onSaveSuccessRef = useLatestRef(onSaveSuccess)
  const onRestoreSuccessRef = useLatestRef(onRestoreSuccess)
  const onRestoreFailureRef = useLatestRef(onRestoreFailure)

  const channelRef = useRef(new BreakpointSaveChannel())
  const debounceRef = useRef<number | null>(null)
  const scrollDebounceRef = useRef<number | null>(null)
  const lastErrorRef = useRef<Error | null>(null)
  const pendingFlushResolvers = useRef<Array<() => void>>([])
  const restoreRunGuardRef = useRef(new BreakpointRestoreRunGuard())

  const restoreTarget = useMemo(() => {
    if (!cardId) return null
    return resolveRestoreTarget(cardId, initialBreakpoint, initialResumeBlockId)
  }, [cardId, initialBreakpoint, initialResumeBlockId])

  const restoreTargetKey = useMemo(() => {
    if (!restoreTarget) return null
    return getRestoreTargetKey(restoreTarget)
  }, [restoreTarget])

  const persist = useCallback(async (patch: {
    resumeBlockId?: DbId | null
    previewBlockId?: DbId | null
    selection?: IRReadingBreakpointSelection | null
  }) => {
    if (!cardId || !enabled) return
    const channel = channelRef.current
    const version = channel.allocateVersion(cardId)

    return channel.enqueue(async () => {
      try {
        if (version < channel.getVersion(cardId)) return
        await updateReadingBreakpoint(cardId, patch)
        lastErrorRef.current = null
        onSaveSuccessRef.current?.()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        lastErrorRef.current = err
        onSaveErrorRef.current?.(err)
        throw err
      } finally {
        const resolvers = pendingFlushResolvers.current
        pendingFlushResolvers.current = []
        resolvers.forEach((r: () => void) => r())
      }
    })
  }, [cardId, enabled])

  const captureFromSelection = useCallback(() => {
    if (!cardId || !enabled) return false
    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection)
    if (!cursor || cursor.panelId !== panelId) return false

    const validRootIds = [cardId]
    if (previewBlockId && previewBlockId !== cardId) validRootIds.push(previewBlockId)
    if (!validRootIds.includes(cursor.rootBlockId)) return false

    const selectionData = buildSelectionFromCursor(cursor)
    const nextPreview = cursor.rootBlockId === cardId
      ? (previewBlockId && previewBlockId !== cardId ? previewBlockId : null)
      : cursor.rootBlockId

    void persist({
      resumeBlockId: selectionData.focus.blockId,
      previewBlockId: nextPreview,
      selection: selectionData
    })
    return true
  }, [cardId, enabled, panelId, previewBlockId, persist])

  const captureFromVisibleBlock = useCallback(() => {
    if (!cardId || !enabled) return
    const contentContainer = containerRef.current
    const viewportContainer = scrollContainerRef?.current ?? containerRef.current
    if (!contentContainer || !viewportContainer) return
    const candidates = collectVisibleBlockTops(contentContainer, viewportContainer)
    const baseline = computeVisibleResumeBaseline(viewportContainer)
    const resumeBlockId = pickVisibleResumeBlockId(candidates, baseline)
    if (resumeBlockId == null) return
    void persist({
      resumeBlockId,
      selection: null
    })
  }, [cardId, containerRef, enabled, persist, scrollContainerRef])

  const captureNow = useCallback(() => {
    if (captureFromSelection()) return
    captureFromVisibleBlock()
  }, [captureFromSelection, captureFromVisibleBlock])

  const scheduleCapture = useCallback(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      captureNow()
    }, DEBOUNCE_MS)
  }, [captureNow])

  const flush = useCallback(async () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (scrollDebounceRef.current != null) {
      window.clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = null
    }
    captureNow()
    await new Promise<void>(resolve => {
      pendingFlushResolvers.current.push(resolve)
      window.setTimeout(resolve, 50)
    })
    await channelRef.current.enqueue(async () => undefined)
    if (lastErrorRef.current) {
      throw lastErrorRef.current
    }
  }, [captureNow])

  const startRestore = useCallback((targetKey: string, target: NonNullable<typeof restoreTarget>) => {
    const guard = restoreRunGuardRef.current
    if (!guard.begin(targetKey)) return null

    const handle = scheduleBreakpointRestore(target, {
      getContentContainer: (targetRootBlockId) => targetRootBlockId === cardId
        ? containerRef.current
        : (previewContainerRef?.current ?? containerRef.current),
      restoreSelection: async (selection) => {
        await orca.utils.setSelectionFromCursorData({
          ...selection,
          panelId,
          rootBlockId: selection.rootBlockId
        })
      },
      scrollIntoView: (element) => {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
      },
      onSuccess: () => {
        guard.complete(targetKey)
        onRestoreSuccessRef.current?.()
      },
      onFailure: (error) => {
        guard.cancel(targetKey)
        onRestoreFailureRef.current?.(error)
      }
    })

    return {
      cancel: () => {
        handle.cancel()
        guard.cancel(targetKey)
      }
    }
  }, [cardId, containerRef, panelId, previewContainerRef])

  const restore = useCallback(() => {
    if (!cardId || !enabled || !restoreTarget || !restoreTargetKey) return
    const handle = startRestore(restoreTargetKey, restoreTarget)
    return handle ? () => handle.cancel() : undefined
  }, [cardId, enabled, restoreTarget, restoreTargetKey, startRestore])

  useEffect(() => {
    if (!cardId || !enabled || !restoreTarget || !restoreTargetKey) return
    const handle = startRestore(restoreTargetKey, restoreTarget)
    return () => handle?.cancel()
  }, [cardId, enabled, restoreTargetKey, restoreTarget, startRestore])

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current ?? containerRef.current
    if (!scrollContainer || !enabled) return

    const onScroll = () => {
      if (scrollDebounceRef.current != null) window.clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = window.setTimeout(() => {
        scrollDebounceRef.current = null
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed && sel.toString().trim()) return
        captureFromVisibleBlock()
      }, SCROLL_DEBOUNCE_MS)
    }

    const unsubscribe = subscribeToBreakpointScroll(scrollContainer, onScroll)
    return () => {
      unsubscribe()
      if (scrollDebounceRef.current != null) window.clearTimeout(scrollDebounceRef.current)
    }
  }, [captureFromVisibleBlock, containerRef, enabled, cardId, scrollContainerRef])

  useEffect(() => () => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    if (scrollDebounceRef.current != null) window.clearTimeout(scrollDebounceRef.current)
  }, [])

  return {
    scheduleCapture,
    captureNow,
    flush,
    restore,
    lastError: lastErrorRef.current
  }
}

export default useIRReadingBreakpoint
