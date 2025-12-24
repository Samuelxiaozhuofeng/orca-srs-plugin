/**
 * 复习记录存储模块
 * 
 * 负责复习记录的持久化存储和查询
 * 使用按月分片存储策略，优化大量数据的读写性能
 * 
 * 存储键格式: "reviewLogs_YYYY_MM"
 * 例如: "reviewLogs_2024_12"
 */

import type { ReviewLogEntry, ReviewLogStorage } from "./types"

// 存储版本号，用于数据迁移
const STORAGE_VERSION = 1

// 存储键前缀
const STORAGE_KEY_PREFIX = "reviewLogs"

// 内存缓存，避免频繁读取存储
const logCache = new Map<string, ReviewLogEntry[]>()

// 待写入的记录缓冲区（用于批量写入）
let pendingLogs: ReviewLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

// 批量写入延迟（毫秒）
const FLUSH_DELAY = 1000

/**
 * 生成存储键
 * @param year - 年份
 * @param month - 月份 (1-12)
 */
function getStorageKey(year: number, month: number): string {
  const monthStr = month.toString().padStart(2, "0")
  return `${STORAGE_KEY_PREFIX}_${year}_${monthStr}`
}

/**
 * 从时间戳获取存储键
 */
function getStorageKeyFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return getStorageKey(date.getFullYear(), date.getMonth() + 1)
}

/**
 * 解析存储键获取年月
 */
function parseStorageKey(key: string): { year: number; month: number } | null {
  const match = key.match(/^reviewLogs_(\d{4})_(\d{2})$/)
  if (!match) return null
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10)
  }
}

/**
 * 从存储加载指定月份的记录
 */
async function loadMonthLogs(
  pluginName: string,
  storageKey: string
): Promise<ReviewLogEntry[]> {
  // 检查缓存
  if (logCache.has(storageKey)) {
    return logCache.get(storageKey)!
  }

  try {
    const storedData = await orca.plugins.getData(pluginName, storageKey) as string | null
    if (!storedData) {
      logCache.set(storageKey, [])
      return []
    }

    const storage = JSON.parse(storedData) as ReviewLogStorage
    const logs = storage.logs || []
    logCache.set(storageKey, logs)
    return logs
  } catch (error) {
    console.warn(`[${pluginName}] 加载复习记录失败 (${storageKey}):`, error)
    return []
  }
}

/**
 * 保存指定月份的记录到存储
 */
async function saveMonthLogs(
  pluginName: string,
  storageKey: string,
  logs: ReviewLogEntry[]
): Promise<void> {
  const storage: ReviewLogStorage = {
    version: STORAGE_VERSION,
    logs
  }

  await orca.plugins.setData(pluginName, storageKey, JSON.stringify(storage))
  logCache.set(storageKey, logs)
}

/**
 * 执行批量写入
 */
async function flushPendingLogs(pluginName: string): Promise<void> {
  if (pendingLogs.length === 0) return

  // 按月份分组
  const logsByMonth = new Map<string, ReviewLogEntry[]>()
  for (const log of pendingLogs) {
    const key = getStorageKeyFromTimestamp(log.timestamp)
    if (!logsByMonth.has(key)) {
      logsByMonth.set(key, [])
    }
    logsByMonth.get(key)!.push(log)
  }

  // 清空待写入缓冲区
  pendingLogs = []

  // 写入各月份
  for (const [storageKey, newLogs] of logsByMonth) {
    const existingLogs = await loadMonthLogs(pluginName, storageKey)
    const mergedLogs = [...existingLogs, ...newLogs]
    await saveMonthLogs(pluginName, storageKey, mergedLogs)
  }
}

/**
 * 调度批量写入
 */
function scheduleFlush(pluginName: string): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
  }
  flushTimer = setTimeout(async () => {
    flushTimer = null
    await flushPendingLogs(pluginName)
  }, FLUSH_DELAY)
}

/**
 * 保存单条复习记录
 * 
 * 使用批量写入策略，收集一段时间内的记录后统一写入
 * 
 * @param pluginName - 插件名称
 * @param log - 复习记录
 */
export async function saveReviewLog(
  pluginName: string,
  log: ReviewLogEntry
): Promise<void> {
  pendingLogs.push(log)
  scheduleFlush(pluginName)
}

/**
 * 立即保存所有待写入的记录
 * 
 * 在需要确保数据持久化时调用（如页面关闭前）
 * 
 * @param pluginName - 插件名称
 */
export async function flushReviewLogs(pluginName: string): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  await flushPendingLogs(pluginName)
}

/**
 * 获取指定时间范围内的复习记录
 * 
 * @param pluginName - 插件名称
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @returns 复习记录数组
 */
