/**
 * 卡片状态 / 间隔 / 难度分布类统计纯计算（无 Orca / 全局副作用）
 *
 * 覆盖：未来到期预测、卡片状态分布、间隔分布、难度分布，以及牌组卡片过滤。
 */

import type {
  FutureForecast,
  ForecastDay,
  CardStateDistribution,
  IntervalDistribution,
  IntervalBucket,
  DifficultyDistribution,
  DifficultyBucket
} from "../types"
import { getDateStart } from "./reviewActivityCalculations"

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
