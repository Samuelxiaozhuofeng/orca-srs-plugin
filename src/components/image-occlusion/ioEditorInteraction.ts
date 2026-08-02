/**
 * 图片遮罩编辑器 pointer 状态机（纯函数，无 React）。
 * commit = pointerup 正常提交；cancel = pointercancel / Esc / 切工具·预览 / 关闭。
 */

import {
  createRegionId,
  ioRectsIntersect,
  normalizeRect,
  resizeIoRegionClamped,
  translateIoRegionsClamped,
  type IoRectRegion,
  type IoResizeHandle
} from "../../srs/imageOcclusion"

export type IoEditorToolMode = "draw" | "select"
export type IoEditorPreviewPhase = "edit" | "question" | "answer"

export type IoEditorInteraction =
  | {
      kind: "draw"
      pointerId: number
      startX: number
      startY: number
      currentX: number
      currentY: number
      /** 开始前选区，cancel 时恢复，避免空白点击副作用 */
      prevSelectedIds: string[]
      prevFocusRegionId: string | null
    }
  | {
      kind: "marquee"
      pointerId: number
      startX: number
      startY: number
      currentX: number
      currentY: number
      additive: boolean
      prevSelectedIds: string[]
      prevFocusRegionId: string | null
    }
  | {
      kind: "move"
      pointerId: number
      startX: number
      startY: number
      originRegions: IoRectRegion[]
      ids: string[]
    }
  | {
      kind: "resize"
      pointerId: number
      startX: number
      startY: number
      origin: IoRectRegion
      /** 完整快照，cancel 时整表恢复 */
      originRegions: IoRectRegion[]
      handle: IoResizeHandle
    }

export const IO_RESIZE_HANDLES: readonly IoResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "w",
  "e",
  "sw",
  "s",
  "se"
]

export type IoInteractionSession = {
  interaction: IoEditorInteraction | null
  regions: IoRectRegion[]
  selectedIds: string[]
  focusRegionId: string | null
  activeNumber: number
}

function cloneRegions(regions: readonly IoRectRegion[]): IoRectRegion[] {
  return regions.map(r => ({ ...r }))
}

/** 开始绘制（空白处）；记录先前选区以便 cancel */
export function beginDrawInteraction(
  session: IoInteractionSession,
  pointerId: number,
  x: number,
  y: number
): IoInteractionSession {
  return {
    ...session,
    selectedIds: [],
    focusRegionId: null,
    interaction: {
      kind: "draw",
      pointerId,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      prevSelectedIds: [...session.selectedIds],
      prevFocusRegionId: session.focusRegionId
    }
  }
}

/** 开始框选；非 additive 时先清选，cancel 时恢复 prev */
export function beginMarqueeInteraction(
  session: IoInteractionSession,
  pointerId: number,
  x: number,
  y: number,
  additive: boolean
): IoInteractionSession {
  return {
    ...session,
    selectedIds: additive ? session.selectedIds : [],
    focusRegionId: additive ? session.focusRegionId : null,
    interaction: {
      kind: "marquee",
      pointerId,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      additive,
      prevSelectedIds: [...session.selectedIds],
      prevFocusRegionId: session.focusRegionId
    }
  }
}

export function beginMoveInteraction(
  session: IoInteractionSession,
  pointerId: number,
  x: number,
  y: number,
  ids: string[]
): IoInteractionSession {
  return {
    ...session,
    selectedIds: ids,
    interaction: {
      kind: "move",
      pointerId,
      startX: x,
      startY: y,
      originRegions: cloneRegions(session.regions),
      ids: [...ids]
    }
  }
}

export function beginResizeInteraction(
  session: IoInteractionSession,
  pointerId: number,
  x: number,
  y: number,
  region: IoRectRegion,
  handle: IoResizeHandle
): IoInteractionSession {
  return {
    ...session,
    selectedIds: [region.id],
    focusRegionId: region.id,
    activeNumber: region.n,
    interaction: {
      kind: "resize",
      pointerId,
      startX: x,
      startY: y,
      origin: { ...region },
      originRegions: cloneRegions(session.regions),
      handle
    }
  }
}

