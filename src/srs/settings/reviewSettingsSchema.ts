/**
 * 复习设置 Schema 模块
 * 
 * 定义复习界面的配置选项
 */

/**
 * 复习设置 Schema 定义
 * 用于 Orca 插件设置界面
 */
export const reviewSettingsSchema = {
  "review.showSiblingBlocks": {
    label: "显示同级子块",
    type: "boolean" as const,
    defaultValue: false,
    description: "在卡片复习界面的答案区域显示所有同级子块（默认只显示第一个子块）"
  },
  "review.maxSiblingBlocks": {
    label: "最大显示子块数量",
    type: "number" as const,
    defaultValue: 10,
    description: "答案区域最多显示的同级子块数量（避免子块过多影响性能）"
  }
}

/**
 * 复习设置接口
 */
export interface ReviewSettings {
  showSiblingBlocks: boolean
  maxSiblingBlocks: number
}

/**
 * 获取复习设置
 * 
 * @param pluginName - 插件名称
 * @returns 复习设置对象
 */
export function getReviewSettings(pluginName: string): ReviewSettings {
  const settings = orca.state.plugins[pluginName]?.settings
  return {
    showSiblingBlocks: settings?.["review.showSiblingBlocks"] ?? false,
    maxSiblingBlocks: settings?.["review.maxSiblingBlocks"] ?? 10
  }
}
