/**
 * 选择题统计存储模块（FC-08）
 *
 * 负责选择题卡片的选择统计数据的持久化存储和查询。
 * 使用**单块属性**方案：属性名 `srs.choice.statistics`，类型 Text（JSON 字符串）。
 * 每次全量重写该属性；为控制体积，仅保留最近 {@link MAX_CHOICE_STATISTICS_ENTRIES} 条。
 *
 * 存储格式：
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
 *
 * 安全约定：
 * - 仅当块存在且属性缺失/空值时，`loadChoiceStatistics` 返回 []
 * - get-block 失败、块不存在、JSON/结构损坏时 console.warn 后抛出，避免 save 用空数据覆盖旧记录
 * - 同一 blockId 的 save 串行；不同 blockId 互不阻塞
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ChoiceStatisticsEntry, ChoiceStatisticsStorage } from "./types"

/** 存储版本号 */
export const CHOICE_STATISTICS_STORAGE_VERSION = 1

/** 单块属性中最多保留的答题记录条数（最近 N 次） */
export const MAX_CHOICE_STATISTICS_ENTRIES = 200

/** 块属性名 */
export const CHOICE_STATISTICS_PROPERTY_NAME = "srs.choice.statistics"

// 属性类型：1 = 文本
const PROPERTY_TYPE_TEXT = 1

/** 按 blockId 串行化读-改-写，防止并发 save 丢记录 */
const saveChainsByBlockId = new Map<DbId, Promise<unknown>>()

/**
 * 测试用：清空 per-block 保存链（不触碰后端数据）
 */
export function resetChoiceStatisticsSaveChainsForTests(): void {
  saveChainsByBlockId.clear()
}

function isDbId(value: unknown): value is DbId {
  return typeof value === "number" && Number.isFinite(value)
}

