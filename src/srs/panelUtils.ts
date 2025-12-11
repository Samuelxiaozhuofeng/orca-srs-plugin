/**
 * 面板操作工具函数
 * 
 * 提供 Orca 编辑器面板的查找、检测和调整功能
 */

/**
 * 在面板树中查找当前面板右侧的面板
 * @param node - 面板树节点
 * @param currentPanelId - 当前面板 ID
 * @returns 右侧面板 ID，如果不存在则返回 null
 */
export function findRightPanel(node: any, currentPanelId: string): string | null {
  if (!node) return null

  if (node.type === "hsplit" && node.children?.length === 2) {
    const [leftPanel, rightPanel] = node.children
    if (containsPanel(leftPanel, currentPanelId)) {
      return typeof rightPanel?.id === "string" ? rightPanel.id : extractPanelId(rightPanel)
    }
  }

  if (node.children) {
    for (const child of node.children) {
      const result = findRightPanel(child, currentPanelId)
      if (result) return result
    }
  }

  return null
}

/**
 * 检查面板树节点是否包含指定面板
 * @param node - 面板树节点
 * @param panelId - 要查找的面板 ID
 * @returns 是否包含该面板
 */
export function containsPanel(node: any, panelId: string): boolean {
  if (!node) return false
  if (node.id === panelId) return true
  if (!node.children) return false
  return node.children.some((child: any) => containsPanel(child, panelId))
}

/**
 * 从面板树节点中提取第一个面板 ID
 * @param node - 面板树节点
 * @returns 面板 ID，如果不存在则返回 null
 */
export function extractPanelId(node: any): string | null {
  if (!node) return null
  if (typeof node.id === "string") return node.id
  if (node.children) {
    for (const child of node.children) {
      const result = extractPanelId(child)
      if (result) return result
    }
  }
  return null
}

/**
 * 调度面板尺寸调整
 * 使用 setTimeout 延迟执行，确保面板创建完成后再调整
 * @param basePanelId - 基准面板 ID
 * @param pluginName - 插件名称（用于日志）
 */
export function schedulePanelResize(basePanelId: string, pluginName: string) {
  setTimeout(() => {
    try {
      const totalWidth = window.innerWidth || 1200
      // 50/50 分割：左右各 50%，左侧最小 600px 最大 1200px，右侧最小 600px
      const halfWidth = Math.floor(totalWidth * 0.5)
      const leftWidth = Math.max(600, Math.min(1200, halfWidth))
      const rightWidth = Math.max(600, totalWidth - leftWidth)
      orca.nav.changeSizes(basePanelId, [leftWidth, rightWidth])
    } catch (error) {
      console.warn(`[${pluginName}] 调整面板宽度失败:`, error)
    }
  }, 80)
}
