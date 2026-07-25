import type { DbId } from "../orca.d.ts"

/** Computed overflow-y values that can own a vertical scrollbar. */
const VERTICAL_SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"])

/** 恢复几何稳定：连续两次误差 ≤ 该值视为对齐完成 */
export const VIEWPORT_ALIGN_EPSILON_PX = 8

function parseBlockIdAttr(raw: string | null): DbId | null {
  if (!raw) return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function hasVerticalScrollableOverflow(el: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(el).overflowY
  return VERTICAL_SCROLLABLE_OVERFLOW.has(overflowY)
}

/**
 * Resolve the element that actually owns vertical scrolling for IR reading.
 *
 * Starts at the session-internal container (typically `.ir-reading__scroll`) and
 * walks ancestors (including the start node). Picks the nearest node whose
 * computed overflow-y is scrollable and whose scrollHeight exceeds clientHeight.
 *
 * When the internal node expands with content (no local scroll range) but a host
 * editor ancestor scrolls, that ancestor is returned. When the internal node is
 * itself scrollable, it wins (nearest match). Falls back to `start` when no
 * scrollable ancestor has a range — so reset/subscribe still have a target.
 *
 * Scoped to the start node's ancestor chain only; never selects a global panel.
 */
export function resolveVerticalScrollOwner(
  start: HTMLElement | null | undefined
): HTMLElement | null {
  if (!start) return null

  let current: HTMLElement | null = start
  while (current) {
    if (
      hasVerticalScrollableOverflow(current) &&
      current.scrollHeight > current.clientHeight
    ) {
      return current
    }
    current = current.parentElement
  }

  return start
}

/**
 * 规范 IR 块节点：仅 `.orca-block[data-id]`（与章节 locate / 运行时 Orca 一致）。
 * 不收集裸 `[data-id]`，避免命中非块节点或错误外层。
 */
export function collectVisibleBlockTops(
  contentContainer: HTMLElement,
  viewportContainer: HTMLElement
): Array<{ blockId: DbId; top: number; element: HTMLElement }> {
  const nodes = contentContainer.querySelectorAll(".orca-block[data-id]")
  const viewportRect = viewportContainer.getBoundingClientRect()
  const viewportTop = viewportRect.top
  const viewportBottom = viewportTop + viewportContainer.clientHeight
  const result: Array<{ blockId: DbId; top: number; element: HTMLElement }> = []
  const seen = new Set<number>()

  nodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return
    const blockId = parseBlockIdAttr(node.getAttribute("data-id"))
    if (blockId == null || seen.has(blockId)) return
    const rect = node.getBoundingClientRect()
    // 严格可见交集：与视口无重叠则跳过
    if (rect.bottom <= viewportTop || rect.top >= viewportBottom) return
    seen.add(blockId)
    result.push({ blockId, top: rect.top, element: node })
  })

  return result
}

/** 阅读线相对视口顶部的偏移（px），与 baseline 绝对 Y 语义一致 */
export function computeReadingLineOffsetPx(viewportContainer: HTMLElement): number {
  return Math.min(80, viewportContainer.clientHeight * 0.15)
}

export function computeVisibleResumeBaseline(viewportContainer: HTMLElement): number {
  const viewportTop = viewportContainer.getBoundingClientRect().top
  return viewportTop + computeReadingLineOffsetPx(viewportContainer)
}

/**
 * 目标块顶相对滚动 owner 顶部的偏移。
 * 负值表示块顶在视口上方（长块内进度）。
 */
export function measureBlockTopOffsetPx(
  blockElement: HTMLElement,
  scrollOwner: HTMLElement
): number {
  const ownerTop = scrollOwner.getBoundingClientRect().top
  return blockElement.getBoundingClientRect().top - ownerTop
}

/**
 * 将块顶对齐到 owner 顶部 + topOffsetPx（确定性 scrollTop 调整，无 smooth）。
 * 返回对齐后的残差（再测一次）；无 getBoundingClientRect 时返回 0。
 */
export function alignBlockTopOffset(
  blockElement: HTMLElement,
  scrollOwner: HTMLElement,
  topOffsetPx: number
): number {
  if (typeof scrollOwner.getBoundingClientRect !== "function") {
    return 0
  }
  const current = measureBlockTopOffsetPx(blockElement, scrollOwner)
  const delta = current - topOffsetPx
  if (delta !== 0) {
    scrollOwner.scrollTop += delta
  }
  if (typeof blockElement.getBoundingClientRect !== "function") {
    return 0
  }
  return measureBlockTopOffsetPx(blockElement, scrollOwner) - topOffsetPx
}

export function subscribeToBreakpointScroll(
  scrollContainer: HTMLElement,
  onScroll: () => void
): () => void {
  scrollContainer.addEventListener("scroll", onScroll, { passive: true })
  return () => scrollContainer.removeEventListener("scroll", onScroll)
}
