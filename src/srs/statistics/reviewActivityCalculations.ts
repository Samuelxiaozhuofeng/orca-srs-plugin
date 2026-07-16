/**
 * 复习日志 / 活动类统计纯计算（无 Orca / 全局副作用）
 *
 * 覆盖：今日统计、复习历史、复习时间、答题按钮，以及日志过滤与日期工具。
 */

import type {
  ReviewLogEntry,
  TodayStatistics,
  ReviewHistory,
  HistoryDay,
  ReviewTimeStats,
  AnswerButtonStats
} from "../types"
import { effectiveDurationFromReviewLog } from "../sessionProgressTracker"

/**
 * 判断时间戳是否在今天
 * @param timestamp - 时间戳（毫秒）
 * @returns 是否在今天
 */
export function isToday(timestamp: number): boolean {
  const date = new Date(timestamp)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/**
 * 获取日期的零点时间戳
 * @param date - 日期对象
 * @returns 零点时间戳
 */
export function getDateStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * 过滤指定时间范围内的复习记录
 *
 * @param logs - 复习记录数组
 * @param startDate - 开始日期
 * @param endDate - 结束日期（可选，默认为当前时间）
 * @returns 过滤后的复习记录数组
 */
export function filterLogsByTimeRange(
  logs: ReviewLogEntry[],
  startDate: Date,
  endDate: Date = new Date()
): ReviewLogEntry[] {
  const startTime = startDate.getTime()
  const endTime = endDate.getTime()

  return logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime)
}

/**
 * 过滤指定牌组的复习记录
 *
 * @param logs - 复习记录数组
 * @param deckName - 牌组名称（如果为空或 undefined，返回所有记录）
 * @returns 过滤后的复习记录数组
 */
export function filterLogsByDeck(
  logs: ReviewLogEntry[],
  deckName?: string
): ReviewLogEntry[] {
  if (!deckName) {
    return logs
  }
  return logs.filter(log => log.deckName === deckName)
}

/**
 * 计算今日统计
 *
 * 从复习记录中计算今日的各项统计数据
 *
 * @param logs - 复习记录数组
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 今日统计数据
 */
export function calculateTodayStatistics(logs: ReviewLogEntry[], deckName?: string): TodayStatistics {
  // 先按牌组过滤
  const filteredByDeck = filterLogsByDeck(logs, deckName)
  // 再过滤今日的记录
  const todayLogs = filteredByDeck.filter(log => isToday(log.timestamp))

  // 初始化统计数据
  const stats: TodayStatistics = {
    reviewedCount: todayLogs.length,
    newLearnedCount: 0,
    relearnedCount: 0,
    totalTime: 0,
    gradeDistribution: {
      again: 0,
      hard: 0,
      good: 0,
      easy: 0
    }
  }

  // 遍历今日记录计算各项统计
  for (const log of todayLogs) {
    // FC-10：新旧日志统一经 effectiveDurationFromReviewLog（旧 duration 异常截断）
    stats.totalTime += effectiveDurationFromReviewLog(log)

    // 统计评分分布
    stats.gradeDistribution[log.grade]++

    // 统计新学卡片（之前状态为 new）
    if (log.previousState === "new") {
      stats.newLearnedCount++
    }

    // 统计重学卡片（按了 Again）
    if (log.grade === "again") {
      stats.relearnedCount++
    }
  }

  return stats
}

/**
 * 计算复习历史
 *
 * 从复习记录中计算指定时间范围内的每日复习统计
 *
 * @param logs - 复习记录数组
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 复习历史数据
 */
export function calculateReviewHistory(
  logs: ReviewLogEntry[],
  startDate: Date,
  endDate: Date,
  deckName?: string
): ReviewHistory {
  // 按牌组过滤
  const filteredLogs = filterLogsByDeck(logs, deckName)
  const start = getDateStart(startDate)
  const end = getDateStart(endDate)

  // 创建日期到统计的映射
  const dayMap = new Map<string, HistoryDay>()

  // 初始化所有日期
  const current = new Date(start)
  while (current <= end) {
    const key = current.toISOString().split("T")[0]
    dayMap.set(key, {
      date: new Date(current),
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
      total: 0
    })
    current.setDate(current.getDate() + 1)
  }

  // 统计每天的复习记录
  let totalReviews = 0
  for (const log of filteredLogs) {
    const logDate = new Date(log.timestamp)
    const key = logDate.toISOString().split("T")[0]

    const day = dayMap.get(key)
    if (day) {
      day[log.grade]++
      day.total++
      totalReviews++
    }
  }

  // 转换为数组并排序
  const days = Array.from(dayMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  )

  // 计算日均复习数
  const numberOfDays = days.length || 1
  const averagePerDay = totalReviews / numberOfDays

  return {
    days,
    totalReviews,
    averagePerDay
  }
}

/**
 * 计算复习时间统计
 *
 * 从复习记录中计算每日复习时间、平均时间、总时间
 *
 * @param logs - 复习记录数组
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 复习时间统计数据
 */
export function calculateReviewTimeStats(
  logs: ReviewLogEntry[],
  startDate: Date,
  endDate: Date,
  deckName?: string
): ReviewTimeStats {
  // 按牌组过滤
  const filteredLogs = filterLogsByDeck(logs, deckName)

  // 使用 UTC 日期字符串作为键，确保时区一致性
  const getUTCDateKey = (date: Date): string => {
    return date.toISOString().split("T")[0]
  }

  // 获取 UTC 日期的起始时间戳
  const getUTCDateStart = (date: Date): Date => {
    const key = getUTCDateKey(date)
    return new Date(key + "T00:00:00.000Z")
  }

  const start = getUTCDateStart(startDate)
  const end = getUTCDateStart(endDate)

  // 创建日期到时间的映射
  const dayMap = new Map<string, { date: Date; time: number }>()

  // 初始化所有日期（使用 UTC）
  const current = new Date(start)
  while (current <= end) {
    const key = getUTCDateKey(current)
    dayMap.set(key, {
      date: new Date(current),
      time: 0
    })
    // 增加一天（使用 UTC）
    current.setUTCDate(current.getUTCDate() + 1)
  }

  // 统计每天的复习时间（FC-10：与今日统计同一有效时长口径）
  let totalTime = 0
  for (const log of filteredLogs) {
    const logDate = new Date(log.timestamp)
    const key = getUTCDateKey(logDate)

    const day = dayMap.get(key)
    if (day) {
      const effective = effectiveDurationFromReviewLog(log)
      day.time += effective
      totalTime += effective
    }
  }

  // 转换为数组并排序
  const dailyTime = Array.from(dayMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  )

  // 计算平均每天复习时间
  const numberOfDays = dailyTime.length || 1
  const averagePerDay = totalTime / numberOfDays

  return {
    dailyTime,
    averagePerDay,
    totalTime
  }
}

/**
 * 计算答题按钮统计
 *
 * 从复习记录中统计各评分按钮的使用情况
 *
 * @param logs - 复习记录数组
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 答题按钮统计数据
 */
export function calculateAnswerButtonStats(logs: ReviewLogEntry[], deckName?: string): AnswerButtonStats {
  // 按牌组过滤
  const filteredLogs = filterLogsByDeck(logs, deckName)
  const stats: AnswerButtonStats = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    total: filteredLogs.length,
    correctRate: 0
  }

  // 统计各评分数量
  for (const log of filteredLogs) {
    stats[log.grade]++
  }

  // 计算正确率 (good + easy) / total
  if (stats.total > 0) {
    stats.correctRate = (stats.good + stats.easy) / stats.total
  }

  return stats
}
