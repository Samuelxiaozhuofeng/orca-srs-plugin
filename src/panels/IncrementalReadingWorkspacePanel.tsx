/**
 * 渐进阅读统一工作区自定义 Panel
 *
 * 接收 PanelProps，读取 viewArgs 并渲染 IRWorkspaceShell 纯 React 外壳
 */

import type { PanelProps } from "../orca.d.ts"
import type { IRWorkspaceMode } from "../components/incremental-reading/workspace/irWorkspaceTypes"
import SrsErrorBoundary from "../components/SrsErrorBoundary"
import IRWorkspaceShell from "../components/incremental-reading/workspace/IRWorkspaceShell"
import { consumePendingIRWorkspaceMode } from "../components/incremental-reading/workspace/irWorkspaceLaunch"
import { parseIRWorkspacePanelArgs } from "../srs/registry/panelViewArgs"

const { useEffect, useState } = window.React
const { useSnapshot } = window.Valtio

export default function IncrementalReadingWorkspacePanel(props: PanelProps) {
  const { panelId } = props
  const snapshot = useSnapshot(orca.state)
  const panel = orca.nav.findViewPanel(panelId, snapshot.panels)
  const viewArgs = panel?.viewArgs ?? {}
  const fallbackMode = consumePendingIRWorkspaceMode(panelId, "library")
  const panelArgs = parseIRWorkspacePanelArgs(viewArgs, fallbackMode)
  const initialMode: IRWorkspaceMode = panelArgs.mode
  const rawPluginName = panelArgs.pluginName
  const [pluginName, setPluginName] = useState<string>(
    rawPluginName ?? "orca-srs"
  )

  useEffect(() => {
    if (rawPluginName) {
      setPluginName(rawPluginName)
      return
    }
    void (async () => {
      try {
        const { getPluginName } = await import("../main")
        const name = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
        setPluginName(name)
      } catch {
        setPluginName("orca-srs")
      }
    })()
  }, [rawPluginName])

  return (
    <div
      className="srs-ir-workspace-panel"
      style={{
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <SrsErrorBoundary componentName="渐进阅读工作区" errorTitle="渐进阅读工作区加载出错">
        <IRWorkspaceShell
          panelId={panelId}
          pluginName={pluginName}
          initialMode={initialMode}
          onClose={() => orca.nav.close(panelId)}
        />
      </SrsErrorBoundary>
    </div>
  )
}
