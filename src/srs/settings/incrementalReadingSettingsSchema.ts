/**
 * 渐进阅读设置 Schema 模块
 *
 * 定义渐进阅读相关功能的设置项
 */

export const INCREMENTAL_READING_SETTINGS_KEYS = {
  enableAutoExtractMark: "enableAutoExtractMark",
  topicQuotaPercent: "topicQuotaPercent",
  dailyLimit: "dailyLimit",
  enableAutoDefer: "enableAutoDefer"
} as const

export const DEFAULT_IR_TOPIC_QUOTA_PERCENT = 20
export const DEFAULT_IR_DAILY_LIMIT = 30

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
  },
  [INCREMENTAL_READING_SETTINGS_KEYS.topicQuotaPercent]: {
    label: "Topic 配额比例（%）",
    type: "number" as const,
    defaultValue: DEFAULT_IR_TOPIC_QUOTA_PERCENT,
    description: "渐进阅读队列中 Topic 的目标占比，默认 20%"
  },
  [INCREMENTAL_READING_SETTINGS_KEYS.dailyLimit]: {
    label: "每日渐进阅读上限",
    type: "number" as const,
    defaultValue: DEFAULT_IR_DAILY_LIMIT,
    description: "每天最多推送的渐进阅读卡片数量，设为 0 表示不限制"
  },
  [INCREMENTAL_READING_SETTINGS_KEYS.enableAutoDefer]: {
    label: "启用溢出推后按钮",
    type: "boolean" as const,
    defaultValue: true,
    description: "当到期卡超过每日上限时，显示“一键把溢出推后”按钮；打开面板只展示，不会自动改排期"
  }
}

/**
 * 渐进阅读设置接口
 */
export interface IncrementalReadingSettings {
  enableAutoExtractMark: boolean
  topicQuotaPercent: number
  dailyLimit: number
  enableAutoDefer: boolean
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
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark].defaultValue,
    topicQuotaPercent:
      settings?.[INCREMENTAL_READING_SETTINGS_KEYS.topicQuotaPercent] ??
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.topicQuotaPercent].defaultValue,
    dailyLimit:
      settings?.[INCREMENTAL_READING_SETTINGS_KEYS.dailyLimit] ??
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.dailyLimit].defaultValue,
    enableAutoDefer:
      settings?.[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoDefer] ??
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoDefer].defaultValue
  }
}
