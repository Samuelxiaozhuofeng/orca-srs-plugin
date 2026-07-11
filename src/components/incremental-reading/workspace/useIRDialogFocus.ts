const { useEffect, useRef } = window.React

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])"
].join(",")

export function useIRDialogFocus(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = () => {
      const elements = dialog.querySelectorAll(FOCUSABLE_SELECTOR) as NodeListOf<HTMLElement>
      return Array.from(elements).filter((element: HTMLElement) => element.offsetParent !== null)
    }

    const frame = window.requestAnimationFrame(() => {
      const targets = focusable()
      ;(targets[0] ?? dialog).focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return

      const targets = focusable()
      if (targets.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = targets[0]
      const last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", handleKeyDown, true)
      previousFocus?.focus()
    }
  }, [open])

  return dialogRef
}
