import type { DbId } from "../../../orca.d.ts"
import type { IRWorkspaceMode } from "./irWorkspaceTypes"

export const IR_WORKSPACE_MODE_EVENT = "orca-srs:ir-workspace-mode"

export type IRWorkspaceModeEventDetail = {
  panelId: string
  mode: IRWorkspaceMode
}

const pendingModes = new Map<string, IRWorkspaceMode>()
const pendingModesByBlockId = new Map<DbId, IRWorkspaceMode>()

export function setPendingIRWorkspaceMode(panelId: string, mode: IRWorkspaceMode): void {
  pendingModes.set(panelId, mode)
}

export function clearPendingIRWorkspaceMode(panelId: string): void {
  pendingModes.delete(panelId)
}

export function setPendingIRWorkspaceModeForBlock(blockId: DbId, mode: IRWorkspaceMode): void {
  pendingModesByBlockId.set(blockId, mode)
}

export function clearPendingIRWorkspaceModeForBlock(blockId: DbId): void {
  pendingModesByBlockId.delete(blockId)
}

export function movePendingIRWorkspaceModeToPanel(blockId: DbId, panelId: string): void {
  const mode = pendingModesByBlockId.get(blockId)
  if (!mode) return
  pendingModesByBlockId.delete(blockId)
  pendingModes.set(panelId, mode)
}

export function consumePendingIRWorkspaceMode(
  panelId: string,
  blockId: DbId | undefined,
  fallback: IRWorkspaceMode
): IRWorkspaceMode {
  if (pendingModes.has(panelId)) {
    const mode = pendingModes.get(panelId)!
    pendingModes.delete(panelId)
    if (blockId !== undefined) {
      pendingModesByBlockId.delete(blockId)
    }
    return mode
  }

  if (blockId !== undefined && pendingModesByBlockId.has(blockId)) {
    const mode = pendingModesByBlockId.get(blockId)!
    pendingModesByBlockId.delete(blockId)
    return mode
  }

  return fallback
}

export function dispatchIRWorkspaceMode(panelId: string, mode: IRWorkspaceMode): void {
  window.dispatchEvent(new CustomEvent<IRWorkspaceModeEventDetail>(IR_WORKSPACE_MODE_EVENT, {
    detail: { panelId, mode }
  }))
}
