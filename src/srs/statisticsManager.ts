/**
 * 统计管理器模块
 * 
 * 负责协调统计数据的收集和计算
 * 提供今日统计、未来预测、复习历史、卡片状态分布等功能
 * 
 * @module statisticsManager
 */

import type {
  ReviewLogEntry,
  TodayStatistics,
  FutureForecast,
  ForecastDay,
  ReviewHistory,
  HistoryDay,
  CardStateDistribution,
  TimeRange,
  ReviewTimeStats,
  IntervalDistribution,
  IntervalBucket,
  AnswerButtonStats,
  DifficultyDistribution,
  DifficultyBucket
} from "./types"
import { getTimeRangeStartDate } from "./types"
import { getReviewLogs } from "./reviewLogStorage"
import { collectReviewCards } from "./cardCollector"

// ============================================
// 缓存系统
// ============================================

/**
 * 缓存条目接口
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
}

/**
 * 统计数据缓存
 * 用于缓存计算结果，避免重复计算
 */
class StatisticsCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private readonly defaultTTL = 30000 // 默认缓存 30 秒
  private readonly maxEntries = 100 // 最大缓存条目数

  /**
   * 生成缓存键
   */
  private generateKey(type: string, ...params: (string | number | undefined)[]): string {
    return `${type}:${params.filter(p => p !== undefined).join(":")}`
  }

  /**
   * 获取缓存数据
   */
  get<T>(type: string, ...params: (string | number | undefined)[]): T | null {
    const key = this.generateKey(type, ...params)
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    
    if (!entry) {
      return null
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.defaultTTL) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * 设置缓存数据
   */
  set<T>(type: string, data: T, ...params: (string | number | undefined)[]): void {
    const key = this.generateKey(type, ...params)
    
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    })
  }

  /**
   * 清除特定类型的缓存
   */
  invalidate(type: string): void {
    const prefix = `${type}:`
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries
    }
  }
}

// 全局缓存实例
const statisticsCache = new StatisticsCache()

/**
 * 清除统计缓存
 * 在复习完成后调用以确保数据更新
 */
export function clearStatisticsCache(): void {
  statisticsCache.clear()
}

/**
 * 清除特定类型的统计缓存
 */
