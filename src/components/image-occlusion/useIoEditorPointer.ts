/**
 * 图片遮罩编辑器 pointer 捕获与 session 同步（hook）。
 * sessionRef 在 apply 时同步更新，保证 pointermove 在 React 重渲前可用。
 */

import type { IoRectRegion, IoResizeHandle } from "../../srs/imageOcclusion"
import { clientToRelOnElement } from "./ioGeometry"
import {
  beginDrawInteraction,
  beginMarqueeInteraction,
  beginMoveInteraction,
  beginResizeInteraction,
  cancelIoEditorInteraction,
  commitIoEditorInteraction,
  moveIoEditorInteraction,
  type IoEditorToolMode,
  type IoInteractionSession
} from "./ioEditorInteraction"

const { React } = window as any
const { useCallback, useRef } = React

export type IoPointerBindings = {
  geometryEditable: boolean
  toolMode: IoEditorToolMode
  selectedIds: string[]
  selectedIdSet: Set<string>
  regions: IoRectRegion[]
  readSession: () => IoInteractionSession
  applySession: (next: IoInteractionSession) => void
  setActiveNumber: (n: number) => void
  setSelectedIds: (ids: string[]) => void
  setFocusRegionId: (id: string | null) => void
  setToolModeSelect: () => void
}

export function useIoEditorPointer(bindings: IoPointerBindings) {
  const frameRef = useRef(null as HTMLDivElement | null)
  const sessionRef = useRef(null as IoInteractionSession | null)
  const bRef = useRef(bindings)
  bRef.current = bindings
  sessionRef.current = bindings.readSession()

  const apply = useCallback((next: IoInteractionSession) => {
    sessionRef.current = next
    bRef.current.applySession(next)
  }, [])

  const releasePointer = useCallback(
    (el: HTMLElement | null, pointerId: number) => {
      try {
        if (el?.hasPointerCapture?.(pointerId)) {
          el.releasePointerCapture(pointerId)
        }
      } catch (e) {
        console.error("[ImageOcclusionEditor] releasePointerCapture 失败:", e)
      }
    },
    []
  )

  const cancelActiveInteraction = useCallback(() => {
    const cur = sessionRef.current
    if (!cur?.interaction) return null
    releasePointer(frameRef.current, cur.interaction.pointerId)
    const rolledBack = cancelIoEditorInteraction(cur)
    apply(rolledBack)
    return rolledBack
  }, [apply, releasePointer])

  const onFramePointerDown = useCallback(
    (e: any) => {
      const b = bRef.current
      if (!frameRef.current || !b.geometryEditable) return
      e.preventDefault()
      const p = clientToRelOnElement(e.clientX, e.clientY, frameRef.current)
      try {
        frameRef.current.setPointerCapture(e.pointerId)
      } catch (err) {
        console.error("[ImageOcclusionEditor] setPointerCapture 失败:", err)
      }
      const base = sessionRef.current!
      if (b.toolMode === "draw") {
        apply(beginDrawInteraction(base, e.pointerId, p.x, p.y))
        return
      }
      apply(
        beginMarqueeInteraction(base, e.pointerId, p.x, p.y, !!e.shiftKey)
      )
    },
    [apply]
  )

  const onFramePointerMove = useCallback(
    (e: any) => {
      const cur = sessionRef.current
      if (!cur?.interaction || !frameRef.current) return
      if (cur.interaction.pointerId !== e.pointerId) return
      const p = clientToRelOnElement(e.clientX, e.clientY, frameRef.current)
      apply(moveIoEditorInteraction(cur, e.pointerId, p.x, p.y))
    },
    [apply]
  )

  const onFramePointerUp = useCallback(
    (e: any) => {
      const cur = sessionRef.current
      if (!cur?.interaction || cur.interaction.pointerId !== e.pointerId) return
      releasePointer(frameRef.current, cur.interaction.pointerId)
      apply(commitIoEditorInteraction(cur, e.pointerId))
    },
    [apply, releasePointer]
  )

  const onFramePointerCancel = useCallback(
    (e: any) => {
      const cur = sessionRef.current
      if (!cur?.interaction) return
      if (e?.pointerId != null && cur.interaction.pointerId !== e.pointerId) {
        return
      }
      releasePointer(frameRef.current, cur.interaction.pointerId)
      apply(cancelIoEditorInteraction(cur))
    },
    [apply, releasePointer]
  )

  const onRegionPointerDown = useCallback(
    (e: any, region: IoRectRegion) => {
      const b = bRef.current
      if (!b.geometryEditable || !frameRef.current) return
      e.preventDefault()
      e.stopPropagation()

      if (b.toolMode === "draw") {
        b.setActiveNumber(region.n)
        b.setSelectedIds([region.id])
        b.setFocusRegionId(region.id)
        return
      }

      let nextIds: string[]
      if (e.shiftKey) {
        const set = new Set<string>(b.selectedIds)
        if (set.has(region.id)) {
          set.delete(region.id)
          nextIds = Array.from(set)
          b.setSelectedIds(nextIds)
          b.setFocusRegionId(nextIds.at(-1) ?? null)
          b.setActiveNumber(region.n)
          return
        }
        set.add(region.id)
        nextIds = Array.from(set)
      } else if (b.selectedIdSet.has(region.id) && b.selectedIds.length > 1) {
        nextIds = b.selectedIds
      } else {
        nextIds = [region.id]
      }
      b.setFocusRegionId(region.id)
      b.setActiveNumber(region.n)

      const p = clientToRelOnElement(e.clientX, e.clientY, frameRef.current)
      try {
        frameRef.current.setPointerCapture(e.pointerId)
      } catch (err) {
        console.error("[ImageOcclusionEditor] setPointerCapture 失败:", err)
      }
      const base = {
        ...sessionRef.current!,
        selectedIds: nextIds,
        focusRegionId: region.id,
        activeNumber: region.n
      }
      apply(beginMoveInteraction(base, e.pointerId, p.x, p.y, nextIds))
    },
    [apply]
  )

  const onRegionDoubleClick = useCallback(
    (e: any, region: IoRectRegion) => {
      const b = bRef.current
      if (!b.geometryEditable) return
      e.preventDefault()
      e.stopPropagation()
      cancelActiveInteraction()
      const groupIds = b.regions
        .filter((r: IoRectRegion) => r.n === region.n)
        .map((r: IoRectRegion) => r.id)
      b.setSelectedIds(groupIds)
      b.setFocusRegionId(region.id)
      b.setActiveNumber(region.n)
      b.setToolModeSelect()
    },
    [cancelActiveInteraction]
  )

  const onHandlePointerDown = useCallback(
    (e: any, region: IoRectRegion, handle: IoResizeHandle) => {
      const b = bRef.current
      if (!b.geometryEditable || !frameRef.current || b.toolMode !== "select") {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const p = clientToRelOnElement(e.clientX, e.clientY, frameRef.current)
      try {
        frameRef.current.setPointerCapture(e.pointerId)
      } catch (err) {
        console.error("[ImageOcclusionEditor] setPointerCapture 失败:", err)
      }
      apply(
        beginResizeInteraction(
          sessionRef.current!,
          e.pointerId,
          p.x,
          p.y,
          region,
          handle
        )
      )
    },
    [apply]
  )

  return {
    frameRef,
    sessionRef,
    cancelActiveInteraction,
    onFramePointerDown,
    onFramePointerMove,
    onFramePointerUp,
    onFramePointerCancel,
    onRegionPointerDown,
    onRegionDoubleClick,
    onHandlePointerDown
  }
}
