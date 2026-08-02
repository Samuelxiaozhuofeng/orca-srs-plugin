/** 图片遮罩编辑器的全局 Escape / Delete 快捷键生命周期。 */

const { React } = window as any
const { useEffect } = React

type IoEditorKeyboardOptions = {
  selectedCount: number
  geometryEditable: boolean
  hasActiveInteraction: () => boolean
  cancelActiveInteraction: () => unknown
  requestClose: () => void
  removeSelected: () => void
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest(
    "input, textarea, select, button, [contenteditable='true']"
  )
}

export function useIoEditorKeyboard({
  selectedCount,
  geometryEditable,
  hasActiveInteraction,
  cancelActiveInteraction,
  requestClose,
  removeSelected
}: IoEditorKeyboardOptions): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (hasActiveInteraction()) {
          cancelActiveInteraction()
        } else {
          requestClose()
        }
        return
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedCount > 0 &&
        geometryEditable &&
        !isInteractiveTarget(event.target)
      ) {
        event.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    selectedCount,
    geometryEditable,
    hasActiveInteraction,
    cancelActiveInteraction,
    requestClose,
    removeSelected
  ])
}
