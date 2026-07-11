import type { IRWorkspaceMode } from "../../components/incremental-reading/workspace/irWorkspaceTypes"

export type IRWorkspacePanelArgs = {
  mode: IRWorkspaceMode
  pluginName: string | null
}

export function parseIRWorkspacePanelArgs(
  viewArgs: Record<string, unknown> | null | undefined,
  fallbackMode: IRWorkspaceMode = "library"
): IRWorkspacePanelArgs {
  const rawMode = viewArgs?.mode
  const rawPluginName = viewArgs?.pluginName
  return {
    mode: rawMode === "library" || rawMode === "reading" ? rawMode : fallbackMode,
    pluginName: typeof rawPluginName === "string" && rawPluginName.trim()
      ? rawPluginName
      : null
  }
}
