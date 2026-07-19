/**
 * Decide whether a pointer event should dismiss the IR "更多操作" panel.
 *
 * Keep open when the event is inside the panel, on the footer toggle (toggle
 * owns that click), or on Orca floating UI that may portal outside the panel
 * (ConfirmBox / Popup / Modal).
 */

const KEEP_OPEN_MORE_SELECTOR = [
  ".ir-reading__more",
  // more 切换钮（data-ir-more-toggle）；勿用泛化 [aria-expanded]——重要性按钮也有 aria-expanded
  "[data-ir-more-toggle]",
  // Orca ConfirmBox / Popup / Modal 可能 portal 到面板外
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="alertdialog"]',
  ".orca-popup",
  ".orca-menu",
  ".orca-modal"
].join(", ")

const KEEP_OPEN_IMPORTANCE_SELECTOR = [
  ".ir-reading__importance",
  "[data-ir-importance-toggle]",
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="alertdialog"]',
  ".orca-popup",
  ".orca-menu",
  ".orca-modal"
].join(", ")

export function resolveEventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Node) {
    const parent = target.parentElement
    return parent instanceof Element ? parent : null
  }
  return null
}

/** @returns true when the more panel should close */
export function shouldDismissIRMorePanel(target: EventTarget | null): boolean {
  const el = resolveEventElement(target)
  if (!el) return true
  return el.closest(KEEP_OPEN_MORE_SELECTOR) == null
}

/** @returns true when the importance panel should close */
export function shouldDismissIRImportancePanel(target: EventTarget | null): boolean {
  const el = resolveEventElement(target)
  if (!el) return true
  return el.closest(KEEP_OPEN_IMPORTANCE_SELECTOR) == null
}
