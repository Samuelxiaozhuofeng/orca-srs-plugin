/**
 * 统计管理器模块属性测试
 * 
 * 使用 fast-check 进行属性测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'
import type { ReviewLogEntry, CardState, Grade } from './types'

// 模拟存储
const mockStorage: Record<string, string> = {}
const mockDataKeys: string[] = []

// 设置全局 orca mock
const mockOrca = {
  plugins: {
    getData: vi.fn(async (_pluginName: string, key: string) => {
      return mockStorage[key] || null
    }),
    setData: vi.fn(async (_pluginName: string, key: string, value: string) => {
      mockStorage[key] = value
      if (!mockDataKeys.includes(key)) {
        mockDataKeys.push(key)
      }
    }),
    getDataKeys: vi.fn(async (_pluginName: string) => {
      return [...mockDataKeys]
    }),
    removeData: vi.fn(async (_pluginName: string, key: string) => {
      delete mockStorage[key]
      const index = mockDataKeys.indexOf(key)
      if (index > -1) {
        mockDataKeys.splice(index, 1)
      }
    })
  },
  invokeBackend: vi.fn(async () => []),
  state: { blocks: {} },
  commands: {
    invokeEditorCommand: vi.fn(async () => {})
  }
}

// @ts-ignore
globalThis.orca = mockOrca

// 导入被测模块（必须在 mock 之后）
import {
  calculateTodayStatistics,
  calculateFutureForecast,
  calculateReviewHistory,
  calculateCardStateDistribution,
  calculateReviewTimeStats,
  calculateIntervalDistribution,
  calculateAnswerButtonStats,
  calculateDifficultyDistribution,
  isToday,
  filterLogsByTimeRange,
  filterLogsByDeck,
  filterCardsByDeck,
  getStatisticsPreferences,
  saveStatisticsPreferences,
  saveTimeRangePreference,
  saveSelectedDeckPreference
} from './statisticsManager'

// 辅助函数：生成有效的 CardState
const cardStateArbitrary = fc.constantFrom<CardState>('new', 'learning', 'review', 'relearning')

// 辅助函数：生成有效的 Grade
const gradeArbitrary = fc.constantFrom<Grade>('again', 'hard', 'good', 'easy')

// 辅助函数：生成今天的时间戳
function getTodayTimestamp(): fc.Arbitrary<number> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1
  return fc.integer({ min: todayStart, max: todayEnd })
}

// 辅助函数：生成非今天的时间戳
function getNotTodayTimestamp(): fc.Arbitrary<number> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  // 生成过去 30 天内但不是今天的时间戳
  const pastStart = todayStart - 30 * 24 * 60 * 60 * 1000
  return fc.integer({ min: pastStart, max: todayStart - 1 })
}

// 辅助函数：生成有效的 ReviewLogEntry（今天的）
const todayReviewLogEntryArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  cardId: fc.integer({ min: 1, max: 1000000 }),
  deckName: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: getTodayTimestamp(),
  grade: gradeArbitrary,
  duration: fc.integer({ min: 0, max: 300000 }),
  previousInterval: fc.integer({ min: 0, max: 365 }),
  newInterval: fc.integer({ min: 0, max: 365 }),
  previousState: cardStateArbitrary,
  newState: cardStateArbitrary
}) as fc.Arbitrary<ReviewLogEntry>

// 辅助函数：生成有效的 ReviewLogEntry（非今天的）
const notTodayReviewLogEntryArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  cardId: fc.integer({ min: 1, max: 1000000 }),
  deckName: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: getNotTodayTimestamp(),
  grade: gradeArbitrary,
  duration: fc.integer({ min: 0, max: 300000 }),
  previousInterval: fc.integer({ min: 0, max: 365 }),
  newInterval: fc.integer({ min: 0, max: 365 }),
  previousState: cardStateArbitrary,
  newState: cardStateArbitrary
}) as fc.Arbitrary<ReviewLogEntry>

// 辅助函数：生成混合的 ReviewLogEntry 数组
const mixedReviewLogsArbitrary = fc.tuple(
  fc.array(todayReviewLogEntryArbitrary, { minLength: 0, maxLength: 20 }),
  fc.array(notTodayReviewLogEntryArbitrary, { minLength: 0, maxLength: 20 })
).map(([todayLogs, notTodayLogs]) => [...todayLogs, ...notTodayLogs])

// 清理函数
function clearMockStorage() {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key])
  mockDataKeys.length = 0
}

describe('statisticsManager', () => {
  beforeEach(() => {
    clearMockStorage()
    vi.clearAllMocks()
  })

  describe('calculateTodayStatistics', () => {
    /**
     * **Feature: anki-statistics, Property 1: 今日统计计算正确性**
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
     * 
     * 对于任意复习记录集合，今日统计的各项数值应该等于对应条件的记录数量之和
     */
    it('Property 1: today statistics should correctly count reviews by grade', () => {
      fc.assert(
        fc.property(mixedReviewLogsArbitrary, (logs) => {
          const stats = calculateTodayStatistics(logs)
          
          // 过滤今日记录
          const todayLogs = logs.filter(log => isToday(log.timestamp))
          
          // 验证已复习数量
          expect(stats.reviewedCount).toBe(todayLogs.length)
          
          // 验证评分分布总和等于已复习数量
          const gradeSum = stats.gradeDistribution.again + 
                          stats.gradeDistribution.hard + 
                          stats.gradeDistribution.good + 
                          stats.gradeDistribution.easy
          expect(gradeSum).toBe(stats.reviewedCount)
          
          // 验证各评分数量
          const expectedAgain = todayLogs.filter(l => l.grade === 'again').length
          const expectedHard = todayLogs.filter(l => l.grade === 'hard').length
          const expectedGood = todayLogs.filter(l => l.grade === 'good').length
          const expectedEasy = todayLogs.filter(l => l.grade === 'easy').length
          
          expect(stats.gradeDistribution.again).toBe(expectedAgain)
          expect(stats.gradeDistribution.hard).toBe(expectedHard)
          expect(stats.gradeDistribution.good).toBe(expectedGood)
          expect(stats.gradeDistribution.easy).toBe(expectedEasy)
        }),
        { numRuns: 100 }
      )
    })

    it('Property 1: today statistics should correctly calculate total time', () => {
      fc.assert(
        fc.property(mixedReviewLogsArbitrary, (logs) => {
          const stats = calculateTodayStatistics(logs)
          
          // 过滤今日记录并计算预期总时间
          const todayLogs = logs.filter(log => isToday(log.timestamp))
          const expectedTotalTime = todayLogs.reduce((sum, log) => sum + log.duration, 0)
          
          expect(stats.totalTime).toBe(expectedTotalTime)
        }),
        { numRuns: 100 }
      )
    })

    it('Property 1: today statistics should correctly count new learned cards', () => {
      fc.assert(
        fc.property(mixedReviewLogsArbitrary, (logs) => {
          const stats = calculateTodayStatistics(logs)
          
          // 过滤今日记录中 previousState 为 'new' 的数量
          const todayLogs = logs.filter(log => isToday(log.timestamp))
          const expectedNewLearned = todayLogs.filter(l => l.previousState === 'new').length
          
          expect(stats.newLearnedCount).toBe(expectedNewLearned)
        }),
        { numRuns: 100 }
      )
    })

    it('Property 1: today statistics should correctly count relearned cards', () => {
      fc.assert(
        fc.property(mixedReviewLogsArbitrary, (logs) => {
          const stats = calculateTodayStatistics(logs)
          
          // 过滤今日记录中 grade 为 'again' 的数量
          const todayLogs = logs.filter(log => isToday(log.timestamp))
          const expectedRelearned = todayLogs.filter(l => l.grade === 'again').length
          
          expect(stats.relearnedCount).toBe(expectedRelearned)
        }),
        { numRuns: 100 }
      )
    })

    it('should return zero counts for empty logs', () => {
      const stats = calculateTodayStatistics([])
      
      expect(stats.reviewedCount).toBe(0)
      expect(stats.newLearnedCount).toBe(0)
      expect(stats.relearnedCount).toBe(0)
      expect(stats.totalTime).toBe(0)
      expect(stats.gradeDistribution.again).toBe(0)
      expect(stats.gradeDistribution.hard).toBe(0)
      expect(stats.gradeDistribution.good).toBe(0)
      expect(stats.gradeDistribution.easy).toBe(0)
    })
  })

  describe('calculateFutureForecast', () => {
    // 辅助函数：生成未来日期
    function getFutureDate(daysFromNow: number): Date {
      const now = new Date()
      const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromNow)
      return future
    }

    // 辅助函数：生成卡片数据
    const cardArbitrary = fc.record({
      srs: fc.record({
        due: fc.integer({ min: 0, max: 60 }).map(days => getFutureDate(days))
      }),
      isNew: fc.boolean(),
      deck: fc.string({ minLength: 1, maxLength: 50 })
    })

    /**
     * **Feature: anki-statistics, Property 2: 未来预测累计一致性**
     * **Validates: Requirements 2.1, 2.3**
     * 
     * 对于任意卡片集合和预测天数 N，第 N 天的累计到期数应该等于第 1 天到第 N 天每日到期数的总和
     */
    it('Property 2: cumulative count should equal sum of daily counts', () => {
      fc.assert(
        fc.property(
          fc.array(cardArbitrary, { minLength: 0, maxLength: 50 }),
          fc.integer({ min: 1, max: 30 }),
          (cards, days) => {
            const forecast = calculateFutureForecast(cards, days)
            
            // 验证每天的累计值等于之前所有天的总和
            let runningSum = 0
            for (let i = 0; i < forecast.days.length; i++) {
              const day = forecast.days[i]
              runningSum += day.reviewDue + day.newAvailable
              expect(day.cumulative).toBe(runningSum)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 2: forecast should have correct number of days', () => {
      fc.assert(
        fc.property(
          fc.array(cardArbitrary, { minLength: 0, maxLength: 20 }),
          fc.integer({ min: 1, max: 60 }),
          (cards, days) => {
            const forecast = calculateFutureForecast(cards, days)
            expect(forecast.days.length).toBe(days)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 2: total cards in forecast should not exceed input cards', () => {
      fc.assert(
        fc.property(
          fc.array(cardArbitrary, { minLength: 0, maxLength: 50 }),
          fc.integer({ min: 1, max: 60 }),
          (cards, days) => {
            const forecast = calculateFutureForecast(cards, days)
            
            // 最后一天的累计值不应超过卡片总数
            // 注意：由于卡片可能在预测范围之外到期，累计值可能小于卡片总数
            const lastDay = forecast.days[forecast.days.length - 1]
            expect(lastDay.cumulative).toBeLessThanOrEqual(cards.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return empty forecast for zero days', () => {
      const cards = [{ srs: { due: new Date() }, isNew: false, deck: 'test' }]
      const forecast = calculateFutureForecast(cards, 0)
      expect(forecast.days.length).toBe(0)
    })

    it('should return zero counts for empty cards', () => {
      const forecast = calculateFutureForecast([], 7)
      expect(forecast.days.length).toBe(7)
      for (const day of forecast.days) {
        expect(day.reviewDue).toBe(0)
        expect(day.newAvailable).toBe(0)
        expect(day.cumulative).toBe(0)
      }
    })
  })

  describe('calculateReviewHistory', () => {
    // 辅助函数：生成指定日期范围内的时间戳
    function getTimestampInRange(startDate: Date, endDate: Date): fc.Arbitrary<number> {
      return fc.integer({ 
        min: startDate.getTime(), 
        max: endDate.getTime() 
      })
    }

    // 辅助函数：生成指定日期范围内的 ReviewLogEntry
    function reviewLogInRangeArbitrary(startDate: Date, endDate: Date): fc.Arbitrary<ReviewLogEntry> {
      return fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        cardId: fc.integer({ min: 1, max: 1000000 }),
        deckName: fc.string({ minLength: 1, maxLength: 100 }),
        timestamp: getTimestampInRange(startDate, endDate),
        grade: gradeArbitrary,
        duration: fc.integer({ min: 0, max: 300000 }),
        previousInterval: fc.integer({ min: 0, max: 365 }),
        newInterval: fc.integer({ min: 0, max: 365 }),
        previousState: cardStateArbitrary,
        newState: cardStateArbitrary
      }) as fc.Arbitrary<ReviewLogEntry>
    }

    /**
     * **Feature: anki-statistics, Property 3: 复习历史评分总和一致性**
     * **Validates: Requirements 3.1, 3.2**
     * 
     * 对于任意复习历史数据，每天的 again + hard + good + easy 应该等于该天的 total
     */
    it('Property 3: each day grade sum should equal total', () => {
      // 使用固定的日期范围进行测试
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      fc.assert(
        fc.property(
          fc.array(reviewLogInRangeArbitrary(startDate, endDate), { minLength: 0, maxLength: 100 }),
          (logs) => {
            const history = calculateReviewHistory(logs, startDate, endDate)
            
            // 验证每天的评分总和等于 total
            for (const day of history.days) {
              const gradeSum = day.again + day.hard + day.good + day.easy
              expect(gradeSum).toBe(day.total)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 3: total reviews should equal sum of all daily totals', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      fc.assert(
        fc.property(
          fc.array(reviewLogInRangeArbitrary(startDate, endDate), { minLength: 0, maxLength: 100 }),
          (logs) => {
            const history = calculateReviewHistory(logs, startDate, endDate)
            
            // 验证总复习数等于所有天的 total 之和
            const sumOfDailyTotals = history.days.reduce((sum, day) => sum + day.total, 0)
            expect(history.totalReviews).toBe(sumOfDailyTotals)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 3: average per day should be correctly calculated', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      fc.assert(
        fc.property(
          fc.array(reviewLogInRangeArbitrary(startDate, endDate), { minLength: 0, maxLength: 100 }),
          (logs) => {
            const history = calculateReviewHistory(logs, startDate, endDate)
            
            // 验证日均复习数计算正确
            const numberOfDays = history.days.length || 1
            const expectedAverage = history.totalReviews / numberOfDays
            expect(history.averagePerDay).toBeCloseTo(expectedAverage, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return correct number of days in range', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-10')
      
      const history = calculateReviewHistory([], startDate, endDate)
      
      // 1月1日到1月10日应该有10天
      expect(history.days.length).toBe(10)
    })

    it('should return zero counts for empty logs', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-07')
      
      const history = calculateReviewHistory([], startDate, endDate)
      
      expect(history.totalReviews).toBe(0)
      expect(history.averagePerDay).toBe(0)
      for (const day of history.days) {
        expect(day.total).toBe(0)
        expect(day.again).toBe(0)
        expect(day.hard).toBe(0)
        expect(day.good).toBe(0)
        expect(day.easy).toBe(0)
      }
    })
  })

  describe('calculateCardStateDistribution', () => {
    // 辅助函数：生成卡片数据用于状态分布测试
    // FSRS State: 0=New, 1=Learning, 2=Review, 3=Relearning
    const cardForDistributionArbitrary = fc.record({
      isNew: fc.boolean(),
      srs: fc.record({
        reps: fc.integer({ min: 0, max: 100 }),
        lapses: fc.integer({ min: 0, max: 50 }),
        state: fc.constantFrom(0, 1, 2, 3) // FSRS states
      }),
      deck: fc.string({ minLength: 1, maxLength: 50 })
    })

    /**
     * **Feature: anki-statistics, Property 5: 卡片状态分布总和一致性**
     * **Validates: Requirements 4.1, 4.3**
     * 
     * 对于任意卡片集合，new + learning + review + suspended 应该等于 total
     */
    it('Property 5: state distribution sum should equal total', () => {
      fc.assert(
        fc.property(
          fc.array(cardForDistributionArbitrary, { minLength: 0, maxLength: 100 }),
          (cards) => {
            const distribution = calculateCardStateDistribution(cards)
            
            // 验证各状态数量之和等于总数
            const stateSum = distribution.new + 
                            distribution.learning + 
                            distribution.review + 
                            distribution.suspended
            expect(stateSum).toBe(distribution.total)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 5: total should equal input cards length', () => {
      fc.assert(
        fc.property(
          fc.array(cardForDistributionArbitrary, { minLength: 0, maxLength: 100 }),
          (cards) => {
            const distribution = calculateCardStateDistribution(cards)
            expect(distribution.total).toBe(cards.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 5: new cards count should match isNew=true cards', () => {
      fc.assert(
        fc.property(
          fc.array(cardForDistributionArbitrary, { minLength: 0, maxLength: 100 }),
          (cards) => {
            const distribution = calculateCardStateDistribution(cards)
            const expectedNew = cards.filter(c => c.isNew).length
            expect(distribution.new).toBe(expectedNew)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return zero counts for empty cards', () => {
      const distribution = calculateCardStateDistribution([])
      
      expect(distribution.new).toBe(0)
      expect(distribution.learning).toBe(0)
      expect(distribution.review).toBe(0)
      expect(distribution.suspended).toBe(0)
      expect(distribution.total).toBe(0)
    })

    it('should correctly categorize learning and relearning states', () => {
      // 测试 Learning (state=1) 和 Relearning (state=3) 都被归类为 learning
      const cards = [
        { isNew: false, srs: { reps: 1, lapses: 0, state: 1 }, deck: 'test' }, // Learning
        { isNew: false, srs: { reps: 5, lapses: 1, state: 3 }, deck: 'test' }, // Relearning
        { isNew: false, srs: { reps: 10, lapses: 0, state: 2 }, deck: 'test' } // Review
      ]
      
      const distribution = calculateCardStateDistribution(cards)
      
      expect(distribution.learning).toBe(2) // Learning + Relearning
      expect(distribution.review).toBe(1)
      expect(distribution.total).toBe(3)
    })
  })

  describe('calculateReviewTimeStats', () => {
    // 辅助函数：生成指定日期范围内的时间戳
    function getTimestampInRange(startDate: Date, endDate: Date): fc.Arbitrary<number> {
      return fc.integer({ 
        min: startDate.getTime(), 
        max: endDate.getTime() 
      })
    }

    // 辅助函数：生成指定日期范围内的 ReviewLogEntry
    function reviewLogInRangeArbitrary(startDate: Date, endDate: Date): fc.Arbitrary<ReviewLogEntry> {
      return fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        cardId: fc.integer({ min: 1, max: 1000000 }),
        deckName: fc.string({ minLength: 1, maxLength: 100 }),
        timestamp: getTimestampInRange(startDate, endDate),
        grade: gradeArbitrary,
        duration: fc.integer({ min: 0, max: 300000 }),
        previousInterval: fc.integer({ min: 0, max: 365 }),
        newInterval: fc.integer({ min: 0, max: 365 }),
        previousState: cardStateArbitrary,
        newState: cardStateArbitrary
      }) as fc.Arbitrary<ReviewLogEntry>
    }

    /**
     * **Feature: anki-statistics, Property 6: 复习时间平均值正确性**
     * **Validates: Requirements 5.2, 5.3**
     * 
     * 对于任意复习时间统计数据，averagePerDay 应该等于 totalTime / numberOfDays
     */
    it('Property 6: average per day should equal totalTime / numberOfDays', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      fc.assert(
        fc.property(
          fc.array(reviewLogInRangeArbitrary(startDate, endDate), { minLength: 0, maxLength: 100 }),
          (logs) => {
            const stats = calculateReviewTimeStats(logs, startDate, endDate)
            
            // 验证平均每天复习时间计算正确
            const numberOfDays = stats.dailyTime.length || 1
            const expectedAverage = stats.totalTime / numberOfDays
            expect(stats.averagePerDay).toBeCloseTo(expectedAverage, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 6: total time should equal sum of all daily times', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      fc.assert(
        fc.property(
          fc.array(reviewLogInRangeArbitrary(startDate, endDate), { minLength: 0, maxLength: 100 }),
          (logs) => {
            const stats = calculateReviewTimeStats(logs, startDate, endDate)
            
            // 验证总时间等于所有天的时间之和
            const sumOfDailyTimes = stats.dailyTime.reduce((sum, day) => sum + day.time, 0)
            expect(stats.totalTime).toBe(sumOfDailyTimes)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 6: total time should equal sum of all log durations', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      fc.assert(
        fc.property(
          fc.array(reviewLogInRangeArbitrary(startDate, endDate), { minLength: 0, maxLength: 100 }),
          (logs) => {
            const stats = calculateReviewTimeStats(logs, startDate, endDate)
            
            // 验证总时间等于所有记录的 duration 之和
            const expectedTotalTime = logs.reduce((sum, log) => sum + log.duration, 0)
            expect(stats.totalTime).toBe(expectedTotalTime)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return zero times for empty logs', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-07')
      
      const stats = calculateReviewTimeStats([], startDate, endDate)
      
      expect(stats.totalTime).toBe(0)
      expect(stats.averagePerDay).toBe(0)
      for (const day of stats.dailyTime) {
        expect(day.time).toBe(0)
      }
    })
  })

  describe('calculateIntervalDistribution', () => {
    // 辅助函数：生成卡片数据用于间隔分布测试
    const cardForIntervalArbitrary = fc.record({
      srs: fc.record({
        interval: fc.integer({ min: 0, max: 365 })
      }),
      deck: fc.string({ minLength: 1, maxLength: 50 })
    })

    /**
     * **Feature: anki-statistics, Property 7: 间隔分布分组完整性**
     * **Validates: Requirements 6.1, 6.2**
     * 
     * 对于任意卡片集合，所有分组的卡片数量之和应该等于总卡片数
     */
    it('Property 7: bucket counts sum should equal total cards', () => {
      fc.assert(
        fc.property(
          fc.array(cardForIntervalArbitrary, { minLength: 0, maxLength: 100 }),
          (cards) => {
            const distribution = calculateIntervalDistribution(cards)
            
            // 验证所有分组的卡片数量之和等于总卡片数
            const bucketSum = distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0)
            expect(bucketSum).toBe(cards.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Feature: anki-statistics, Property 8: 间隔平均值正确性**
     * **Validates: Requirements 6.3**
     * 
     * 对于任意卡片集合，平均间隔应该等于所有卡片间隔之和除以卡片数量
     */
    it('Property 8: average interval should be correctly calculated', () => {
      fc.assert(
        fc.property(
          fc.array(cardForIntervalArbitrary, { minLength: 1, maxLength: 100 }),
          (cards) => {
            const distribution = calculateIntervalDistribution(cards)
            
            // 验证平均间隔计算正确
            const totalInterval = cards.reduce((sum, card) => sum + card.srs.interval, 0)
            const expectedAverage = totalInterval / cards.length
            expect(distribution.averageInterval).toBeCloseTo(expectedAverage, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 8: max interval should be the maximum of all intervals', () => {
      fc.assert(
        fc.property(
          fc.array(cardForIntervalArbitrary, { minLength: 1, maxLength: 100 }),
          (cards) => {
            const distribution = calculateIntervalDistribution(cards)
            
            // 验证最大间隔正确
            const expectedMax = Math.max(...cards.map(c => c.srs.interval))
            expect(distribution.maxInterval).toBe(expectedMax)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return zero values for empty cards', () => {
      const distribution = calculateIntervalDistribution([])
      
      expect(distribution.averageInterval).toBe(0)
      expect(distribution.maxInterval).toBe(0)
      for (const bucket of distribution.buckets) {
        expect(bucket.count).toBe(0)
      }
    })
  })

  describe('calculateAnswerButtonStats', () => {
    // 辅助函数：生成 ReviewLogEntry
    const reviewLogArbitrary = fc.record({
      id: fc.string({ minLength: 1, maxLength: 50 }),
      cardId: fc.integer({ min: 1, max: 1000000 }),
      deckName: fc.string({ minLength: 1, maxLength: 100 }),
      timestamp: fc.integer({ min: 0, max: Date.now() }),
      grade: gradeArbitrary,
      duration: fc.integer({ min: 0, max: 300000 }),
      previousInterval: fc.integer({ min: 0, max: 365 }),
      newInterval: fc.integer({ min: 0, max: 365 }),
      previousState: cardStateArbitrary,
      newState: cardStateArbitrary
    }) as fc.Arbitrary<ReviewLogEntry>

    /**
     * **Feature: anki-statistics, Property 9: 答题按钮正确率计算**
     * **Validates: Requirements 7.1, 7.4**
     * 
     * 对于任意答题按钮统计数据，correctRate 应该等于 (good + easy) / total
     */
    it('Property 9: correct rate should equal (good + easy) / total', () => {
      fc.assert(
        fc.property(
          fc.array(reviewLogArbitrary, { minLength: 1, maxLength: 100 }),
          (logs) => {
            const stats = calculateAnswerButtonStats(logs)
            
            // 验证正确率计算正确
            const expectedCorrectRate = (stats.good + stats.easy) / stats.total
            expect(stats.correctRate).toBeCloseTo(expectedCorrectRate, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 9: grade counts sum should equal total', () => {
      fc.assert(
        fc.property(
          fc.array(reviewLogArbitrary, { minLength: 0, maxLength: 100 }),
          (logs) => {
            const stats = calculateAnswerButtonStats(logs)
            
            // 验证各评分数量之和等于总数
            const gradeSum = stats.again + stats.hard + stats.good + stats.easy
            expect(gradeSum).toBe(stats.total)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 9: total should equal input logs length', () => {
      fc.assert(
        fc.property(
          fc.array(reviewLogArbitrary, { minLength: 0, maxLength: 100 }),
          (logs) => {
            const stats = calculateAnswerButtonStats(logs)
            expect(stats.total).toBe(logs.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return zero values for empty logs', () => {
      const stats = calculateAnswerButtonStats([])
      
      expect(stats.again).toBe(0)
      expect(stats.hard).toBe(0)
      expect(stats.good).toBe(0)
      expect(stats.easy).toBe(0)
      expect(stats.total).toBe(0)
      expect(stats.correctRate).toBe(0)
    })
  })

  describe('calculateDifficultyDistribution', () => {
    // 辅助函数：生成卡片数据用于难度分布测试
    // 使用 noNaN 选项排除 NaN 值，因为难度值应该是有效的数字
    const cardForDifficultyArbitrary = fc.record({
      srs: fc.record({
        difficulty: fc.float({ min: 1, max: 10, noNaN: true })
      }),
      deck: fc.string({ minLength: 1, maxLength: 50 })
    })

    /**
     * **Feature: anki-statistics, Property 11: 难度分布统计正确性**
     * **Validates: Requirements 10.1, 10.2, 10.3**
     * 
     * 对于任意卡片集合，平均难度应该等于所有卡片难度之和除以卡片数量，
     * 且最小值和最大值应该正确反映实际范围
     */
    it('Property 11: average difficulty should be correctly calculated', () => {
      fc.assert(
        fc.property(
          fc.array(cardForDifficultyArbitrary, { minLength: 1, maxLength: 100 }),
          (cards) => {
            const distribution = calculateDifficultyDistribution(cards)
            
            // 验证平均难度计算正确
            const totalDifficulty = cards.reduce((sum, card) => sum + card.srs.difficulty, 0)
            const expectedAverage = totalDifficulty / cards.length
            expect(distribution.averageDifficulty).toBeCloseTo(expectedAverage, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 11: min and max difficulty should reflect actual range', () => {
      fc.assert(
        fc.property(
          fc.array(cardForDifficultyArbitrary, { minLength: 1, maxLength: 100 }),
          (cards) => {
            const distribution = calculateDifficultyDistribution(cards)
            
            // 验证最小和最大难度正确
            const difficulties = cards.map(c => c.srs.difficulty)
            const expectedMin = Math.min(...difficulties)
            const expectedMax = Math.max(...difficulties)
            
            expect(distribution.minDifficulty).toBeCloseTo(expectedMin, 5)
            expect(distribution.maxDifficulty).toBeCloseTo(expectedMax, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 11: bucket counts sum should equal total cards', () => {
      fc.assert(
        fc.property(
          fc.array(cardForDifficultyArbitrary, { minLength: 0, maxLength: 100 }),
          (cards) => {
            const distribution = calculateDifficultyDistribution(cards)
            
            // 验证所有分组的卡片数量之和等于总卡片数
            const bucketSum = distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0)
            expect(bucketSum).toBe(cards.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return zero values for empty cards', () => {
      const distribution = calculateDifficultyDistribution([])
      
      expect(distribution.averageDifficulty).toBe(0)
      expect(distribution.minDifficulty).toBe(0)
      expect(distribution.maxDifficulty).toBe(0)
      for (const bucket of distribution.buckets) {
        expect(bucket.count).toBe(0)
      }
    })
  })

  describe('filterLogsByTimeRange', () => {
    // 辅助函数：生成指定时间范围内的 ReviewLogEntry
    function reviewLogWithTimestampArbitrary(minTime: number, maxTime: number): fc.Arbitrary<ReviewLogEntry> {
      return fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        cardId: fc.integer({ min: 1, max: 1000000 }),
        deckName: fc.string({ minLength: 1, maxLength: 100 }),
        timestamp: fc.integer({ min: minTime, max: maxTime }),
        grade: gradeArbitrary,
        duration: fc.integer({ min: 0, max: 300000 }),
        previousInterval: fc.integer({ min: 0, max: 365 }),
        newInterval: fc.integer({ min: 0, max: 365 }),
        previousState: cardStateArbitrary,
        newState: cardStateArbitrary
      }) as fc.Arbitrary<ReviewLogEntry>
    }

    /**
     * **Feature: anki-statistics, Property 4: 时间范围过滤正确性**
     * **Validates: Requirements 3.3, 5.4, 7.3, 8.2**
     * 
     * 对于任意复习记录集合和时间范围，过滤后的记录应该只包含时间范围内的记录，
     * 且不遗漏任何符合条件的记录
     */
    it('Property 4: filtered logs should only contain logs within time range', () => {
      // 使用固定的时间范围进行测试
      const startDate = new Date('2024-01-15')
      const endDate = new Date('2024-01-20')
      const startTime = startDate.getTime()
      const endTime = endDate.getTime()
      
      // 生成混合时间范围的记录
      const beforeRangeArbitrary = reviewLogWithTimestampArbitrary(
        startTime - 30 * 24 * 60 * 60 * 1000, // 30天前
        startTime - 1
      )
      const inRangeArbitrary = reviewLogWithTimestampArbitrary(startTime, endTime)
      const afterRangeArbitrary = reviewLogWithTimestampArbitrary(
        endTime + 1,
        endTime + 30 * 24 * 60 * 60 * 1000 // 30天后
      )
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(beforeRangeArbitrary, { minLength: 0, maxLength: 10 }),
            fc.array(inRangeArbitrary, { minLength: 0, maxLength: 10 }),
            fc.array(afterRangeArbitrary, { minLength: 0, maxLength: 10 })
          ),
          ([beforeLogs, inRangeLogs, afterLogs]) => {
            const allLogs = [...beforeLogs, ...inRangeLogs, ...afterLogs]
            const filtered = filterLogsByTimeRange(allLogs, startDate, endDate)
            
            // 验证所有过滤后的记录都在时间范围内
            for (const log of filtered) {
              expect(log.timestamp).toBeGreaterThanOrEqual(startTime)
              expect(log.timestamp).toBeLessThanOrEqual(endTime)
            }
            
            // 验证没有遗漏任何符合条件的记录
            expect(filtered.length).toBe(inRangeLogs.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 4: filtering should not modify original logs', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      const startTime = startDate.getTime()
      const endTime = endDate.getTime()
      
      const logsArbitrary = fc.array(
        reviewLogWithTimestampArbitrary(
          startTime - 10 * 24 * 60 * 60 * 1000,
          endTime + 10 * 24 * 60 * 60 * 1000
        ),
        { minLength: 0, maxLength: 50 }
      )
      
      fc.assert(
        fc.property(logsArbitrary, (logs) => {
          const originalLength = logs.length
          filterLogsByTimeRange(logs, startDate, endDate)
          
          // 验证原数组未被修改
          expect(logs.length).toBe(originalLength)
        }),
        { numRuns: 100 }
      )
    })

    it('should return empty array when no logs in range', () => {
      const startDate = new Date('2024-01-15')
      const endDate = new Date('2024-01-20')
      
      // 所有记录都在范围之外
      const logs: ReviewLogEntry[] = [
        {
          id: '1',
          cardId: 1,
          deckName: 'test',
          timestamp: new Date('2024-01-01').getTime(),
          grade: 'good',
          duration: 1000,
          previousInterval: 1,
          newInterval: 2,
          previousState: 'review',
          newState: 'review'
        }
      ]
      
      const filtered = filterLogsByTimeRange(logs, startDate, endDate)
      expect(filtered.length).toBe(0)
    })

    it('should return all logs when all are in range', () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      
      const logs: ReviewLogEntry[] = [
        {
          id: '1',
          cardId: 1,
          deckName: 'test',
          timestamp: new Date('2024-01-15').getTime(),
          grade: 'good',
          duration: 1000,
          previousInterval: 1,
          newInterval: 2,
          previousState: 'review',
          newState: 'review'
        },
        {
          id: '2',
          cardId: 2,
          deckName: 'test',
          timestamp: new Date('2024-01-20').getTime(),
          grade: 'easy',
          duration: 500,
          previousInterval: 2,
          newInterval: 4,
          previousState: 'review',
          newState: 'review'
        }
      ]
      
      const filtered = filterLogsByTimeRange(logs, startDate, endDate)
      expect(filtered.length).toBe(2)
    })
  })

  describe('filterLogsByDeck', () => {
    // 辅助函数：生成带有指定牌组名的 ReviewLogEntry
    function reviewLogWithDeckArbitrary(deckName: string): fc.Arbitrary<ReviewLogEntry> {
      return fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        cardId: fc.integer({ min: 1, max: 1000000 }),
        deckName: fc.constant(deckName),
        timestamp: fc.integer({ min: 0, max: Date.now() }),
        grade: gradeArbitrary,
        duration: fc.integer({ min: 0, max: 300000 }),
        previousInterval: fc.integer({ min: 0, max: 365 }),
        newInterval: fc.integer({ min: 0, max: 365 }),
        previousState: cardStateArbitrary,
        newState: cardStateArbitrary
      }) as fc.Arbitrary<ReviewLogEntry>
    }

    /**
     * **Feature: anki-statistics, Property 10: 牌组过滤正确性**
     * **Validates: Requirements 9.2, 9.3, 9.4**
     * 
     * 对于任意复习记录集合和牌组名称，过滤后的记录应该只包含该牌组的记录，
     * 且不遗漏任何符合条件的记录
     */
    it('Property 10: filtered logs should only contain logs from specified deck', () => {
      const targetDeck = 'targetDeck'
      const otherDeck = 'otherDeck'
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(reviewLogWithDeckArbitrary(targetDeck), { minLength: 0, maxLength: 20 }),
            fc.array(reviewLogWithDeckArbitrary(otherDeck), { minLength: 0, maxLength: 20 })
          ),
          ([targetLogs, otherLogs]) => {
            const allLogs = [...targetLogs, ...otherLogs]
            const filtered = filterLogsByDeck(allLogs, targetDeck)
            
            // 验证所有过滤后的记录都属于目标牌组
            for (const log of filtered) {
              expect(log.deckName).toBe(targetDeck)
            }
            
            // 验证没有遗漏任何符合条件的记录
            expect(filtered.length).toBe(targetLogs.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 10: filtering with undefined deck should return all logs', () => {
      const deck1 = 'deck1'
      const deck2 = 'deck2'
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(reviewLogWithDeckArbitrary(deck1), { minLength: 0, maxLength: 20 }),
            fc.array(reviewLogWithDeckArbitrary(deck2), { minLength: 0, maxLength: 20 })
          ),
          ([logs1, logs2]) => {
            const allLogs = [...logs1, ...logs2]
            const filtered = filterLogsByDeck(allLogs, undefined)
            
            // 验证返回所有记录
            expect(filtered.length).toBe(allLogs.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 10: filtering should not modify original logs', () => {
      fc.assert(
        fc.property(
          fc.array(reviewLogWithDeckArbitrary('anyDeck'), { minLength: 0, maxLength: 50 }),
          (logs) => {
            const originalLength = logs.length
            filterLogsByDeck(logs, 'anyDeck')
            
            // 验证原数组未被修改
            expect(logs.length).toBe(originalLength)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return empty array when no logs match deck', () => {
      const logs: ReviewLogEntry[] = [
        {
          id: '1',
          cardId: 1,
          deckName: 'deck1',
          timestamp: Date.now(),
          grade: 'good',
          duration: 1000,
          previousInterval: 1,
          newInterval: 2,
          previousState: 'review',
          newState: 'review'
        }
      ]
      
      const filtered = filterLogsByDeck(logs, 'nonExistentDeck')
      expect(filtered.length).toBe(0)
    })
  })

  describe('filterCardsByDeck', () => {
    // 辅助函数：生成带有指定牌组名的卡片
    function cardWithDeckArbitrary(deckName: string) {
      return fc.record({
        deck: fc.constant(deckName),
        srs: fc.record({
          interval: fc.integer({ min: 0, max: 365 }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        isNew: fc.boolean()
      })
    }

    /**
     * **Feature: anki-statistics, Property 10: 牌组过滤正确性（卡片）**
     * **Validates: Requirements 9.2, 9.3, 9.4**
     */
    it('Property 10: filtered cards should only contain cards from specified deck', () => {
      const targetDeck = 'targetDeck'
      const otherDeck = 'otherDeck'
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(cardWithDeckArbitrary(targetDeck), { minLength: 0, maxLength: 20 }),
            fc.array(cardWithDeckArbitrary(otherDeck), { minLength: 0, maxLength: 20 })
          ),
          ([targetCards, otherCards]) => {
            const allCards = [...targetCards, ...otherCards]
            const filtered = filterCardsByDeck(allCards, targetDeck)
            
            // 验证所有过滤后的卡片都属于目标牌组
            for (const card of filtered) {
              expect(card.deck).toBe(targetDeck)
            }
            
            // 验证没有遗漏任何符合条件的卡片
            expect(filtered.length).toBe(targetCards.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property 10: filtering with undefined deck should return all cards', () => {
      const deck1 = 'deck1'
      const deck2 = 'deck2'
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(cardWithDeckArbitrary(deck1), { minLength: 0, maxLength: 20 }),
            fc.array(cardWithDeckArbitrary(deck2), { minLength: 0, maxLength: 20 })
          ),
          ([cards1, cards2]) => {
            const allCards = [...cards1, ...cards2]
            const filtered = filterCardsByDeck(allCards, undefined)
            
            // 验证返回所有卡片
            expect(filtered.length).toBe(allCards.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('statisticsPreferences', () => {
    const pluginName = 'test-plugin'

    beforeEach(() => {
      clearMockStorage()
    })

    it('should return default preferences when no preferences are stored', async () => {
      const preferences = await getStatisticsPreferences(pluginName)
      
      expect(preferences.timeRange).toBe('1month')
      expect(preferences.selectedDeck).toBeUndefined()
    })

    it('should save and retrieve time range preference', async () => {
      await saveTimeRangePreference(pluginName, '3months')
      
      const preferences = await getStatisticsPreferences(pluginName)
      expect(preferences.timeRange).toBe('3months')
    })

    it('should save and retrieve selected deck preference', async () => {
      await saveSelectedDeckPreference(pluginName, 'myDeck')
      
      const preferences = await getStatisticsPreferences(pluginName)
      expect(preferences.selectedDeck).toBe('myDeck')
    })

    it('should save and retrieve full preferences', async () => {
      await saveStatisticsPreferences(pluginName, {
        timeRange: '1year',
        selectedDeck: 'testDeck'
      })
      
      const preferences = await getStatisticsPreferences(pluginName)
      expect(preferences.timeRange).toBe('1year')
      expect(preferences.selectedDeck).toBe('testDeck')
    })

    it('should merge partial preferences with existing ones', async () => {
      // 先保存时间范围
      await saveTimeRangePreference(pluginName, '3months')
      
      // 再保存牌组选择
      await saveSelectedDeckPreference(pluginName, 'anotherDeck')
      
      // 验证两个设置都被保留
      const preferences = await getStatisticsPreferences(pluginName)
      expect(preferences.timeRange).toBe('3months')
      expect(preferences.selectedDeck).toBe('anotherDeck')
    })

    it('should clear selected deck when set to undefined', async () => {
      // 先设置牌组
      await saveSelectedDeckPreference(pluginName, 'someDeck')
      
      // 清除牌组选择
      await saveSelectedDeckPreference(pluginName, undefined)
      
      const preferences = await getStatisticsPreferences(pluginName)
      expect(preferences.selectedDeck).toBeUndefined()
    })
  })
})
