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

const { useCallback, useEffect, useRef } = window.React

const DEBOUNCE_MS = 180
const SCROLL_DEBOUNCE_MS = 280
const RESTORE_MAX_ATTEMPTS = 8

export type UseIRReadingBreakpointOptions = {
  cardId: DbId | null
  panelId: string
  containerRef: { current: HTMLElement | null }
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

export function findBlockElement(container: HTMLElement, blockId: DbId): HTMLElement | null {
  const selectors = [
    `#block-${blockId}`,
    `[data-block-id="${blockId}"]`,
    `[data-blockid="${blockId}"]`,
    `[data-id="${blockId}"]`,
    `[blockid="${blockId}"]`
  ]
  for (const selector of selectors) {
    const el = container.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return null
}

function findBlockIdFromElement(el: Element): DbId | null {
  const raw =
    el.getAttribute("data-block-id") ||
    el.getAttribute("data-blockid") ||
    el.getAttribute("data-id") ||
    el.getAttribute("blockid") ||
    (el.id?.startsWith("block-") ? el.id.slice("block-".length) : null)
  if (!raw) return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function collectVisibleBlockTops(container: HTMLElement): Array<{ blockId: DbId; top: number }> {
  const nodes = container.querySelectorAll(
    "[data-block-id], [data-blockid], [data-id], [blockid], [id^='block-']"
  )
  const containerTop = container.getBoundingClientRect().top
  const result: Array<{ blockId: DbId; top: number }> = []
  const seen = new Set<number>()

  nodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return
    const blockId = findBlockIdFromElement(node)
    if (blockId == null || seen.has(blockId)) return
    const rect = node.getBoundingClientRect()
    if (rect.bottom < containerTop || rect.top > containerTop + container.clientHeight) return
    seen.add(blockId)
    result.push({ blockId, top: rect.top })
  })

  return result
}

export function useIRReadingBreakpoint(
  options: UseIRReadingBreakpointOptions
): UseIRReadingBreakpointResult {
  const {
    cardId,
    panelId,
    containerRef,
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

  const channelRef = useRef(new BreakpointSaveChannel())
  const debounceRef = useRef<number | null>(null)
  const scrollDebounceRef = useRef<number | null>(null)
  const lastErrorRef = useRef<Error | null>(null)
  const pendingFlushResolvers = useRef<Array<() => void>>([])
  const restoredCardIdRef = useRef<DbId | null>(null)

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
        onSaveSuccess?.()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        lastErrorRef.current = err
        onSaveError?.(err)
        throw err
      } finally {
        const resolvers = pendingFlushResolvers.current
        pendingFlushResolvers.current = []
        resolvers.forEach((r: () => void) => r())
      }
    })
  }, [cardId, enabled, onSaveError, onSaveSuccess])

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
    const container = containerRef.current
    if (!container) return
    const candidates = collectVisibleBlockTops(container)
    const baseline = container.getBoundingClientRect().top + Math.min(80, container.clientHeight * 0.15)
    const resumeBlockId = pickVisibleResumeBlockId(candidates, baseline)
    if (resumeBlockId == null) return
    void persist({
      resumeBlockId,
      selection: null
    })
  }, [cardId, containerRef, enabled, persist])

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

  const restore = useCallback(() => {
    if (!cardId || !enabled) return
    if (restoredCardIdRef.current === cardId) return

    const selection = initialBreakpoint?.selection ?? null
    const targetRootBlockId = selection?.rootBlockId ?? cardId
    const targetBlockId = selection?.focus.blockId ?? initialResumeBlockId
    if (!targetBlockId) {
      restoredCardIdRef.current = cardId
      return
    }

    let cancelled = false
    let attempts = 0

    const tryRestore = async (): Promise<boolean> => {
      const container = targetRootBlockId === cardId
        ? containerRef.current
        : (previewContainerRef?.current ?? containerRef.current)
      if (!container) return false

      const el = findBlockElement(container, targetBlockId)
      if (!el) return false

      el.scrollIntoView({ behavior: "smooth", block: "center" })

      if (selection) {
        try {
          await orca.utils.setSelectionFromCursorData({
            ...selection,
            panelId,
            rootBlockId: selection.rootBlockId
          })
        } catch (error) {
          console.warn("[IR Breakpoint] 恢复选区失败，已滚动到块:", error)
        }
      }

      restoredCardIdRef.current = cardId
      onRestoreSuccess?.()
      return true
    }

    const tick = () => {
      if (cancelled) return
      attempts += 1
      void tryRestore().then(ok => {
        if (cancelled) return
        if (ok) return
        if (attempts >= RESTORE_MAX_ATTEMPTS) {
          onRestoreFailure?.(new Error("断点恢复超时：目标块未渲染"))
          restoredCardIdRef.current = cardId
          return
        }
        window.setTimeout(tick, 250)
      })
    }

    window.setTimeout(tick, 50)

    return () => {
      cancelled = true
    }
  }, [
    cardId,
    containerRef,
    enabled,
    initialBreakpoint,
    initialResumeBlockId,
    onRestoreFailure,
    onRestoreSuccess,
    panelId,
    previewContainerRef
  ])

  // 卡片切换时自动恢复
  useEffect(() => {
    restoredCardIdRef.current = null
    if (!cardId || !enabled) return
    const cancel = restore()
    return () => {
      if (typeof cancel === "function") cancel()
    }
  }, [cardId, enabled, initialResumeBlockId, initialBreakpoint, restore])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const onScroll = () => {
      if (scrollDebounceRef.current != null) window.clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = window.setTimeout(() => {
        scrollDebounceRef.current = null
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed && sel.toString().trim()) return
        captureFromVisibleBlock()
      }, SCROLL_DEBOUNCE_MS)
    }

    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      if (scrollDebounceRef.current != null) window.clearTimeout(scrollDebounceRef.current)
    }
  }, [captureFromVisibleBlock, containerRef, enabled, cardId])

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