function assertDbIdArray(value: unknown, fieldName: string): DbId[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid statistics data: ${fieldName} must be an array`)
  }
  for (let i = 0; i < value.length; i++) {
    if (!isDbId(value[i])) {
      throw new Error(
        `Invalid statistics data: ${fieldName}[${i}] must be a finite number DbId`
      )
    }
  }
  return value as DbId[]
}

function assertChoiceStatisticsEntry(
  entry: unknown,
  index: number
): ChoiceStatisticsEntry {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error(
      `Invalid statistics data: entries[${index}] must be an object`
    )
  }
  const e = entry as Record<string, unknown>
  if (typeof e.timestamp !== "number" || !Number.isFinite(e.timestamp)) {
    throw new Error(
      `Invalid statistics data: entries[${index}].timestamp must be a finite number`
    )
  }
  if (typeof e.isCorrect !== "boolean") {
    throw new Error(
      `Invalid statistics data: entries[${index}].isCorrect must be a boolean`
    )
  }
  return {
    timestamp: e.timestamp,
    selectedBlockIds: assertDbIdArray(
      e.selectedBlockIds,
      `entries[${index}].selectedBlockIds`
    ),
    correctBlockIds: assertDbIdArray(
      e.correctBlockIds,
      `entries[${index}].correctBlockIds`
    ),
    isCorrect: e.isCorrect
  }
}

/**
 * 序列化选择统计数据为 JSON 字符串
 */
export function serializeStatistics(storage: ChoiceStatisticsStorage): string {
  return JSON.stringify(storage)
}

/**
 * 反序列化 JSON 字符串为选择统计数据。
 * 严格校验：version 必须为当前 CHOICE_STATISTICS_STORAGE_VERSION 整数；
 * entries / 每项关键字段与 DbId 数组完整校验。损坏或不支持版本抛出，不得静默改成默认值。
 */
export function deserializeStatistics(json: string): ChoiceStatisticsStorage {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new Error(
      `Invalid statistics data: JSON parse failed${
        error instanceof Error ? `: ${error.message}` : ""
      }`
    )
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid statistics data: not an object")
  }

  const obj = parsed as Record<string, unknown>

  // 仅接受当前版本整数；无迁移逻辑，不支持版本不得误读后覆盖
  if (obj.version === undefined || obj.version === null) {
    throw new Error("Invalid statistics data: version is required")
  }
  if (
    typeof obj.version !== "number" ||
    !Number.isFinite(obj.version) ||
    !Number.isInteger(obj.version)
  ) {
    throw new Error(
      "Invalid statistics data: version must be an integer equal to " +
        String(CHOICE_STATISTICS_STORAGE_VERSION)
    )
  }
  if (obj.version !== CHOICE_STATISTICS_STORAGE_VERSION) {
    throw new Error(
      `Invalid statistics data: unsupported version ${obj.version} ` +
        `(expected ${CHOICE_STATISTICS_STORAGE_VERSION})`
    )
  }

  if (!Array.isArray(obj.entries)) {
    throw new Error("Invalid statistics data: entries must be an array")
  }

  const entries = obj.entries.map((entry, index) =>
    assertChoiceStatisticsEntry(entry, index)
  )

  return {
    version: CHOICE_STATISTICS_STORAGE_VERSION,
    entries
  }
}

/**
 * 纯函数：将新记录追加到现有列表，并裁剪为最近 maxEntries 条（保持追加/时间顺序）。
 */
export function appendChoiceStatisticsEntries(
  existing: readonly ChoiceStatisticsEntry[],
  entry: ChoiceStatisticsEntry,
  maxEntries: number = MAX_CHOICE_STATISTICS_ENTRIES
): ChoiceStatisticsEntry[] {
  const next = [...existing, entry]
  if (maxEntries <= 0) return []
  if (next.length <= maxEntries) return next
  return next.slice(next.length - maxEntries)
}

/**
 * 加载选择统计记录。
 *
 * - 块存在且属性缺失/空值 → 返回 []
 * - get-block 抛错、块不存在、属性 JSON/结构损坏 → console.warn 后抛出
 */
export async function loadChoiceStatistics(
  blockId: DbId
): Promise<ChoiceStatisticsEntry[]> {
  let block: Block | undefined
  try {
    block = (await orca.invokeBackend("get-block", blockId)) as
      | Block
      | undefined
  } catch (error) {
    console.warn(`[SRS] 加载选择统计失败 (blockId: ${blockId}):`, error)
    throw error instanceof Error ? error : new Error(String(error))
  }

  if (block == null) {
    const err = new Error(
      `Failed to load choice statistics: block ${blockId} not found`
    )
    console.warn(`[SRS] 加载选择统计失败 (blockId: ${blockId}):`, err)
    throw err
  }

  if (!block.properties) {
    return []
  }

  const statisticsProp = block.properties.find(
    prop => prop.name === CHOICE_STATISTICS_PROPERTY_NAME
  )

  if (statisticsProp == null || statisticsProp.value == null || statisticsProp.value === "") {
    return []
  }

  try {
    const storage = deserializeStatistics(String(statisticsProp.value))
    return storage.entries
  } catch (error) {
    console.warn(`[SRS] 加载选择统计失败 (blockId: ${blockId}):`, error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

async function saveChoiceStatisticsUnlocked(
  blockId: DbId,
  entry: ChoiceStatisticsEntry
): Promise<void> {
  const existingEntries = await loadChoiceStatistics(blockId)
  const newStorage: ChoiceStatisticsStorage = {
    version: CHOICE_STATISTICS_STORAGE_VERSION,
    entries: appendChoiceStatisticsEntries(existingEntries, entry)
  }
  const jsonData = serializeStatistics(newStorage)

  const result = await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [
      {
        name: CHOICE_STATISTICS_PROPERTY_NAME,
        value: jsonData,
        type: PROPERTY_TYPE_TEXT
      }
    ]
  )

  // 不编造 API 语义：仅当返回值明确是 Error 时向上抛出
  if (result instanceof Error) {
    throw result
  }
}

/**
 * 保存选择统计记录（追加 + 裁剪到最近 200 条）。
 *
 * 同一 blockId 串行执行读-改-写；不同 blockId 互不阻塞。
 * 调用者可收到真实 rejection；链恢复用的 catch 不吞掉当前调用错误。
 */
export async function saveChoiceStatistics(
  blockId: DbId,
  entry: ChoiceStatisticsEntry
): Promise<void> {
  const previous = saveChainsByBlockId.get(blockId) ?? Promise.resolve()

  const current = previous
    .catch(() => {
      // 恢复链：前一次失败不得阻塞后续 save；不处理也不转发前次错误
    })
    .then(() => saveChoiceStatisticsUnlocked(blockId, entry))

  // 链尾自身吞掉 rejection，避免 unhandledrejection，同时不让永久 rejected promise 卡死队列
  saveChainsByBlockId.set(
    blockId,
    current.then(
      () => undefined,
      () => undefined
    )
  )

  return current
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
 * 计算选项选择频率。
 * 只统计 `optionBlockIds` 中仍存在的选项；旧记录里已删除的选项 ID 被忽略。
 */
export function calculateOptionFrequency(
  entries: ChoiceStatisticsEntry[],
  optionBlockIds: DbId[]
): Map<DbId, OptionFrequency> {
  const frequencyMap = new Map<DbId, OptionFrequency>()
  const validOptionSet = new Set(optionBlockIds)

  for (const blockId of optionBlockIds) {
    frequencyMap.set(blockId, { total: 0, incorrect: 0 })
  }

  for (const entry of entries) {
    const correctSet = new Set(entry.correctBlockIds)

    for (const selectedId of entry.selectedBlockIds) {
      if (!validOptionSet.has(selectedId)) {
        continue
      }

      const freq = frequencyMap.get(selectedId)
      if (freq) {
        freq.total++
        if (!correctSet.has(selectedId)) {
          freq.incorrect++
        }
      }
    }
  }

  return frequencyMap
}

/**
 * 清除选择统计数据（删除块上的统计属性）
 */
export async function clearChoiceStatistics(blockId: DbId): Promise<void> {
  const result = await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [blockId],
    [CHOICE_STATISTICS_PROPERTY_NAME]
  )
  if (result instanceof Error) {
    throw result
  }
}