/** pointermove：更新草稿坐标或预览几何（基于 origin 快照） */
export function moveIoEditorInteraction(
  session: IoInteractionSession,
  pointerId: number,
  x: number,
  y: number
): IoInteractionSession {
  const cur = session.interaction
  if (!cur || cur.pointerId !== pointerId) return session

  if (cur.kind === "draw" || cur.kind === "marquee") {
    return {
      ...session,
      interaction: { ...cur, currentX: x, currentY: y }
    }
  }
  if (cur.kind === "move") {
    const dx = x - cur.startX
    const dy = y - cur.startY
    return {
      ...session,
      regions: translateIoRegionsClamped(cur.originRegions, cur.ids, dx, dy)
    }
  }
  // resize：几何始终相对 origin，其它区域来自 originRegions 快照
  const dx = x - cur.startX
  const dy = y - cur.startY
  const next = resizeIoRegionClamped(cur.origin, cur.handle, dx, dy)
  return {
    ...session,
    regions: cur.originRegions.map(r => (r.id === next.id ? next : r))
  }
}

/**
 * pointerup 提交。
 * - draw：可能新增区域
 * - marquee：应用框选
 * - move/resize：保留当前 regions
 */
export function commitIoEditorInteraction(
  session: IoInteractionSession,
  pointerId: number
): IoInteractionSession {
  const cur = session.interaction
  if (!cur || cur.pointerId !== pointerId) return session

  if (cur.kind === "draw") {
    const rect = normalizeRect({
      x: Math.min(cur.startX, cur.currentX),
      y: Math.min(cur.startY, cur.currentY),
      w: Math.abs(cur.currentX - cur.startX),
      h: Math.abs(cur.currentY - cur.startY)
    })
    if (rect.w <= 0 || rect.h <= 0) {
      return {
        ...session,
        interaction: null,
        selectedIds: cur.prevSelectedIds,
        focusRegionId: cur.prevFocusRegionId
      }
    }
    const id = createRegionId()
    const region: IoRectRegion = {
      id,
      n: session.activeNumber,
      shape: "rect",
      ...rect
    }
    return {
      ...session,
      interaction: null,
      regions: [...session.regions, region],
      selectedIds: [id],
      focusRegionId: id
    }
  }

  if (cur.kind === "marquee") {
    const box = normalizeRect({
      x: Math.min(cur.startX, cur.currentX),
      y: Math.min(cur.startY, cur.currentY),
      w: Math.abs(cur.currentX - cur.startX),
      h: Math.abs(cur.currentY - cur.startY)
    })
    if (box.w <= 0 || box.h <= 0) {
      // 点击空白：非 additive 已在 begin 清空；additive 保持
      return { ...session, interaction: null }
    }
    const hit = session.regions
      .filter(r => ioRectsIntersect(r, box))
      .map(r => r.id)
    let selectedIds: string[]
    if (cur.additive) {
      const next = new Set(cur.prevSelectedIds)
      for (const id of hit) next.add(id)
      selectedIds = Array.from(next)
    } else {
      selectedIds = hit
    }
    let focusRegionId: string | null = session.focusRegionId
    if (hit.length === 1) focusRegionId = hit[0]!
    else if (hit.length === 0 && !cur.additive) focusRegionId = null
    return {
      ...session,
      interaction: null,
      selectedIds,
      focusRegionId
    }
  }

  // move / resize：几何已在 move 阶段写入
  return { ...session, interaction: null }
}

/**
 * 取消交互并回滚。
 * - move/resize：恢复 originRegions
 * - draw/marquee：不产生新区域/不应用框选；恢复 begin 前选区
 */
export function cancelIoEditorInteraction(
  session: IoInteractionSession
): IoInteractionSession {
  const cur = session.interaction
  if (!cur) return session

  if (cur.kind === "move" || cur.kind === "resize") {
    return {
      ...session,
      interaction: null,
      regions: cloneRegions(cur.originRegions)
    }
  }

  // draw / marquee
  return {
    ...session,
    interaction: null,
    selectedIds: [...cur.prevSelectedIds],
    focusRegionId: cur.prevFocusRegionId
  }
}

/** 草稿矩形（draw / marquee 预览） */
export function getIoInteractionDraftRect(
  interaction: IoEditorInteraction | null
): Pick<IoRectRegion, "x" | "y" | "w" | "h"> | null {
  if (!interaction || (interaction.kind !== "draw" && interaction.kind !== "marquee")) {
    return null
  }
  const rect = normalizeRect({
    x: Math.min(interaction.startX, interaction.currentX),
    y: Math.min(interaction.startY, interaction.currentY),
    w: Math.abs(interaction.currentX - interaction.startX),
    h: Math.abs(interaction.currentY - interaction.startY)
  })
  if (rect.w <= 0 || rect.h <= 0) return null
  return rect
}