export async function getReviewLogs(
  pluginName: string,
  startDate: Date,
  endDate: Date
): Promise<ReviewLogEntry[]> {
  // 确保待写入的记录已保存
  await flushReviewLogs(pluginName)

  const startTime = startDate.getTime()
  const endTime = endDate.getTime()

  // 计算需要查询的月份范围
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth() + 1
  const endYear = endDate.getFullYear()
  const endMonth = endDate.getMonth() + 1

  const allLogs: ReviewLogEntry[] = []

  // 遍历所有相关月份
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const storageKey = getStorageKey(year, month)
    const monthLogs = await loadMonthLogs(pluginName, storageKey)
    
    // 过滤时间范围内的记录
    const filteredLogs = monthLogs.filter(
      log => log.timestamp >= startTime && log.timestamp <= endTime
    )
    allLogs.push(...filteredLogs)

    // 下一个月
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  // 按时间戳排序
  return allLogs.sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * 获取所有复习记录
 * 
 * @param pluginName - 插件名称
 * @returns 所有复习记录
 */
export async function getAllReviewLogs(pluginName: string): Promise<ReviewLogEntry[]> {
  // 确保待写入的记录已保存
  await flushReviewLogs(pluginName)

  // 获取所有存储键
  const allKeys = await orca.plugins.getDataKeys(pluginName)
  const reviewLogKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))

  const allLogs: ReviewLogEntry[] = []
  for (const key of reviewLogKeys) {
    const logs = await loadMonthLogs(pluginName, key)
    allLogs.push(...logs)
  }

  return allLogs.sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * 清理指定日期之前的旧记录
 * 
 * @param pluginName - 插件名称
 * @param beforeDate - 清理此日期之前的记录
 * @returns 清理的记录数量
 */
export async function cleanupOldLogs(
  pluginName: string,
  beforeDate: Date
): Promise<number> {
  // 确保待写入的记录已保存
  await flushReviewLogs(pluginName)

  const beforeTime = beforeDate.getTime()
  let cleanedCount = 0

  // 获取所有存储键
  const allKeys = await orca.plugins.getDataKeys(pluginName)
  const reviewLogKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))

  for (const storageKey of reviewLogKeys) {
    const parsed = parseStorageKey(storageKey)
    if (!parsed) continue

    // 检查整个月份是否都在清理日期之前
    const monthEndDate = new Date(parsed.year, parsed.month, 0) // 该月最后一天
    if (monthEndDate.getTime() < beforeTime) {
      // 整个月份都需要清理，直接删除
      const logs = await loadMonthLogs(pluginName, storageKey)
      cleanedCount += logs.length
      await orca.plugins.removeData(pluginName, storageKey)
      logCache.delete(storageKey)
    } else {
      // 部分记录需要清理
      const logs = await loadMonthLogs(pluginName, storageKey)
      const remainingLogs = logs.filter(log => log.timestamp >= beforeTime)
      const removedCount = logs.length - remainingLogs.length
      
      if (removedCount > 0) {
        cleanedCount += removedCount
        if (remainingLogs.length > 0) {
          await saveMonthLogs(pluginName, storageKey, remainingLogs)
        } else {
          await orca.plugins.removeData(pluginName, storageKey)
          logCache.delete(storageKey)
        }
      }
    }
  }

  return cleanedCount
}

/**
 * 清除所有复习记录（用于测试或重置）
 * 
 * @param pluginName - 插件名称
 */
export async function clearAllReviewLogs(pluginName: string): Promise<void> {
  // 清空待写入缓冲区
  pendingLogs = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  // 获取所有存储键并删除
  const allKeys = await orca.plugins.getDataKeys(pluginName)
  const reviewLogKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))

  for (const key of reviewLogKeys) {
    await orca.plugins.removeData(pluginName, key)
  }

  // 清空缓存
  logCache.clear()
}

/**
 * 清除内存缓存
 * 
 * 在需要强制重新加载数据时调用
 */
export function clearLogCache(): void {
  logCache.clear()
}

/**
 * 序列化复习记录（用于导出或测试）
 */
export function serializeReviewLog(log: ReviewLogEntry): string {
  return JSON.stringify(log)
}

/**
 * 反序列化复习记录（用于导入或测试）
 */
export function deserializeReviewLog(data: string): ReviewLogEntry {
  return JSON.parse(data) as ReviewLogEntry
}

/**
 * 创建复习记录 ID
 * 
 * @param timestamp - 时间戳
 * @param cardId - 卡片 ID
 */
export function createReviewLogId(timestamp: number, cardId: number): string {
  return `${timestamp}_${cardId}`
}
