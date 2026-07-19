/**
 * Near-context DOM: hide the extract's own .orca-block under the parent
 * context root so surrounding siblings remain visible without duplicating body.
 */

import type { DbId } from "../../orca.d.ts"

export const IR_CONTEXT_HIDE_CLASS = "ir-reading__context-hide-self"

/**
 * Mark matching `.orca-block[data-id="<hideBlockId>"]` under root with
 * IR_CONTEXT_HIDE_CLASS. Clear the class from any other nodes under root that
 * still carry it for a different id. Returns how many nodes are marked.
 */
export function applyContextHideSelf(
  root: HTMLElement | null,
  hideBlockId: DbId | string
): number {
  if (!root || typeof root.querySelectorAll !== "function") return 0

  const id = String(hideBlockId)

  const stale = root.querySelectorAll(`.${IR_CONTEXT_HIDE_CLASS}`)
  for (let i = 0; i < stale.length; i++) {
    const el = stale[i]
    if (!(el instanceof HTMLElement)) continue
    if (el.getAttribute("data-id") === id && el.classList.contains("orca-block")) {
      continue
    }
    el.classList.remove(IR_CONTEXT_HIDE_CLASS)
  }

  let marked = 0
  const targets = root.querySelectorAll(`.orca-block[data-id="${id}"]`)
  for (let i = 0; i < targets.length; i++) {
    const el = targets[i]
    if (!(el instanceof HTMLElement)) continue
    el.classList.add(IR_CONTEXT_HIDE_CLASS)
    marked += 1
  }
  return marked
}
