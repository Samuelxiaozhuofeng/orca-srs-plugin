import type { DbId } from "../orca.d.ts"

/** Computed overflow-y values that can own a vertical scrollbar. */
const VERTICAL_SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"])

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

export function collectVisibleBlockTops(
  contentContainer: HTMLElement,
  viewportContainer: HTMLElement
): Array<{ blockId: DbId; top: number }> {
  const nodes = contentContainer.querySelectorAll(
    "[data-block-id], [data-blockid], [data-id], [blockid], [id^='block-']"
  )
  const viewportTop = viewportContainer.getBoundingClientRect().top
  const viewportHeight = viewportContainer.clientHeight
  const result: Array<{ blockId: DbId; top: number }> = []
  const seen = new Set<number>()

  nodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return
    const blockId = findBlockIdFromElement(node)
    if (blockId == null || seen.has(blockId)) return
    const rect = node.getBoundingClientRect()
    if (rect.bottom < viewportTop || rect.top > viewportTop + viewportHeight) return
    seen.add(blockId)
    result.push({ blockId, top: rect.top })
  })

  return result
}

export function computeVisibleResumeBaseline(viewportContainer: HTMLElement): number {
  const viewportTop = viewportContainer.getBoundingClientRect().top
  return viewportTop + Math.min(80, viewportContainer.clientHeight * 0.15)
}

export function subscribeToBreakpointScroll(
  scrollContainer: HTMLElement,
  onScroll: () => void
): () => void {
  scrollContainer.addEventListener("scroll", onScroll, { passive: true })
  return () => scrollContainer.removeEventListener("scroll", onScroll)
}
