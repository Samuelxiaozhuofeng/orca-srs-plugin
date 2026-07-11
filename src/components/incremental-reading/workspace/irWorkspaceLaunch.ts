import type { IRWorkspaceMode } from "./irWorkspaceTypes"

export const IR_WORKSPACE_MODE_EVENT = "orca-srs:ir-workspace-mode"

export type IRWorkspaceModeEventDetail = {
  panelId: string
  mode: IRWorkspaceMode
}

const pendingModes = new Map<string, IRWorkspaceMode>()

export function setPendingIRWorkspaceMode(panelId: string, mode: IRWorkspaceMode): void {
  pendingModes.set(panelId, mode)
}

export function consumePendingIRWorkspaceMode(
  panelId: string,
  fallback: IRWorkspaceMode
): IRWorkspaceMode {
  const mode = pendingModes.get(panelId) ?? fallback
  pendingModes.delete(panelId)
  return mode
}

export function dispatchIRWorkspaceMode(panelId: string, mode: IRWorkspaceMode): void {
  window.dispatchEvent(new CustomEvent<IRWorkspaceModeEventDetail>(IR_WORKSPACE_MODE_EVENT, {
    detail: { panelId, mode }
  }))
}
