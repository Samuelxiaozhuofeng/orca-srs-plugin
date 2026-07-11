/**
 * 渐进阅读会话渲染器（兼容入口）
 * 实际 UI 统一为 IRWorkspaceShell，默认进入资料库；可切到专注阅读
 */

import type { DbId } from "../orca.d.ts"
import SrsErrorBoundary from "./SrsErrorBoundary"
import IRWorkspaceShell from "./incremental-reading/workspace/IRWorkspaceShell"
import { consumePendingIRWorkspaceMode } from "./incremental-reading/workspace/irWorkspaceLaunch"

const { useEffect, useState } = window.React
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

export default function IncrementalReadingSessionRenderer(props: RendererProps) {
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

  const [pluginName, setPluginName] = useState("orca-srs")
  const [initialMode] = useState(() => consumePendingIRWorkspaceMode(panelId, "reading"))

  useEffect(() => {
    void (async () => {
      try {
        const { getPluginName } = await import("../main")
        setPluginName(typeof getPluginName === "function" ? getPluginName() : "orca-srs")
      } catch {
        setPluginName("orca-srs")
      }
    })()
  }, [blockId])

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
      reprClassName="srs-ir-session"
      contentClassName="srs-ir-session-content"
      contentJsx={(
        <SrsErrorBoundary componentName="渐进阅读工作区" errorTitle="渐进阅读工作区加载出错">
          <IRWorkspaceShell
            panelId={panelId}
            pluginName={pluginName}
            initialMode={initialMode}
            onClose={() => orca.nav.close(panelId)}
          />
        </SrsErrorBoundary>
      )}
      childrenJsx={null}
    />
  )
}
