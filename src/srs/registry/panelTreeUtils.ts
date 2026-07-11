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
