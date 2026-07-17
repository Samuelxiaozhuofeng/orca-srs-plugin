import type { DbId } from "../../orca.d.ts"

export type PanelTreeNode = {
  id?: string
  view?: string
  viewArgs?: Record<string, unknown>
  children?: PanelTreeNode[]
}

export function findPanelIdByBlockView(
  node: PanelTreeNode | null | undefined,
  blockId: DbId
): string | null {
  if (!node) return null
  if (
    node.view === "block"
    && typeof node.id === "string"
    && node.viewArgs?.blockId === blockId
  ) {
    return node.id
  }
  for (const child of node.children ?? []) {
    const found = findPanelIdByBlockView(child, blockId)
    if (found) return found
  }
  return null
}

/**
 * Whether a panel's primary view is the given block.
 *
 * Used to gate host `.orca-block-editor` chrome mutations (maximize / hide
 * query tabs / go buttons / sidetools). Only the panel whose main view is
 * this block may manage host chrome; embedded renderings (Journal「当日创建的」、
 * backlinks, query results) must never touch the outer editor.
 *
 * Does not use `renderingMode` — panel main-view identity is the boundary.
 */
export function isPanelMainBlockView(
  panel: PanelTreeNode | null | undefined,
  blockId: DbId
): boolean {
  if (!panel) return false
  return panel.view === "block" && panel.viewArgs?.blockId === blockId
}

/**
 * Whether `SrsReviewSessionDemo` may set host editor maximize / hide chrome.
 *
 * `panel` should be the result of looking up `panelId` in the panel tree
 * (e.g. `orca.nav.findViewPanel(panelId, orca.state.panels)`). Requires a
 * non-empty `panelId` and that panel's main view to be this block.
 */
export function shouldManageHostEditorChrome(
  panel: PanelTreeNode | null | undefined,
  panelId: string | undefined | null,
  blockId: DbId
): boolean {
  if (panelId == null || panelId === "") return false
  if (!panel) return false
  // Fail-closed: missing or mismatched panel.id is not a confirmed main-view panel
  if (panel.id !== panelId) return false
  return isPanelMainBlockView(panel, blockId)
}

/**
 * Whether to invoke `core.panel.toggleWideView` for an IR (or similar) host panel.
 *
 * Requires host-chrome management permission, not already attempted this mount,
 * and the real `ViewPanel.wide` must not already be true (toggle would narrow it).
 * `panelWide` must come from `findViewPanel(...).wide`, not `isWide` / map lookup.
 */
export function shouldInvokePanelWideViewToggle(
  allowHostChrome: boolean,
  panelWide: boolean | undefined,
  alreadyAttemptedThisMount: boolean
): boolean {
  if (!allowHostChrome || alreadyAttemptedThisMount) return false
  return panelWide !== true
}
