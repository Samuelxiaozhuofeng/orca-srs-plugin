/**
 * 面板注册模块
 *
 * 负责注册和注销自定义 Panel 渲染器
 */

import IncrementalReadingWorkspacePanel from "../../panels/IncrementalReadingWorkspacePanel"
import { IR_WORKSPACE_PANEL_TYPE } from "./panelTypes"
import { registerIRWorkspacePanel, unregisterIRWorkspacePanel } from "./panelRegistration"

export { IR_WORKSPACE_PANEL_TYPE }

export function registerPanels(_pluginName: string): void {
  registerIRWorkspacePanel(orca.panels, IncrementalReadingWorkspacePanel)
}

export function unregisterPanels(_pluginName?: string): void {
  unregisterIRWorkspacePanel(orca.panels)
}
