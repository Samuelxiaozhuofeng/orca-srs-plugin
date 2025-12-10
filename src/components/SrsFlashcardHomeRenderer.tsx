import type { DbId } from "../orca.d.ts"
import SrsFlashcardHome from "./SrsFlashcardHome"
import SrsErrorBoundary from "./SrsErrorBoundary"

const { BlockShell } = orca.components

type RendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
}

export default function SrsFlashcardHomeRenderer(props: RendererProps) {
  const {
    panelId,
    blockId,
    rndId,
    blockLevel,
    indentLevel,
    mirrorId,
    initiallyCollapsed,
    renderingMode
  } = props

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="srs-repr-flashcard-home"
      contentClassName="srs-repr-flashcard-home-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={
        <SrsErrorBoundary componentName="闪卡主页" errorTitle="闪卡主页加载出错">
          <SrsFlashcardHome panelId={panelId} blockId={blockId} />
        </SrsErrorBoundary>
      }
      childrenJsx={null}
    />
  )
}
