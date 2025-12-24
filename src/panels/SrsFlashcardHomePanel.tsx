import type { PanelProps } from "../orca.d.ts"
import SrsFlashcardHome from "../components/SrsFlashcardHome"
import SrsErrorBoundary from "../components/SrsErrorBoundary"
import { attachHideableDisplayManager } from "../srs/hideableDisplayManager"

export default function SrsFlashcardHomePanel(props: PanelProps) {
  const { panelId } = props
  const { useEffect, useRef } = window.React
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const rootEl = rootRef.current
    if (!rootEl) return

    const hideableEl = rootEl.closest(".orca-hideable") as HTMLElement | null

    const restored: Array<() => void> = []

    restored.push(attachHideableDisplayManager(rootEl))

    if (hideableEl) {
      const prevFlex = hideableEl.style.flex
      const prevMinWidth = hideableEl.style.minWidth
      const prevWidth = hideableEl.style.width
      hideableEl.style.flex = "1"
      hideableEl.style.minWidth = "0"
      hideableEl.style.width = "100%"
      restored.push(() => {
        hideableEl.style.flex = prevFlex
        hideableEl.style.minWidth = prevMinWidth
        hideableEl.style.width = prevWidth
      })
    }

    return () => {
      for (const restore of restored) restore()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="srs-flashcard-home-panel"
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0
      }}
    >
      <SrsErrorBoundary componentName="闪卡主页" errorTitle="闪卡主页加载出错">
        <SrsFlashcardHome panelId={panelId} pluginName="srs-plugin" />
      </SrsErrorBoundary>
    </div>
  )
}
