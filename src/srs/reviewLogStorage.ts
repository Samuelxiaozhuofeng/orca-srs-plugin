/**
 * 复习记录存储模块
 *
 * 负责复习记录的持久化存储和查询
 * 使用按月分片存储策略，优化大量数据的读写性能
 *
 * 存储键格式: "reviewLogs_YYYY_MM"
 * 例如: "reviewLogs_2024_12"
 *
 * 落盘语义（FC-03）：
 * - pending 按 pluginName 隔离；仅在对应分片确认 setData 成功后移除对应日志 ID
 * - 内存 logCache 使用 pluginName+storageKey 复合键，禁止跨插件串缓存
 * - flush 成功后仅当 pending 中该 ID 仍为快照同一对象引用时才移除（同 ID 更新保留）
 * - getData / JSON.parse / setData 失败时保留 pending，不得用 [] 覆盖旧数据
 * - 同一 pluginName 同时只允许一个 in-flight flush；并发调用共享该 Promise
 * - 按 ReviewLogEntry.id 幂等合并；无自动无限重试，失败保留待下次 save/flush/unload 再试
 * - saveReviewLog 仅 enqueue + schedule，不保证立即落盘
 * - saveAndFlushReviewLog 在该日志 ID 确认已持久化后才 resolve
 */

import type { ReviewLogEntry, ReviewLogStorage } from "./types"
import { normalizeReviewLogIdentity } from "./cardIdentity"

// 存储版本号：v2 起日志含结构化卡片身份（blockId/cardType/cardKey/变体字段）
const STORAGE_VERSION = 2

// 存储键前缀
const STORAGE_KEY_PREFIX = "reviewLogs"

// 内存缓存键分隔符（pluginName 与 storageKey 均不含 NUL）
const CACHE_KEY_SEP = "\0"

// 内存缓存：复合键 `${pluginName}\0${storageKey}` -> logs
const logCache = new Map<string, ReviewLogEntry[]>()

// 待写入缓冲区：pluginName -> (logId -> entry)
const pendingByPlugin = new Map<string, Map<string, ReviewLogEntry>>()

// 每插件独立定时器
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()

// 每插件 in-flight flush（并发共享）
const flushInFlight = new Map<string, Promise<void>>()

// 批量写入延迟（毫秒）
const FLUSH_DELAY = 1000

/** 缓存复合键：按插件隔离同月分片 */
function toCacheKey(pluginName: string, storageKey: string): string {
  return `${pluginName}${CACHE_KEY_SEP}${storageKey}`
}

function clearPluginLogCache(pluginName: string): void {
  const prefix = `${pluginName}${CACHE_KEY_SEP}`
  for (const key of logCache.keys()) {
    if (key.startsWith(prefix)) {
      logCache.delete(key)
    }
  }
}

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

function getOrCreatePendingMap(pluginName: string): Map<string, ReviewLogEntry> {
  let map = pendingByPlugin.get(pluginName)
  if (!map) {
    map = new Map()
    pendingByPlugin.set(pluginName, map)
  }
  return map
}

function enqueuePending(pluginName: string, log: ReviewLogEntry): void {
  // 按 id 幂等：重复 enqueue 覆盖为最新内容，最终只落盘一条
  getOrCreatePendingMap(pluginName).set(log.id, log)
}

/**
 * 仅当 pending 中该 ID 仍是快照中的同一对象引用时才移除。
 * flush 等待 setData 期间若同 ID 被 enqueue 为更新版本，新引用必须保留给下一轮 drain。
 */
function removePendingIfStillSnapshot(
  pluginName: string,
  snapshotLogs: ReviewLogEntry[]
): void {
  const map = pendingByPlugin.get(pluginName)
  if (!map) return
  for (const log of snapshotLogs) {
    if (map.get(log.id) === log) {
      map.delete(log.id)
    }
  }
  if (map.size === 0) {
    pendingByPlugin.delete(pluginName)
  }
}

function clearPluginTimer(pluginName: string): void {
  const timer = flushTimers.get(pluginName)
  if (timer) {
    clearTimeout(timer)
    flushTimers.delete(pluginName)
  }
}

/**
 * 从存储加载指定月份的记录。
 * 读取失败必须抛出，避免返回 [] 后覆盖旧数据。
 */
async function loadMonthLogs(
  pluginName: string,
  storageKey: string
): Promise<ReviewLogEntry[]> {
  const cacheKey = toCacheKey(pluginName, storageKey)
  if (logCache.has(cacheKey)) {
    return logCache.get(cacheKey)!
  }

  let storedData: string | null
  try {
    storedData = await orca.plugins.getData(pluginName, storageKey) as string | null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[${pluginName}] 加载复习记录失败 (${storageKey}): getData 失败: ${message}`
    )
  }

  if (!storedData) {
    logCache.set(cacheKey, [])
    return []
  }

  let storage: ReviewLogStorage
  try {
    storage = JSON.parse(storedData) as ReviewLogStorage
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[${pluginName}] 加载复习记录失败 (${storageKey}): JSON 解析失败: ${message}`
    )
  }

  // v1 / 缺字段日志归一化为 legacy，不报错；仍可用于统计
  const logs = (storage.logs || []).map(log => normalizeReviewLogIdentity(log))
  logCache.set(cacheKey, logs)
  return logs
}

