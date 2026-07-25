/**
 * 渐进阅读断点：捕获、版本化保存、强制 flush、可见块回退、恢复
 */

import type { CursorData, DbId } from "../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection,
  IRViewportAnchor
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
  measureBlockTopOffsetPx,
  resolveVerticalScrollOwner,
  subscribeToBreakpointScroll
} from "./irBreakpointViewport"
import {
  BreakpointRestoreRunGuard,
  defaultAlignTarget,
  getRestoreTargetKey,
  isMeaningfulTextSelection,
  resolveRestoreTarget,
  scheduleBreakpointRestore,
  ScrollCaptureSuppression,
  shouldAllowScrollVisibleCapture,
  SCROLL_DEBOUNCE_MS
} from "./irBreakpointRestore"

export {
  isMeaningfulTextSelection,
  planCardEnterScroll,
  resetScrollContainerTop,
  ScrollCaptureSuppression,
  shouldAllowScrollVisibleCapture,
  SCROLL_DEBOUNCE_MS
} from "./irBreakpointRestore"

export { findBlockElement } from "./irBreakpointDom"
export {
  collectVisibleBlockTops,
  resolveVerticalScrollOwner
} from "./irBreakpointViewport"

/**
 * Session-scoped vertical scroll owner: prefer the real scrollable ancestor of
 * `.ir-reading__scroll` (host editor when the internal node has no range).
 */
function resolveSessionScrollOwner(
  scrollContainerRef: { current: HTMLElement | null } | undefined,
  containerRef: { current: HTMLElement | null }
): HTMLElement | null {
  return resolveVerticalScrollOwner(
    scrollContainerRef?.current ?? containerRef.current
  )
}

const { useCallback, useEffect, useMemo, useRef } = window.React

const DEBOUNCE_MS = 180

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
  /**
   * 是否允许生成新断点（滚动/选区捕获）。
   * chapter_browse 应设为 false，flush 只排空既有保存队列。
   */
  allowCapture?: boolean
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

