/**
 * DOM helpers for locating an extract block inside an ancestor OrcaBlock
 * rendered by IR chapter browse: scroll into view + temporary highlight.
 */

export const IR_LOCATE_HIGHLIGHT_CLASS = "ir-reading__locate-highlight"

/** Clear previous locate highlights under root. */
export function clearLocateHighlight(root: ParentNode | null | undefined): void {
  if (!root || typeof root.querySelectorAll !== "function") return
  const highlighted = root.querySelectorAll(`.${IR_LOCATE_HIGHLIGHT_CLASS}`)
  for (let i = 0; i < highlighted.length; i++) {
    highlighted[i].classList.remove(IR_LOCATE_HIGHLIGHT_CLASS)
  }
}

function findBlockElement(
  root: HTMLElement,
  blockId: string | number
): HTMLElement | null {
  const id = String(blockId)
  // Orca blocks use data-id="39" (string form of the block id).
  const withClass = root.querySelector(`.orca-block[data-id="${id}"]`)
  if (withClass instanceof HTMLElement) return withClass

  // Fallback: any element carrying the same data-id.
  const byAttr = root.querySelector(`[data-id="${id}"]`)
  if (byAttr instanceof HTMLElement) return byAttr

  return null
}

/**
 * Find `.orca-block[data-id="<blockId>"]` (also try `[data-id]` alone) under root.
 * Scroll into view (block nearest / center when possible).
 * Add IR_LOCATE_HIGHLIGHT_CLASS; return true if found.
 * Does not throw if missing.
 */
export function locateBlockInContainer(
  root: HTMLElement | null | undefined,
  blockId: string | number,
  options?: {
    behavior?: ScrollBehavior
    /** if true, clear other highlights first; default true */
    clearOthers?: boolean
  }
): boolean {
  if (!root) return false

  const clearOthers = options?.clearOthers !== false
  if (clearOthers) {
    clearLocateHighlight(root)
  }

  const target = findBlockElement(root, blockId)
  if (!target) return false

  try {
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({
        behavior: options?.behavior ?? "smooth",
        // Prefer center when the UA supports it; "nearest" keeps scroll minimal.
        block: "center",
        inline: "nearest"
      })
    }
  } catch {
    // scrollIntoView can throw in some environments; locate still succeeds.
  }

  target.classList.add(IR_LOCATE_HIGHLIGHT_CLASS)
  return true
}

/**
 * Retry locate until found or attempts exhausted (for async Orca render).
 * Uses requestAnimationFrame if available, else setTimeout(0).
 * Returns a cancel function.
 */
export function scheduleLocateBlock(
  root: HTMLElement | null | undefined,
  blockId: string | number,
  options?: {
    maxAttempts?: number
    onFound?: () => void
    onMiss?: () => void
  }
): () => void {
  const maxAttempts = options?.maxAttempts ?? 20
  let cancelled = false
  let attempts = 0
  let frameId: number | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const clearSchedule = (): void => {
    if (frameId != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameId)
      frameId = null
    }
    if (timeoutId != null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const scheduleNext = (fn: () => void): void => {
    if (typeof requestAnimationFrame === "function") {
      frameId = requestAnimationFrame(() => {
        frameId = null
        fn()
      })
      return
    }
    timeoutId = setTimeout(() => {
      timeoutId = null
      fn()
    }, 0)
  }

  const cancel = (): void => {
    cancelled = true
    clearSchedule()
  }

  const tick = (): void => {
    if (cancelled) return

    attempts += 1
    const found = locateBlockInContainer(root, blockId)
    if (found) {
      options?.onFound?.()
      return
    }

    if (attempts >= maxAttempts) {
      options?.onMiss?.()
      return
    }

    scheduleNext(tick)
  }

  scheduleNext(tick)
  return cancel
}
