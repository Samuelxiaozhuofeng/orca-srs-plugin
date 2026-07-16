/**
 * 统计视图主组件
 *
 * 提供 Anki 风格的学习统计数据可视化
 * 包括今日统计、未来预测、复习历史、卡片状态分布等
 *
 * 子组件拆分至 `src/components/statistics/`；本文件负责数据协调与页面编排。
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import type {
  TimeRange,
  TodayStatistics,
  FutureForecast,
  ReviewHistory,
  CardStateDistribution,
  ReviewTimeStats,
  IntervalDistribution,
  AnswerButtonStats,
  DifficultyDistribution,
  DeckInfo
} from "../srs/types"
import { DeckFilter, TimeRangeSelector } from "./statistics/StatisticsFilters"
import { TodayStatsCard } from "./statistics/TodayStatsCard"
import {
  AnswerButtonChart,
  FutureForecastChart,
  ReviewHistoryChart,
  ReviewTimeChart
} from "./statistics/ReviewActivityCharts"
import {
  CardStateDistributionChart,
  DifficultyDistributionChart,
  IntervalDistributionChart
} from "./statistics/CardDistributionCharts"

const { useState, useEffect, useCallback } = window.React
const { Button } = orca.components

// ========================================
// 类型定义
// ========================================

interface StatisticsViewProps {
  panelId: string
  pluginName: string
  onBack: () => void
  decks: DeckInfo[]
}

// ========================================
// 主组件：统计视图
// ========================================

export default function StatisticsView({ panelId, pluginName, onBack, decks }: StatisticsViewProps) {
  // 状态
  const [timeRange, setTimeRange] = useState<TimeRange>("1month")
  const [selectedDeck, setSelectedDeck] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  // 统计数据
  const [todayStats, setTodayStats] = useState<TodayStatistics | null>(null)
  const [futureForecast, setFutureForecast] = useState<FutureForecast | null>(null)
  const [reviewHistory, setReviewHistory] = useState<ReviewHistory | null>(null)
  const [cardDistribution, setCardDistribution] = useState<CardStateDistribution | null>(null)
  const [reviewTimeStats, setReviewTimeStats] = useState<ReviewTimeStats | null>(null)
  const [intervalDistribution, setIntervalDistribution] = useState<IntervalDistribution | null>(null)
  const [answerButtonStats, setAnswerButtonStats] = useState<AnswerButtonStats | null>(null)
  const [difficultyDistribution, setDifficultyDistribution] = useState<DifficultyDistribution | null>(null)

  // 刷新状态
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 加载统计数据
  const loadStatistics = useCallback(async (clearCache = false) => {
    setIsLoading(true)
    if (clearCache) {
      setIsRefreshing(true)
    }
    try {
      const {
        getTodayStatistics,
        getFutureForecast,
        getReviewHistory,
        getCardStateDistribution,
        getReviewTimeStats,
        getIntervalDistribution,
        getAnswerButtonStats,
        getDifficultyDistribution,
        getStatisticsPreferences,
        saveStatisticsPreferences,
        clearStatisticsCache
      } = await import("../srs/statisticsManager")

      // 如果需要清除缓存
      if (clearCache) {
        clearStatisticsCache()
      }

      // 加载用户偏好
      const preferences = await getStatisticsPreferences(pluginName)
      setTimeRange(preferences.timeRange)
      if (preferences.selectedDeck) {
        setSelectedDeck(preferences.selectedDeck)
      }

      // 并行加载所有统计数据
      const [
        today,
        forecast,
        history,
        cardDist,
        timeStats,
        intervalDist,
        answerStats,
        difficultyDist
      ] = await Promise.all([
        getTodayStatistics(pluginName, selectedDeck),
        getFutureForecast(pluginName, 30, selectedDeck),
        getReviewHistory(pluginName, timeRange, selectedDeck),
        getCardStateDistribution(pluginName, selectedDeck),
        getReviewTimeStats(pluginName, timeRange, selectedDeck),
        getIntervalDistribution(pluginName, selectedDeck),
        getAnswerButtonStats(pluginName, timeRange, selectedDeck),
        getDifficultyDistribution(pluginName, selectedDeck)
      ])

      setTodayStats(today)
      setFutureForecast(forecast)
      setReviewHistory(history)
      setCardDistribution(cardDist)
      setReviewTimeStats(timeStats)
      setIntervalDistribution(intervalDist)
      setAnswerButtonStats(answerStats)
      setDifficultyDistribution(difficultyDist)
    } catch (error) {
      console.error(`[${pluginName}] 加载统计数据失败:`, error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [pluginName, timeRange, selectedDeck])

  // 初始加载
  useEffect(() => {
    void loadStatistics()
  }, [loadStatistics])

  // 处理时间范围变更
  const handleTimeRangeChange = useCallback(async (range: TimeRange) => {
    setTimeRange(range)
    try {
      const { saveTimeRangePreference } = await import("../srs/statisticsManager")
      await saveTimeRangePreference(pluginName, range)
    } catch (error) {
      console.error(`[${pluginName}] 保存时间范围偏好失败:`, error)
    }
  }, [pluginName])

  // 处理牌组筛选变更
  const handleDeckChange = useCallback(async (deckName: string | undefined) => {
    setSelectedDeck(deckName)
    try {
      const { saveSelectedDeckPreference } = await import("../srs/statisticsManager")
      await saveSelectedDeckPreference(pluginName, deckName)
    } catch (error) {
      console.error(`[${pluginName}] 保存牌组偏好失败:`, error)
    }
  }, [pluginName])

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      height: "100%",
      overflow: "auto"
    }}>
      {/* 头部 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <Button variant="plain" onClick={onBack} style={{ fontSize: "13px", padding: "6px 12px" }}>
          ← 返回
        </Button>
        <div style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          flex: 1
        }}>
          学习统计
        </div>
        <Button
          variant="plain"
          onClick={() => !isRefreshing && void loadStatistics(true)}
          style={{
            fontSize: "13px",
            padding: "6px 12px",
            opacity: isRefreshing ? 0.6 : 1,
            cursor: isRefreshing ? "not-allowed" : "pointer"
          }}
          title="刷新数据（清除缓存）"
        >
          <i
            className={`ti ti-refresh ${isRefreshing ? "srs-refresh-spinning" : ""}`}
            style={{ marginRight: "4px" }}
          />
          {isRefreshing ? "刷新中..." : "刷新"}
        </Button>
      </div>

      {/* 筛选器 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px"
      }}>
        <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
        <div style={{ width: "1px", height: "24px", backgroundColor: "var(--orca-color-border-1)" }} />
        <DeckFilter decks={decks} selectedDeck={selectedDeck} onChange={handleDeckChange} />
      </div>

      {/* 今日统计 */}
      <TodayStatsCard stats={todayStats} isLoading={isLoading} />

      {/* 图表区域 - 两列布局 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
        gap: "16px"
      }}>
        {/* 卡片状态分布 */}
        <CardStateDistributionChart distribution={cardDistribution} isLoading={isLoading} />

        {/* 答题按钮统计 */}
        <AnswerButtonChart stats={answerButtonStats} isLoading={isLoading} />
      </div>

      {/* 未来预测 */}
      <FutureForecastChart forecast={futureForecast} isLoading={isLoading} />

      {/* 复习历史 */}
      <ReviewHistoryChart history={reviewHistory} isLoading={isLoading} />

      {/* 复习时间统计 */}
      <ReviewTimeChart stats={reviewTimeStats} isLoading={isLoading} />

      {/* 间隔和难度分布 - 两列布局 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
        gap: "16px"
      }}>
        {/* 卡片间隔分布 */}
        <IntervalDistributionChart distribution={intervalDistribution} isLoading={isLoading} />

        {/* 难度分布 */}
        <DifficultyDistributionChart distribution={difficultyDistribution} isLoading={isLoading} />
      </div>
    </div>
  )
}
