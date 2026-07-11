import type { DbId } from "../orca.d.ts"

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