/**
 * 保存指定月份的记录到存储（仅 setData 成功后更新缓存）
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
  logCache.set(toCacheKey(pluginName, storageKey), logs)
}

/**
 * 按 id 幂等合并：后者覆盖同 id
 */
function mergeLogsById(
  existing: ReviewLogEntry[],
  incoming: ReviewLogEntry[]
): ReviewLogEntry[] {
  const byId = new Map<string, ReviewLogEntry>()
  for (const log of existing) {
    byId.set(log.id, log)
  }
  for (const log of incoming) {
    byId.set(log.id, log)
  }
  return Array.from(byId.values())
}

/**
 * 对调用时刻的 pending 快照执行一次 flush。
 * 按月分片：仅成功写入的分片才从 pending 移除对应 ID；失败分片保留。
 * 一个分片失败后仍继续尝试其他分片，最终若有失败则 throw。
 */
async function flushPendingSnapshot(pluginName: string): Promise<void> {
  const pendingMap = pendingByPlugin.get(pluginName)
  if (!pendingMap || pendingMap.size === 0) return

  // 快照：拷贝当前条目；flush 期间新 enqueue 的日志不在此快照中，留给后续轮次
  const snapshot = Array.from(pendingMap.values())
  const logsByMonth = new Map<string, ReviewLogEntry[]>()
  for (const log of snapshot) {
    const key = getStorageKeyFromTimestamp(log.timestamp)
    if (!logsByMonth.has(key)) {
      logsByMonth.set(key, [])
    }
    logsByMonth.get(key)!.push(log)
  }

  const errors: Error[] = []

  for (const [storageKey, newLogs] of logsByMonth) {
    try {
      const existingLogs = await loadMonthLogs(pluginName, storageKey)
      const mergedLogs = mergeLogsById(existingLogs, newLogs)
      await saveMonthLogs(pluginName, storageKey, mergedLogs)
      // 仅移除仍为快照同一引用的条目；同 ID 更新版本保留给下一轮
      removePendingIfStillSnapshot(pluginName, newLogs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const wrapped = new Error(
        `[${pluginName}] 写入复习记录失败 (${storageKey}): ${message}`
      )
      errors.push(wrapped)
      console.error(wrapped.message, error)
      // 继续其他分片；失败分片的 ID 保留在 pending
    }
  }

  if (errors.length > 0) {
    throw errors.length === 1
      ? errors[0]
      : new Error(
          `[${pluginName}] 部分月份复习记录写入失败 (${errors.length} 个分片): ${errors.map(e => e.message).join("; ")}`
        )
  }
}

/**
 * 排空指定插件的 pending（循环处理快照，吸收 flush 期间新加入的日志）。
 * 任一轮失败则停止并保留剩余 pending（不自动无限重试）。
 */
async function drainPendingLogs(pluginName: string): Promise<void> {
  while ((pendingByPlugin.get(pluginName)?.size ?? 0) > 0) {
    await flushPendingSnapshot(pluginName)
  }
}

/**
 * 调度批量写入（有限策略：仅延迟一次；失败后不自动无限重试）
 */
function scheduleFlush(pluginName: string): void {
  clearPluginTimer(pluginName)
  const timer = setTimeout(() => {
    flushTimers.delete(pluginName)
    void flushReviewLogs(pluginName).catch(error => {
      console.error(
        `[${pluginName}] 定时 flush 复习日志失败（pending 已保留，下次 save/flush/unload 再试）:`,
        error
      )
    })
  }, FLUSH_DELAY)
  flushTimers.set(pluginName, timer)
}

/**
 * 保存单条复习记录
 *
 * 仅 enqueue + schedule，**不保证**立即落盘。
 * 需要确认落盘时请使用 saveAndFlushReviewLog。
 *
 * @param pluginName - 插件名称
 * @param log - 复习记录
 */
export async function saveReviewLog(
  pluginName: string,
  log: ReviewLogEntry
): Promise<void> {
  enqueuePending(pluginName, log)
  scheduleFlush(pluginName)
}

/**
 * 保存单条复习记录并等待该日志确认持久化。
 * 失败时 reject 且 pending 保留，可供后续 flush/unload 重试。
 */
export async function saveAndFlushReviewLog(
  pluginName: string,
  log: ReviewLogEntry
): Promise<void> {
  enqueuePending(pluginName, log)
  // 取消定时器，立即走共享 flush
  clearPluginTimer(pluginName)
  try {
    await flushReviewLogs(pluginName)
  } catch (error) {
    // 确认本条是否仍在 pending
    if (pendingByPlugin.get(pluginName)?.has(log.id)) {
      throw error instanceof Error
        ? error
        : new Error(String(error))
    }
    // 本条已落盘但其他分片失败：对本 API 视为成功
    return
  }

  if (pendingByPlugin.get(pluginName)?.has(log.id)) {
    throw new Error(
      `[${pluginName}] 复习日志 ${log.id} 未能确认持久化，已保留 pending`
    )
  }
}

/**
 * 立即保存所有待写入的记录
 *
 * 并发调用按 pluginName 串行链式等待，不会重复写或互相覆盖。
 * flush 期间新 enqueue 的日志由 drain 循环或后续链式 flush 处理；
 * 失败则停止并保留 pending（不自动无限重试）。
 *
 * @param pluginName - 插件名称
 */
export async function flushReviewLogs(pluginName: string): Promise<void> {
  clearPluginTimer(pluginName)

  // 同步登记链式 Promise，保证同 tick 并发调用串行而非双开 drain
  const prev = flushInFlight.get(pluginName)
  const current = (prev ?? Promise.resolve())
    .catch(() => {
      // 前一轮失败不阻断本轮重试
    })
    .then(() => drainPendingLogs(pluginName))

  // tracked 仅用于串行登记；必须吞掉 rejection，否则无人 await 会产生 unhandled rejection
  const tracked = current.finally(() => {
    if (flushInFlight.get(pluginName) === tracked) {
      flushInFlight.delete(pluginName)
    }
  })
  void tracked.catch(() => {
    // 调用方通过返回的 current 感知失败；此处仅防止登记链 unhandled
  })
  flushInFlight.set(pluginName, tracked)
  return current
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
      logCache.delete(toCacheKey(pluginName, storageKey))
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
          logCache.delete(toCacheKey(pluginName, storageKey))
        }
      }
    }
  }

  return cleanedCount
}

