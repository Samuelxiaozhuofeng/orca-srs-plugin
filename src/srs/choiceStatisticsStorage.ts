/**
 * 选择题统计存储模块
 *
 * 负责选择题卡片的选择统计数据的持久化存储和查询
 * 使用块属性存储，属性名为 "srs.choice.statistics"
 *
 * 存储格式：JSON 字符串
 * {
 *   "version": 1,
 *   "entries": [
 *     {
 *       "timestamp": 1703404800000,
 *       "selectedBlockIds": [123, 456],
 *       "correctBlockIds": [123],
 *       "isCorrect": false
 *     }
 *   ]
 * }
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ChoiceStatisticsEntry, ChoiceStatisticsStorage } from "./types"

// 存储版本号，用于数据迁移
const STORAGE_VERSION = 1

// 属性名称
const STATISTICS_PROPERTY_NAME = "srs.choice.statistics"

// 属性类型：1 = 文本
const PROPERTY_TYPE_TEXT = 1

/**
 * 序列化选择统计数据为 JSON 字符串
 *
 * @param storage - 选择统计存储对象
 * @returns JSON 字符串
 */
export function serializeStatistics(storage: ChoiceStatisticsStorage): string {
  return JSON.stringify(storage)
}

/**
 * 反序列化 JSON 字符串为选择统计数据
 *
 * @param json - JSON 字符串
 * @returns 选择统计存储对象
 * @throws 如果 JSON 解析失败
 */
export function deserializeStatistics(json: string): ChoiceStatisticsStorage {
  const parsed = JSON.parse(json)

  // 验证基本结构
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid statistics data: not an object")
  }

  // 确保 version 存在
  const version = typeof parsed.version === "number" ? parsed.version : STORAGE_VERSION

  // 确保 entries 是数组
  const entries: ChoiceStatisticsEntry[] = Array.isArray(parsed.entries)
    ? parsed.entries.map((entry: any) => ({
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0,
        selectedBlockIds: Array.isArray(entry.selectedBlockIds) ? entry.selectedBlockIds : [],
        correctBlockIds: Array.isArray(entry.correctBlockIds) ? entry.correctBlockIds : [],
        isCorrect: typeof entry.isCorrect === "boolean" ? entry.isCorrect : false
      }))
    : []

  return { version, entries }
}

/**
 * 保存选择统计记录
 *
 * 将新的统计记录追加到现有记录中并持久化到块属性
 *
 * @param blockId - 选择题卡片块 ID
 * @param entry - 新的统计记录
 */
export async function saveChoiceStatistics(
  blockId: DbId,
  entry: ChoiceStatisticsEntry
): Promise<void> {
  // 加载现有统计数据
  const existingEntries = await loadChoiceStatistics(blockId)

  // 追加新记录
  const newStorage: ChoiceStatisticsStorage = {
    version: STORAGE_VERSION,
    entries: [...existingEntries, entry]
  }

  // 序列化并保存
  const jsonData = serializeStatistics(newStorage)

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [{ name: STATISTICS_PROPERTY_NAME, value: jsonData, type: PROPERTY_TYPE_TEXT }]
  )
}

/**
 * 加载选择统计记录
 *
 * 从块属性中读取统计数据，如果不存在或解析失败则返回空数组
 *
 * @param blockId - 选择题卡片块 ID
 * @returns 统计记录数组
 */
export async function loadChoiceStatistics(
  blockId: DbId
): Promise<ChoiceStatisticsEntry[]> {
  try {
    // 获取块数据
    const block = (await orca.invokeBackend("get-block", blockId)) as Block | undefined

    if (!block?.properties) {
      return []
    }

    // 查找统计属性
    const statisticsProp = block.properties.find(
      prop => prop.name === STATISTICS_PROPERTY_NAME
    )

    if (!statisticsProp?.value) {
      return []
    }

    // 反序列化
    const storage = deserializeStatistics(String(statisticsProp.value))
    return storage.entries
  } catch (error) {
    console.warn(`[SRS] 加载选择统计失败 (blockId: ${blockId}):`, error)
    return []
  }
}

/**
 * 选项频率统计结果
 */
export interface OptionFrequency {
  /** 该选项被选中的总次数 */
  total: number
  /** 该选项被错误选中的次数（选中了但不是正确答案） */
  incorrect: number
}

/**
 * 计算选项选择频率
 *
 * 分析统计记录，计算每个选项被选中的次数和错误选中的次数
 * 用于识别高频错误选项（干扰项分析）
 *
 * @param entries - 统计记录数组
 * @param optionBlockIds - 当前选项的 Block ID 列表（用于过滤已删除的选项）
 * @returns 选项频率映射表
 */
export function calculateOptionFrequency(
  entries: ChoiceStatisticsEntry[],
  optionBlockIds: DbId[]
): Map<DbId, OptionFrequency> {
  const frequencyMap = new Map<DbId, OptionFrequency>()

  // 初始化所有当前选项的频率为 0
  const validOptionSet = new Set(optionBlockIds)
  for (const blockId of optionBlockIds) {
    frequencyMap.set(blockId, { total: 0, incorrect: 0 })
  }

  // 遍历所有统计记录
  for (const entry of entries) {
    const correctSet = new Set(entry.correctBlockIds)

    for (const selectedId of entry.selectedBlockIds) {
      // 只统计当前仍存在的选项（忽略已删除的块）
      if (!validOptionSet.has(selectedId)) {
        continue
      }

      const freq = frequencyMap.get(selectedId)
      if (freq) {
        freq.total++
        // 如果选中的不是正确答案，则计入错误次数
        if (!correctSet.has(selectedId)) {
          freq.incorrect++
        }
      }
    }
  }

  return frequencyMap
}

/**
 * 清除选择统计数据
 *
 * 删除块上的统计属性
 *
 * @param blockId - 选择题卡片块 ID
 */
export async function clearChoiceStatistics(blockId: DbId): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [blockId],
    [STATISTICS_PROPERTY_NAME]
  )
}
