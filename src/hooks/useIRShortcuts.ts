/**
 * 渐进阅读会话快捷键与输入冲突处理
 *
 * - Enter / Shift+Enter / Alt+P / Esc 仅在此处理（不走 Orca 全局 assign）
 * - Alt+X / Alt+Z 交给 Orca 编辑器命令（可重绑定），避免与 React 双重触发
 * - 阅读/编辑模式切换交给 Orca 命令与原生可重绑定快捷键
 * - 弹窗、输入框、contenteditable、IME 组合输入期间停用
 * - 多面板：事件须发生在本会话 DOM 树内
 */

import {
  hasNonEmptyTextSelection,
  isEditableTarget,
  isFocusInSessionShell,
  isInteractiveTarget,
  shouldHandleEnter
} from "./irShortcutRules"

const { useEffect, useCallback, useRef } = window.React

export type IRShortcutHandlers = {
  onNext?: () => void
  onPostpone?: () => void
  onPriority?: () => void
  onEscape?: () => void
}

export type UseIRShortcutsOptions = {
  enabled?: boolean
  panelId: string
  sessionRootRef?: { current: HTMLElement | null }
  handlers: IRShortcutHandlers
}

export {
  hasNonEmptyTextSelection,
  isEditableTarget,
  isFocusInSessionShell,
  isInteractiveTarget,
  shouldHandleEnter
} from "./irShortcutRules"

export function useIRShortcuts(options: UseIRShortcutsOptions): void {
  const { enabled = true, panelId, sessionRootRef, handlers } = options
  const composingRef = useRef(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const onCompositionStart = () => { composingRef.current = true }
    const onCompositionEnd = () => { composingRef.current = false }
    document.addEventListener("compositionstart", onCompositionStart, true)
    document.addEventListener("compositionend", onCompositionEnd, true)
    return () => {
      document.removeEventListener("compositionstart", onCompositionStart, true)
      document.removeEventListener("compositionend", onCompositionEnd, true)
    }
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return
    if (composingRef.current || event.isComposing) return

    const root = sessionRootRef?.current ?? null
    const target = event.target
    const inRoot = Boolean(root && target instanceof Node && root.contains(target))
    if (!inRoot && event.key !== "Escape") return

    const h = handlersRef.current
    const alt = event.altKey
    const shift = event.shiftKey
    const key = event.key
    const editable = isEditableTarget(target)
    const interactive = isInteractiveTarget(target)

    if (key === "Escape") {
      if (!inRoot) return
      event.preventDefault()
      h.onEscape?.()
      return
    }

    if (alt && (key === "p" || key === "P")) {
      event.preventDefault()
      event.stopPropagation()
      h.onPriority?.()
      return
    }

    if (key === "Enter" && shift) {
      if (interactive || (editable && !hasNonEmptyTextSelection())) return
      event.preventDefault()
      event.stopPropagation()
      h.onPostpone?.()
      return
    }

    if (key === "Enter" && !shift) {
      const allow = shouldHandleEnter({
        hasSelection: hasNonEmptyTextSelection(),
        focusInShell: isFocusInSessionShell(root, target),
        isEditable: editable,
        isInteractive: interactive,
        isComposing: false,
        eventInSessionRoot: inRoot
      })
      if (!allow) return
      event.preventDefault()
      event.stopPropagation()
      h.onNext?.()
    }
  }, [enabled, panelId, sessionRootRef])

  useEffect(() => {
    if (!enabled) return
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [enabled, onKeyDown])
}

export default useIRShortcuts
