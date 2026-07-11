import type { DbId } from "../orca.d.ts"

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
