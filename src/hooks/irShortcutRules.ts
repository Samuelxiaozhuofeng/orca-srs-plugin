/**
 * 会话快捷键冲突规则（纯函数，无 React 依赖）
 */

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  if (target.closest?.("[contenteditable='true']")) return true
  if (target.closest?.("input, textarea, select, [role='dialog'], .orca-modal, .orca-dialog")) {
    return true
  }
  return false
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest(
    "button, a[href], [role='button'], [role='menuitem'], [role='option'], [role='tab'], summary"
  ))
}

export function hasNonEmptyTextSelection(getSelection: () => Selection | null = () => window.getSelection()): boolean {
  const sel = getSelection()
  if (!sel || sel.isCollapsed) return false
  return Boolean(sel.toString().trim())
}

export function isFocusInSessionShell(
  sessionRoot: HTMLElement | null,
  target: EventTarget | null
): boolean {
  if (!sessionRoot || !(target instanceof Node)) return false
  if (!sessionRoot.contains(target)) return false
  if (target instanceof HTMLElement && (
    isEditableTarget(target) || isInteractiveTarget(target)
  )) return false
  return true
}

export function shouldHandleEnter(args: {
  hasSelection: boolean
  focusInShell: boolean
  isEditable: boolean
  isInteractive: boolean
  isComposing: boolean
  eventInSessionRoot: boolean
}): boolean {
  if (args.isComposing) return false
  if (args.isInteractive) return false
  if (!args.eventInSessionRoot && !args.hasSelection && !args.focusInShell) return false
  if (args.hasSelection) return true
  if (args.focusInShell) return true
  if (args.isEditable) return false
  return args.eventInSessionRoot
}
