/**
 * 统计数据加载包装（缓存 + 日志/卡收集副作用）
 */

import type {
  TodayStatistics,
  FutureForecast,
  ReviewHistory,
  CardStateDistribution,
  TimeRange,
  ReviewTimeStats,
  IntervalDistribution,
  AnswerButtonStats,
  DifficultyDistribution
} from "../types"
import { getTimeRangeStartDate } from "../types"
import { getReviewLogs } from "../reviewLogStorage"
import { collectReviewCards } from "../cardCollector"
import { statisticsCache } from "./statisticsCache"
import {
  calculateAnswerButtonStats,
  calculateReviewHistory,
  calculateReviewTimeStats,
  calculateTodayStatistics,
  getDateStart
} from "./reviewActivityCalculations"
import {
  calculateCardStateDistribution,
  calculateDifficultyDistribution,
  calculateFutureForecast,
  calculateIntervalDistribution
} from "./cardDistributionCalculations"

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