function measureViewportAnchor(
  rootBlockId: DbId,
  blockId: DbId,
  contentContainer: HTMLElement | null,
  scrollOwner: HTMLElement | null
): IRViewportAnchor | null {
  if (!contentContainer || !scrollOwner) return null
  const el = findBlockElement(contentContainer, blockId)
  if (!el) return null
  return {
    rootBlockId,
    blockId,
    topOffsetPx: measureBlockTopOffsetPx(el, scrollOwner)
  }
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
    allowCapture = true,
    onSaveError,
    onSaveSuccess,
    onRestoreSuccess,
    onRestoreFailure
  } = options

  const onSaveErrorRef = useLatestRef(onSaveError)
  const onSaveSuccessRef = useLatestRef(onSaveSuccess)
  const onRestoreSuccessRef = useLatestRef(onRestoreSuccess)
  const onRestoreFailureRef = useLatestRef(onRestoreFailure)
  const allowCaptureRef = useLatestRef(allowCapture)

  const channelRef = useRef(new BreakpointSaveChannel())
  const debounceRef = useRef<number | null>(null)
  const scrollDebounceRef = useRef<number | null>(null)
  const lastErrorRef = useRef<Error | null>(null)
  const pendingFlushResolvers = useRef<Array<() => void>>([])
  const restoreRunGuardRef = useRef(new BreakpointRestoreRunGuard())
  /** 恢复生命周期内抑制 scroll 可见块捕获（reset/restore 程序化滚动） */
  const scrollSuppressRef = useRef(new ScrollCaptureSuppression())

  const clearScrollDebounce = useCallback(() => {
    if (scrollDebounceRef.current != null) {
      window.clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = null
    }
  }, [])

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
    viewportAnchor?: IRViewportAnchor | null
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
    if (!cardId || !enabled || !allowCaptureRef.current) return false
    const selection = window.getSelection()
    // 折叠 caret / 空选区不得优先于视口（flush 时尤其致命）
    if (!isMeaningfulTextSelection(selection)) return false

    const cursor = orca.utils.getCursorDataFromSelection(selection)
    if (!cursor || cursor.panelId !== panelId) return false

    const validRootIds = [cardId]
    if (previewBlockId && previewBlockId !== cardId) validRootIds.push(previewBlockId)
    if (!validRootIds.includes(cursor.rootBlockId)) return false

    const selectionData = buildSelectionFromCursor(cursor)
    const nextPreview = cursor.rootBlockId === cardId
      ? (previewBlockId && previewBlockId !== cardId ? previewBlockId : null)
      : cursor.rootBlockId

    const contentRoot = cursor.rootBlockId === cardId
      ? containerRef.current
      : (previewContainerRef?.current ?? containerRef.current)
    const scrollOwner = resolveSessionScrollOwner(scrollContainerRef, containerRef)
    const viewportAnchor = measureViewportAnchor(
      selectionData.rootBlockId,
      selectionData.focus.blockId,
      contentRoot,
      scrollOwner
    )

    void persist({
      resumeBlockId: selectionData.focus.blockId,
      previewBlockId: nextPreview,
      selection: selectionData,
      viewportAnchor
    })
    return true
  }, [
    cardId,
    containerRef,
    enabled,
    panelId,
    persist,
    previewBlockId,
    previewContainerRef,
    scrollContainerRef
  ])

  const captureFromVisibleBlock = useCallback(() => {
    if (!cardId || !enabled || !allowCaptureRef.current) return
    const contentContainer = containerRef.current
    const viewportContainer = resolveSessionScrollOwner(scrollContainerRef, containerRef)
    if (!contentContainer || !viewportContainer) return
    const candidates = collectVisibleBlockTops(contentContainer, viewportContainer)
    const baseline = computeVisibleResumeBaseline(viewportContainer)
    const resumeBlockId = pickVisibleResumeBlockId(
      candidates.map(c => ({ blockId: c.blockId, top: c.top })),
      baseline
    )
    if (resumeBlockId == null) return

    const picked = candidates.find(c => c.blockId === resumeBlockId)
    const viewportAnchor: IRViewportAnchor | null = picked
      ? {
        rootBlockId: cardId,
        blockId: resumeBlockId,
        topOffsetPx: measureBlockTopOffsetPx(picked.element, viewportContainer)
      }
      : null

    void persist({
      resumeBlockId,
      selection: null,
      viewportAnchor
    })
  }, [cardId, containerRef, enabled, persist, scrollContainerRef])

  const captureNow = useCallback(() => {
    if (!allowCaptureRef.current) return
    if (captureFromSelection()) return
    captureFromVisibleBlock()
  }, [captureFromSelection, captureFromVisibleBlock])

  const scheduleCapture = useCallback(() => {
    if (!allowCaptureRef.current) return
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
    // browse 等禁止捕获态：只排空既有队列，不按当前 DOM 生成新断点
    if (allowCaptureRef.current) {
      captureNow()
    }
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

    // 在程序化 reset/restore 之前开启抑制，并清掉残留 scroll debounce
    const suppressToken = scrollSuppressRef.current.begin()
    clearScrollDebounce()

    let released = false
    const releaseSuppression = () => {
      if (released) return
      released = true
      scrollSuppressRef.current.end(suppressToken)
      // 释放时清掉恢复期间排队的程序化滚动 debounce，避免紧接着把顶部写回后端
      clearScrollDebounce()
    }

    const handle = scheduleBreakpointRestore(target, {
      getContentContainer: (targetRootBlockId) => targetRootBlockId === cardId
        ? containerRef.current
        : (previewContainerRef?.current ?? containerRef.current),
      getScrollContainer: () => resolveSessionScrollOwner(scrollContainerRef, containerRef),
      restoreSelection: async (selection) => {
        await orca.utils.setSelectionFromCursorData({
          ...selection,
          panelId,
          rootBlockId: selection.rootBlockId
        })
      },
      alignTarget: (element, topOffsetPx, scrollOwner) => {
        return defaultAlignTarget(element, topOffsetPx, scrollOwner)
      },
      onSuccess: () => {
        guard.complete(targetKey)
        releaseSuppression()
        onRestoreSuccessRef.current?.()
      },
      onFailure: (error) => {
        guard.cancel(targetKey)
        releaseSuppression()
        onRestoreFailureRef.current?.(error)
      }
    })

    return {
      cancel: () => {
        handle.cancel()
        guard.cancel(targetKey)
        // cancel 必须释放抑制，避免永久卡住
        releaseSuppression()
      }
    }
  }, [cardId, clearScrollDebounce, containerRef, panelId, previewContainerRef, scrollContainerRef])

  const restore = useCallback(() => {
    if (!cardId || !enabled || !restoreTarget || !restoreTargetKey) return
    const handle = startRestore(restoreTargetKey, restoreTarget)
    return handle ? () => handle.cancel() : undefined
  }, [cardId, enabled, restoreTarget, restoreTargetKey, startRestore])

  const activeCardIdRef = useLatestRef(cardId)

  // 滚动捕获与恢复用显式 suppression 门闩，不依赖 effect 声明顺序作为唯一保障。
  // 监听真实纵向滚动 owner（可能是 host `.orca-block-editor` 祖先），而非仅内部节点。
  useEffect(() => {
    const scrollContainer = resolveSessionScrollOwner(scrollContainerRef, containerRef)
    if (!scrollContainer || !enabled || !cardId || !allowCapture) return

    const listeningForCardId = cardId
    const onScroll = () => {
      // 恢复抑制中：不排队 debounce（程序化 reset/restore 的 scroll 直接丢弃）
      if (scrollSuppressRef.current.isActive()) {
        clearScrollDebounce()
        return
      }

      if (scrollDebounceRef.current != null) window.clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = window.setTimeout(() => {
        scrollDebounceRef.current = null
        if (!shouldAllowScrollVisibleCapture({
          suppressActive: scrollSuppressRef.current.isActive(),
          listeningForCardId,
          activeCardId: activeCardIdRef.current
        })) {
          return
        }
        const sel = window.getSelection()
        if (isMeaningfulTextSelection(sel)) return
        captureFromVisibleBlock()
      }, SCROLL_DEBOUNCE_MS)
    }

    const unsubscribe = subscribeToBreakpointScroll(scrollContainer, onScroll)
    return () => {
      unsubscribe()
      clearScrollDebounce()
    }
  }, [
    activeCardIdRef,
    allowCapture,
    captureFromVisibleBlock,
    clearScrollDebounce,
    containerRef,
    enabled,
    cardId,
    scrollContainerRef
  ])

  // 进入新卡：先归零再按有效断点恢复（归零在 scheduleBreakpointRestore 内；cleanup cancel 并释放 suppress）
  useEffect(() => {
    if (!cardId || !enabled || !restoreTarget || !restoreTargetKey) return
    const handle = startRestore(restoreTargetKey, restoreTarget)
    return () => {
      handle?.cancel()
    }
  }, [cardId, enabled, restoreTargetKey, restoreTarget, startRestore])

  useEffect(() => () => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    clearScrollDebounce()
    // unmount：强制释放，防止 suppress 泄漏
    scrollSuppressRef.current.end()
  }, [clearScrollDebounce])

  return {
    scheduleCapture,
    captureNow,
    flush,
    restore,
    lastError: lastErrorRef.current
  }
}

export default useIRReadingBreakpoint