/**
 * 清除指定插件的复习记录（用于测试或重置）
 * pending / 定时器 / 该插件缓存 按插件隔离清理，不影响其他 pluginName。
 *
 * @param pluginName - 插件名称
 */
export async function clearAllReviewLogs(pluginName: string): Promise<void> {
  // 仅清理本插件 pending 与定时器
  pendingByPlugin.delete(pluginName)
  clearPluginTimer(pluginName)
  // 不取消其他插件的 in-flight；本插件若有 in-flight，调用方应 await 后再清

  // 获取所有存储键并删除
  const allKeys = await orca.plugins.getDataKeys(pluginName)
  const reviewLogKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))

  for (const key of reviewLogKeys) {
    await orca.plugins.removeData(pluginName, key)
  }
  // 只清本插件缓存条目，保留其他插件缓存
  clearPluginLogCache(pluginName)
}

/**
 * 清除全部插件的内存缓存
 *
 * 在需要强制重新加载数据时调用（如 FC-04 直接写分片后全局失效）
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
 * 自动归一化身份字段（v1 / 缺字段 → legacy）
 */
export function deserializeReviewLog(data: string): ReviewLogEntry {
  const parsed = JSON.parse(data) as ReviewLogEntry
  return normalizeReviewLogIdentity(parsed)
}

/**
 * 创建复习记录 ID
 *
 * 统一格式：`${timestamp}_${cardKeyOrId}`
 * - 新日志应传入稳定 cardKey（字符串）
 * - 旧调用/测试可继续传 numeric cardId，保持兼容
 *
 * @param timestamp - 时间戳
 * @param cardKeyOrId - 稳定 cardKey 或兼容 cardId
 */
export function createReviewLogId(
  timestamp: number,
  cardKeyOrId: number | string
): string {
  return `${timestamp}_${cardKeyOrId}`
}

// ---------------------------------------------------------------------------
// 测试辅助：只读视图，不泄露可变引用
// ---------------------------------------------------------------------------

/**
 * @internal 测试用：指定插件（或全部）pending 条数
 */
export function getPendingReviewLogCountForTests(pluginName?: string): number {
  if (pluginName !== undefined) {
    return pendingByPlugin.get(pluginName)?.size ?? 0
  }
  let total = 0
  for (const map of pendingByPlugin.values()) {
    total += map.size
  }
  return total
}

/**
 * @internal 测试用：指定插件 pending 日志 ID 列表（拷贝）
 */
export function getPendingReviewLogIdsForTests(pluginName: string): string[] {
  const map = pendingByPlugin.get(pluginName)
  if (!map) return []
  return Array.from(map.keys())
}

/**
 * @internal 测试用：重置全部进程内 pending / 定时器 / in-flight（仅测试）
 */
export function resetReviewLogPendingStateForTests(): void {
  for (const timer of flushTimers.values()) {
    clearTimeout(timer)
  }
  flushTimers.clear()
  pendingByPlugin.clear()
  flushInFlight.clear()
}
