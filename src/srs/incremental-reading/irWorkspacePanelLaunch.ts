import type { DbId } from "../../orca.d.ts"
import type { IRWorkspaceMode } from "../../components/incremental-reading/workspace/irWorkspaceTypes"
import type {
  IRWorkspaceLaunchRequest
} from "../../components/incremental-reading/workspace/irWorkspaceLaunch"
import {
  clearPendingIRWorkspaceMode,
  clearPendingIRWorkspaceModeForBlock,
  dispatchIRWorkspaceLaunch,
  movePendingIRWorkspaceModeToPanel,
  setPendingIRWorkspaceLaunch,
  setPendingIRWorkspaceLaunchForBlock
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
  /** 打开后自动装配今日队列（今日学习 / 继续） */
  autoStart?: boolean
  sessionLaunchMode?: "mixed" | "read-only"
}

export type OpenIRWorkspaceDeps = {
  getSessionBlockId: (pluginName: string) => Promise<DbId>
  getActivePanelId: () => string | null | undefined
  getPanels: () => PanelTreeNode
  nav: IRWorkspaceNav
  notify: (level: string, message: string, opts?: { title?: string }) => void
}

function buildLaunchRequest(options: OpenIRWorkspaceOptions): IRWorkspaceLaunchRequest {
  const request: IRWorkspaceLaunchRequest = { mode: options.mode }
  if (options.autoStart === true) {
    request.autoStart = true
    request.sessionLaunchMode = options.sessionLaunchMode ?? "mixed"
  }
  if (options.sessionLaunchMode !== undefined && !request.sessionLaunchMode) {
    request.sessionLaunchMode = options.sessionLaunchMode
  }
  return request
}

export async function openIRWorkspaceWithDeps(
  deps: OpenIRWorkspaceDeps,
  options: OpenIRWorkspaceOptions
): Promise<void> {
  const { pluginName, openInCurrentPanel = false } = options
  const launchRequest = buildLaunchRequest(options)
  const activePanelId = deps.getActivePanelId()

  if (!activePanelId) {
    deps.notify("warn", "当前没有可用的面板", { title: "阅读材料" })
    return
  }

  const blockId = await deps.getSessionBlockId(pluginName)
  const panels = deps.getPanels()
  const existingPanelId = findPanelIdByBlockView(panels, blockId)

  if (existingPanelId) {
    dispatchIRWorkspaceLaunch(existingPanelId, launchRequest)
    deps.nav.switchFocusTo(existingPanelId)
    return
  }

  if (openInCurrentPanel) {
    setPendingIRWorkspaceLaunch(activePanelId, launchRequest)
    try {
      deps.nav.goTo("block", { blockId }, activePanelId)
    } catch (error) {
      clearPendingIRWorkspaceMode(activePanelId)
      throw error
    }
    deps.notify("success", "阅读工作区已打开", { title: "今日学习" })
    return
  }

  setPendingIRWorkspaceLaunchForBlock(blockId, launchRequest)
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
    deps.notify("error", "无法创建侧边面板", { title: "今日学习" })
    return
  }

  movePendingIRWorkspaceModeToPanel(blockId, rightPanelId)
  deps.nav.switchFocusTo(rightPanelId)
  deps.notify("success", "阅读工作区已在右侧打开", { title: "今日学习" })
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
