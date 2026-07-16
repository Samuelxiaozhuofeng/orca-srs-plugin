/**
 * 统计管理器模块（兼容门面）
 *
 * 负责协调统计数据的收集和计算
 * 提供今日统计、未来预测、复习历史、卡片状态分布等功能
 *
 * 实现已按职责拆分到 `src/srs/statistics/`：
 * - statisticsCache：缓存键与失效
 * - reviewActivityCalculations：日志/活动类纯计算
 * - cardDistributionCalculations：卡片/分布类纯计算
 * - statisticsLoaders：缓存包装 + 日志/卡片加载
 * - statisticsPreferences：偏好持久化
 *
 * 本文件保持全部既有导出名称与行为，供现有 import 路径兼容。
 *
 * @module statisticsManager
 */

export {
  clearStatisticsCache,
  invalidateStatisticsCache
} from "./statistics/statisticsCache"

export {
  isToday,
  filterLogsByTimeRange,
  filterLogsByDeck,
  calculateTodayStatistics,
  calculateReviewHistory,
  calculateReviewTimeStats,
  calculateAnswerButtonStats
} from "./statistics/reviewActivityCalculations"

export {
  filterCardsByDeck,
  calculateFutureForecast,
  calculateCardStateDistribution,
  calculateIntervalDistribution,
  calculateDifficultyDistribution
} from "./statistics/cardDistributionCalculations"

export {
  getTodayStatistics,
  getFutureForecast,
  getReviewHistory,
  getCardStateDistribution,
  getReviewTimeStats,
  getIntervalDistribution,
  getAnswerButtonStats,
  getDifficultyDistribution
} from "./statistics/statisticsLoaders"

export type { StatisticsPreferences } from "./statistics/statisticsPreferences"

export {
  getStatisticsPreferences,
  saveStatisticsPreferences,
  saveTimeRangePreference,
  saveSelectedDeckPreference
} from "./statistics/statisticsPreferences"
