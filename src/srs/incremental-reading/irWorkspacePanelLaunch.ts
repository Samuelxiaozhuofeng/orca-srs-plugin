import type { DbId } from "../../orca.d.ts"
import type { IRWorkspaceMode } from "../../components/incremental-reading/workspace/irWorkspaceTypes"
import {
  clearPendingIRWorkspaceMode,
  clearPendingIRWorkspaceModeForBlock,
  dispatchIRWorkspaceMode,
  movePendingIRWorkspaceModeToPanel,
  setPendingIRWorkspaceMode,
  setPendingIRWorkspaceModeForBlock
} from "../../components/incremental-reading/workspace/irWorkspaceLaunch"
import { getOrCreateIncrementalReadingSessionBlock } from "../incrementalReadingSessionManager"
import { findPanelIdByBlockView, type PanelTreeNode } from "../registry/panelTreeUtils"

export type IRWorkspaceNav = {
  goTo: (view: string, viewArgs: Record<string, unknown>, panelId: string) => void
  addTo: (
    panelId: string,
    position: "left" | "right" | "top" | "bottom",
    config: { view: string; viewArgs: Record<string, unknown>; viewState: Record<string, unknown> }
  ) => string | null
  switchFocusTo: (panelId: string) => void
}

export type OpenIRWorkspaceOptions = {
  pluginName: string
  mode: IRWorkspaceMode
  openInCurrentPanel?: boolean
}

export type OpenIRWorkspaceDeps = {
  getSessionBlockId: (pluginName: string) => Promise<DbId>
  getActivePanelId: () => string | null | undefined
  getPanels: () => PanelTreeNode
  nav: IRWorkspaceNav
  notify: (level: string, message: string, opts?: { title?: string }) => void
}

export async function openIRWorkspaceWithDeps(
  deps: OpenIRWorkspaceDeps,
  options: OpenIRWorkspaceOptions
): Promise<void> {
  const { pluginName, mode, openInCurrentPanel = false } = options
  const activePanelId = deps.getActivePanelId()

  if (!activePanelId) {
    deps.notify("warn", "当前没有可用的面板", { title: "渐进阅读" })
    return
  }

  const blockId = await deps.getSessionBlockId(pluginName)
  const panels = deps.getPanels()
  const existingPanelId = findPanelIdByBlockView(panels, blockId)

  if (existingPanelId) {
    dispatchIRWorkspaceMode(existingPanelId, mode)
    deps.nav.switchFocusTo(existingPanelId)
    return
  }

  if (openInCurrentPanel) {
    setPendingIRWorkspaceMode(activePanelId, mode)
    try {
      deps.nav.goTo("block", { blockId }, activePanelId)
    } catch (error) {
      clearPendingIRWorkspaceMode(activePanelId)
      throw error
    }
    deps.notify("success", "渐进阅读面板已打开", { title: "渐进阅读" })
    return
  }

  setPendingIRWorkspaceModeForBlock(blockId, mode)
  let rightPanelId: string | null
  try {
    rightPanelId = deps.nav.addTo(activePanelId, "right", {
      view: "block",
      viewArgs: { blockId },
      viewState: {}
    })
  } catch (error) {
    clearPendingIRWorkspaceModeForBlock(blockId)
    throw error
  }

  if (!rightPanelId) {
    clearPendingIRWorkspaceModeForBlock(blockId)
    deps.notify("error", "无法创建侧边面板", { title: "渐进阅读" })
    return
  }

  movePendingIRWorkspaceModeToPanel(blockId, rightPanelId)
  deps.nav.switchFocusTo(rightPanelId)
  deps.notify("success", "渐进阅读面板已在右侧打开", { title: "渐进阅读" })
}

export async function openIRWorkspace(options: OpenIRWorkspaceOptions): Promise<void> {
  await openIRWorkspaceWithDeps({
    getSessionBlockId: getOrCreateIncrementalReadingSessionBlock,
    getActivePanelId: () => orca.state.activePanel,
    getPanels: () => orca.state.panels,
    nav: orca.nav,
    notify: (level, message, opts) => orca.notify(level as any, message, opts as any)
  }, options)
}
