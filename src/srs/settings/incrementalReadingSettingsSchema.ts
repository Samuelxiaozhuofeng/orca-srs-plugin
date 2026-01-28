/**
 * 渐进阅读设置 Schema 模块
 *
 * 定义渐进阅读相关功能的设置项
 */

export const INCREMENTAL_READING_SETTINGS_KEYS = {
  enableAutoExtractMark: "enableAutoExtractMark"
} as const

/**
 * 渐进阅读设置 Schema 定义
 * 用于 Orca 插件设置界面
 */
export const incrementalReadingSettingsSchema = {
  [INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark]: {
    label: "启用渐进阅读自动标签",
    type: "boolean" as const,
    defaultValue: false,
    description: "启用后自动为渐进阅读 Topic 的子块标记为 Extract"
  }
}

/**
 * 渐进阅读设置接口
 */
export interface IncrementalReadingSettings {
  enableAutoExtractMark: boolean
}

/**
 * 获取渐进阅读设置
 *
 * @param pluginName - 插件名称
 * @returns 渐进阅读设置对象
 */
export function getIncrementalReadingSettings(pluginName: string): IncrementalReadingSettings {
  const settings = orca.state.plugins[pluginName]?.settings
  return {
    enableAutoExtractMark:
      settings?.[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark] ??
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark].defaultValue
  }
}
