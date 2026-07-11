import { IR_WORKSPACE_PANEL_TYPE } from "./panelTypes"

type PanelRegistry = {
  registerPanel: (type: string, renderer: any) => void
  unregisterPanel: (type: string) => void
}

export function registerIRWorkspacePanel(registry: PanelRegistry, renderer: any): void {
  registry.registerPanel(IR_WORKSPACE_PANEL_TYPE, renderer)
}

export function unregisterIRWorkspacePanel(registry: PanelRegistry): void {
  registry.unregisterPanel(IR_WORKSPACE_PANEL_TYPE)
}