export function invalidateStatisticsCache(type: string): void {
  statisticsCache.invalidate(type)
}

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
function getDateStart(date: Date): Date {
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
 * 过滤指定牌组的卡片
 * 
 * @param cards - 卡片数组
 * @param deckName - 牌组名称（如果为空或 undefined，返回所有卡片）
 * @returns 过滤后的卡片数组
 */
export function filterCardsByDeck<T extends { deck: string }>(
  cards: T[],
  deckName?: string
): T[] {
  if (!deckName) {
    return cards
  }
  return cards.filter(card => card.deck === deckName)
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
    // 累计复习时间
    stats.totalTime += log.duration

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
 * 获取今日统计
 * 
 * @param pluginName - 插件名称
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 今日统计数据
 */
export async function getTodayStatistics(pluginName: string, deckName?: string): Promise<TodayStatistics> {
  // 检查缓存
  const cached = statisticsCache.get<TodayStatistics>("todayStats", pluginName, deckName)
  if (cached) {
    return cached
  }

  const now = new Date()
  const todayStart = getDateStart(now)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const logs = await getReviewLogs(pluginName, todayStart, todayEnd)
  const result = calculateTodayStatistics(logs, deckName)
  
  // 缓存结果
  statisticsCache.set("todayStats", result, pluginName, deckName)
  return result
}

/**
 * 计算未来预测
 * 
 * 根据卡片的到期时间预测未来每天的复习负载
 * 
 * @param cards - 卡片数组（需要包含 srs.due 和 isNew 信息）
 * @param days - 预测天数
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 未来预测数据
 */
export function calculateFutureForecast(
  cards: Array<{ srs: { due: Date }; isNew: boolean; deck: string }>,
  days: number,
  deckName?: string
): FutureForecast {
  // 按牌组过滤
  const filteredCards = filterCardsByDeck(cards, deckName)
  const now = new Date()
  const todayStart = getDateStart(now)
  
  // 初始化每天的预测数据
  const forecastDays: ForecastDay[] = []
  let cumulative = 0

  for (let i = 0; i < days; i++) {
    const targetDate = new Date(todayStart)
    targetDate.setDate(targetDate.getDate() + i)
    const nextDate = new Date(targetDate)
    nextDate.setDate(nextDate.getDate() + 1)

    // 统计该天到期的卡片
    let reviewDue = 0
    let newAvailable = 0

    for (const card of filteredCards) {
      const dueDate = getDateStart(card.srs.due)
      
      // 检查卡片是否在该天到期
      if (dueDate.getTime() >= targetDate.getTime() && dueDate.getTime() < nextDate.getTime()) {
        if (card.isNew) {
          newAvailable++
        } else {
          reviewDue++
        }
      }
    }

    cumulative += reviewDue + newAvailable

    forecastDays.push({
      date: targetDate,
      reviewDue,
      newAvailable,
      cumulative
    })
  }

  return { days: forecastDays }
}

/**
 * 获取未来到期预测
 * 
 * @param pluginName - 插件名称
 * @param days - 预测天数（默认 30 天）
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 未来预测数据
 */
export async function getFutureForecast(
  pluginName: string,
  days: number = 30,
  deckName?: string
): Promise<FutureForecast> {
  // 检查缓存
  const cached = statisticsCache.get<FutureForecast>("futureForecast", pluginName, days, deckName)
  if (cached) {
    return cached
  }

  const cards = await collectReviewCards(pluginName)
  const result = calculateFutureForecast(cards, days, deckName)
  
  // 缓存结果
  statisticsCache.set("futureForecast", result, pluginName, days, deckName)
  return result
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
 * 获取复习历史
 * 
 * @param pluginName - 插件名称
 * @param range - 时间范围
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 复习历史数据
 */
export async function getReviewHistory(
  pluginName: string,
  range: TimeRange,
  deckName?: string
): Promise<ReviewHistory> {
  // 检查缓存
  const cached = statisticsCache.get<ReviewHistory>("reviewHistory", pluginName, range, deckName)
  if (cached) {
    return cached
  }

  const endDate = new Date()
  const startDate = getTimeRangeStartDate(range)
  
  const logs = await getReviewLogs(pluginName, startDate, endDate)
  const result = calculateReviewHistory(logs, startDate, endDate, deckName)
  
  // 缓存结果
  statisticsCache.set("reviewHistory", result, pluginName, range, deckName)
  return result
}

/**
 * 计算卡片状态分布
 * 
 * 根据卡片的 SRS 状态统计各状态的数量
 * 
 * @param cards - 卡片数组
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 卡片状态分布
 */
export function calculateCardStateDistribution(
  cards: Array<{ isNew: boolean; srs: { reps: number; lapses: number; state?: number }; deck: string }>,
  deckName?: string
): CardStateDistribution {
  // 按牌组过滤
  const filteredCards = filterCardsByDeck(cards, deckName)
  const distribution: CardStateDistribution = {
    new: 0,
    learning: 0,
    review: 0,
    suspended: 0,
    total: filteredCards.length
  }

  for (const card of filteredCards) {
    if (card.isNew) {
      distribution.new++
    } else {
      // 根据 FSRS 状态判断
      // State: 0=New, 1=Learning, 2=Review, 3=Relearning
      const state = card.srs.state
      if (state === 1 || state === 3) {
        // Learning 或 Relearning
        distribution.learning++
      } else {
        // Review（已掌握）
        distribution.review++
      }
    }
  }

  return distribution
}

/**
 * 获取卡片状态分布
 * 
 * @param pluginName - 插件名称
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 卡片状态分布
 */
export async function getCardStateDistribution(
  pluginName: string,
  deckName?: string
): Promise<CardStateDistribution> {
  // 检查缓存
  const cached = statisticsCache.get<CardStateDistribution>("cardStateDistribution", pluginName, deckName)
  if (cached) {
    return cached
  }

  const cards = await collectReviewCards(pluginName)
  const result = calculateCardStateDistribution(cards, deckName)
  
  // 缓存结果
  statisticsCache.set("cardStateDistribution", result, pluginName, deckName)
  return result
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

  // 统计每天的复习时间
  let totalTime = 0
  for (const log of filteredLogs) {
    const logDate = new Date(log.timestamp)
    const key = getUTCDateKey(logDate)
    
    const day = dayMap.get(key)
    if (day) {
      day.time += log.duration
      totalTime += log.duration
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
 * 获取复习时间统计
 * 
 * @param pluginName - 插件名称
 * @param range - 时间范围
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 复习时间统计数据
 */
export async function getReviewTimeStats(
  pluginName: string,
  range: TimeRange,
  deckName?: string
): Promise<ReviewTimeStats> {
  // 检查缓存
  const cached = statisticsCache.get<ReviewTimeStats>("reviewTimeStats", pluginName, range, deckName)
  if (cached) {
    return cached
  }

  const endDate = new Date()
  const startDate = getTimeRangeStartDate(range)
  
  const logs = await getReviewLogs(pluginName, startDate, endDate)
  const result = calculateReviewTimeStats(logs, startDate, endDate, deckName)
  
  // 缓存结果
  statisticsCache.set("reviewTimeStats", result, pluginName, range, deckName)
  return result
}

/**
 * 间隔分布的分组定义（对数刻度）
 */
const INTERVAL_BUCKETS: Array<{ label: string; minDays: number; maxDays: number }> = [
  { label: "0-1天", minDays: 0, maxDays: 1 },
  { label: "1-3天", minDays: 1, maxDays: 3 },
  { label: "3-7天", minDays: 3, maxDays: 7 },
  { label: "7-14天", minDays: 7, maxDays: 14 },
  { label: "14-30天", minDays: 14, maxDays: 30 },
  { label: "30-90天", minDays: 30, maxDays: 90 },
  { label: "90天以上", minDays: 90, maxDays: Infinity }
]

/**
 * 计算卡片间隔分布
 * 
 * 根据卡片的复习间隔统计分布情况
 * 
 * @param cards - 卡片数组（需要包含 srs.interval 信息）
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 间隔分布数据
 */
export function calculateIntervalDistribution(
  cards: Array<{ srs: { interval: number }; deck: string }>,
  deckName?: string
): IntervalDistribution {
  // 按牌组过滤
  const filteredCards = filterCardsByDeck(cards, deckName)
  // 初始化分组
  const buckets: IntervalBucket[] = INTERVAL_BUCKETS.map(b => ({
    label: b.label,
    minDays: b.minDays,
    maxDays: b.maxDays,
    count: 0
  }))

  let totalInterval = 0
  let maxInterval = 0

  // 统计每张卡片的间隔
  for (const card of filteredCards) {
    const interval = card.srs.interval
    totalInterval += interval
    if (interval > maxInterval) {
      maxInterval = interval
    }

    // 找到对应的分组
    for (const bucket of buckets) {
      if (interval >= bucket.minDays && interval < bucket.maxDays) {
        bucket.count++
        break
      }
    }
  }

  // 计算平均间隔
  const averageInterval = filteredCards.length > 0 ? totalInterval / filteredCards.length : 0

  return {
    buckets,
    averageInterval,
    maxInterval
  }
}

/**
 * 获取卡片间隔分布
 * 
 * @param pluginName - 插件名称
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 间隔分布数据
 */
export async function getIntervalDistribution(
  pluginName: string,
  deckName?: string
): Promise<IntervalDistribution> {
  // 检查缓存
  const cached = statisticsCache.get<IntervalDistribution>("intervalDistribution", pluginName, deckName)
  if (cached) {
    return cached
  }

  const cards = await collectReviewCards(pluginName)
  const result = calculateIntervalDistribution(cards, deckName)
  
  // 缓存结果
  statisticsCache.set("intervalDistribution", result, pluginName, deckName)
  return result
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

/**
 * 获取答题按钮统计
 * 
 * @param pluginName - 插件名称
 * @param range - 时间范围
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 答题按钮统计数据
 */
export async function getAnswerButtonStats(
  pluginName: string,
  range: TimeRange,
  deckName?: string
): Promise<AnswerButtonStats> {
  // 检查缓存
  const cached = statisticsCache.get<AnswerButtonStats>("answerButtonStats", pluginName, range, deckName)
  if (cached) {
    return cached
  }

  const endDate = new Date()
  const startDate = getTimeRangeStartDate(range)
  
  const logs = await getReviewLogs(pluginName, startDate, endDate)
  const result = calculateAnswerButtonStats(logs, deckName)
  
  // 缓存结果
  statisticsCache.set("answerButtonStats", result, pluginName, range, deckName)
  return result
}

/**
 * 难度分布的分组定义
 * FSRS 难度范围为 1-10
 */
const DIFFICULTY_BUCKETS: Array<{ label: string; minValue: number; maxValue: number }> = [
  { label: "1-2", minValue: 1, maxValue: 2 },
  { label: "2-3", minValue: 2, maxValue: 3 },
  { label: "3-4", minValue: 3, maxValue: 4 },
  { label: "4-5", minValue: 4, maxValue: 5 },
  { label: "5-6", minValue: 5, maxValue: 6 },
  { label: "6-7", minValue: 6, maxValue: 7 },
  { label: "7-8", minValue: 7, maxValue: 8 },
  { label: "8-9", minValue: 8, maxValue: 9 },
  { label: "9-10", minValue: 9, maxValue: 10 }
]

/**
 * 计算卡片难度分布
 * 
 * 根据卡片的难度值统计分布情况
 * 
 * @param cards - 卡片数组（需要包含 srs.difficulty 信息）
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 难度分布数据
 */
export function calculateDifficultyDistribution(
  cards: Array<{ srs: { difficulty: number }; deck: string }>,
  deckName?: string
): DifficultyDistribution {
  // 按牌组过滤
  const filteredCards = filterCardsByDeck(cards, deckName)
  // 初始化分组
  const buckets: DifficultyBucket[] = DIFFICULTY_BUCKETS.map(b => ({
    label: b.label,
    minValue: b.minValue,
    maxValue: b.maxValue,
    count: 0
  }))

  let totalDifficulty = 0
  let minDifficulty = Infinity
  let maxDifficulty = -Infinity

  // 统计每张卡片的难度
  for (const card of filteredCards) {
    const difficulty = card.srs.difficulty
    totalDifficulty += difficulty
    
    if (difficulty < minDifficulty) {
      minDifficulty = difficulty
    }
    if (difficulty > maxDifficulty) {
      maxDifficulty = difficulty
    }

    // 找到对应的分组
    for (const bucket of buckets) {
      if (difficulty >= bucket.minValue && difficulty < bucket.maxValue) {
        bucket.count++
        break
      }
      // 处理边界情况：difficulty === 10 应该归入最后一个分组
      if (difficulty === 10 && bucket.maxValue === 10) {
        bucket.count++
        break
      }
    }
  }

  // 计算平均难度
  const averageDifficulty = filteredCards.length > 0 ? totalDifficulty / filteredCards.length : 0

  // 处理空数组的边界情况
  if (filteredCards.length === 0) {
    minDifficulty = 0
    maxDifficulty = 0
  }

  return {
    buckets,
    averageDifficulty,
    minDifficulty,
    maxDifficulty
  }
}

/**
 * 获取卡片难度分布
 * 
 * @param pluginName - 插件名称
 * @param deckName - 牌组名称（可选，用于过滤特定牌组）
 * @returns 难度分布数据
 */
export async function getDifficultyDistribution(
  pluginName: string,
  deckName?: string
): Promise<DifficultyDistribution> {
  // 检查缓存
  const cached = statisticsCache.get<DifficultyDistribution>("difficultyDistribution", pluginName, deckName)
  if (cached) {
    return cached
  }

  const cards = await collectReviewCards(pluginName)
  const result = calculateDifficultyDistribution(cards, deckName)
  
  // 缓存结果
  statisticsCache.set("difficultyDistribution", result, pluginName, deckName)
  return result
}

// ============================================
// 用户偏好存储
// ============================================

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
