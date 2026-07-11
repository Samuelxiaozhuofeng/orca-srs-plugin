type PanelTreeNode = {
  id?: string
  view?: string
  children?: PanelTreeNode[]
}

export function findPanelIdByView(node: PanelTreeNode | null | undefined, view: string): string | null {
  if (!node) return null
  if (node.view === view && typeof node.id === "string") return node.id
  for (const child of node.children ?? []) {
    const found = findPanelIdByView(child, view)
    if (found) return found
  }
  return null
}
