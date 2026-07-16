/**
 * 统计页用户偏好持久化（时间范围 / 选中牌组）
 */

import type { TimeRange } from "../types"

/**
 * 用户统计偏好设置
 */
export interface StatisticsPreferences {
  timeRange: TimeRange
  selectedDeck?: string
}

// 存储键
const PREFERENCES_KEY = "statisticsPreferences"

// 默认偏好设置
const DEFAULT_PREFERENCES: StatisticsPreferences = {
  timeRange: "1month",
  selectedDeck: undefined
}

/**
 * 获取用户统计偏好设置
 *
 * @param pluginName - 插件名称
 * @returns 用户偏好设置
 */
export async function getStatisticsPreferences(
  pluginName: string
): Promise<StatisticsPreferences> {
  try {
    const storedData = await orca.plugins.getData(pluginName, PREFERENCES_KEY) as string | null
    if (!storedData) {
      return { ...DEFAULT_PREFERENCES }
    }

    const preferences = JSON.parse(storedData) as Partial<StatisticsPreferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...preferences
    }
  } catch (error) {
    console.warn(`[${pluginName}] 加载统计偏好设置失败:`, error)
    return { ...DEFAULT_PREFERENCES }
  }
}

/**
 * 保存用户统计偏好设置
 *
 * @param pluginName - 插件名称
 * @param preferences - 偏好设置（部分或全部）
 */
export async function saveStatisticsPreferences(
  pluginName: string,
  preferences: Partial<StatisticsPreferences>
): Promise<void> {
  try {
    const currentPreferences = await getStatisticsPreferences(pluginName)
    const newPreferences: StatisticsPreferences = {
      ...currentPreferences,
      ...preferences
    }

    await orca.plugins.setData(pluginName, PREFERENCES_KEY, JSON.stringify(newPreferences))
  } catch (error) {
    console.error(`[${pluginName}] 保存统计偏好设置失败:`, error)
    throw error
  }
}

/**
 * 保存时间范围偏好
 *
 * @param pluginName - 插件名称
 * @param timeRange - 时间范围
 */
export async function saveTimeRangePreference(
  pluginName: string,
  timeRange: TimeRange
): Promise<void> {
  await saveStatisticsPreferences(pluginName, { timeRange })
}

/**
 * 保存选中的牌组偏好
 *
 * @param pluginName - 插件名称
 * @param deckName - 牌组名称（undefined 表示全部牌组）
 */
export async function saveSelectedDeckPreference(
  pluginName: string,
  deckName?: string
): Promise<void> {
  await saveStatisticsPreferences(pluginName, { selectedDeck: deckName })
}
