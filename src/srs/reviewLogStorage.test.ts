/**
 * 复习记录存储模块属性测试
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
    getData: vi.fn(async (pluginName: string, key: string) => {
      return mockStorage[key] || null
    }),
    setData: vi.fn(async (pluginName: string, key: string, value: string) => {
      mockStorage[key] = value
      if (!mockDataKeys.includes(key)) {
        mockDataKeys.push(key)
      }
    }),
    getDataKeys: vi.fn(async (pluginName: string) => {
      return [...mockDataKeys]
    }),
    removeData: vi.fn(async (pluginName: string, key: string) => {
      delete mockStorage[key]
      const index = mockDataKeys.indexOf(key)
      if (index > -1) {
        mockDataKeys.splice(index, 1)
      }
    })
  }
}

// @ts-ignore
globalThis.orca = mockOrca

// 导入被测模块（必须在 mock 之后）
import {
  saveReviewLog,
  getReviewLogs,
  getAllReviewLogs,
  cleanupOldLogs,
  clearAllReviewLogs,
  flushReviewLogs,
  serializeReviewLog,
  deserializeReviewLog,
  createReviewLogId,
  clearLogCache
} from './reviewLogStorage'

const PLUGIN_NAME = 'test-plugin'

// 辅助函数：生成有效的 CardState
const cardStateArbitrary = fc.constantFrom<CardState>('new', 'learning', 'review', 'relearning')

// 辅助函数：生成有效的 Grade
const gradeArbitrary = fc.constantFrom<Grade>('again', 'hard', 'good', 'easy')

// 辅助函数：生成有效的 ReviewLogEntry
const reviewLogEntryArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  cardId: fc.integer({ min: 1, max: 1000000 }),
  deckName: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: fc.integer({ min: 1609459200000, max: 1893456000000 }), // 2021-01-01 to 2030-01-01
  grade: gradeArbitrary,
  duration: fc.integer({ min: 0, max: 300000 }), // 0 to 5 minutes
  previousInterval: fc.integer({ min: 0, max: 365 }),
  newInterval: fc.integer({ min: 0, max: 365 }),
  previousState: cardStateArbitrary,
  newState: cardStateArbitrary
}) as fc.Arbitrary<ReviewLogEntry>

// 清理函数
function clearMockStorage() {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key])
  mockDataKeys.length = 0
  clearLogCache()
}

describe('reviewLogStorage', () => {
  beforeEach(async () => {
    clearMockStorage()
    vi.clearAllMocks()
  })

  describe('serializeReviewLog / deserializeReviewLog', () => {
    /**
     * **Feature: anki-statistics, Property 12: 复习记录往返一致性**
     * **Validates: Requirements 11.2, 11.3**
     * 
     * 对于任意复习记录，序列化后再反序列化应该得到等价的记录对象
     */
    it('Property 12: serialization round-trip should preserve all fields', () => {
      fc.assert(
        fc.property(reviewLogEntryArbitrary, (log) => {
          // 序列化
          const serialized = serializeReviewLog(log)
          
          // 反序列化
          const deserialized = deserializeReviewLog(serialized)
          
          // 验证所有字段都相等
          expect(deserialized.id).toBe(log.id)
          expect(deserialized.cardId).toBe(log.cardId)
          expect(deserialized.deckName).toBe(log.deckName)
          expect(deserialized.timestamp).toBe(log.timestamp)
          expect(deserialized.grade).toBe(log.grade)
          expect(deserialized.duration).toBe(log.duration)
          expect(deserialized.previousInterval).toBe(log.previousInterval)
          expect(deserialized.newInterval).toBe(log.newInterval)
          expect(deserialized.previousState).toBe(log.previousState)
          expect(deserialized.newState).toBe(log.newState)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('createReviewLogId', () => {
    it('should create unique IDs for different timestamp/cardId combinations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000000000000 }),
          fc.integer({ min: 1, max: 1000000 }),
          fc.integer({ min: 1, max: 1000000000000 }),
          fc.integer({ min: 1, max: 1000000 }),
          (timestamp1, cardId1, timestamp2, cardId2) => {
            const id1 = createReviewLogId(timestamp1, cardId1)
            const id2 = createReviewLogId(timestamp2, cardId2)
            
            // 如果 timestamp 和 cardId 都相同，ID 应该相同
            if (timestamp1 === timestamp2 && cardId1 === cardId2) {
              expect(id1).toBe(id2)
            } else {
              // 否则 ID 应该不同
              expect(id1).not.toBe(id2)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('saveReviewLog / getReviewLogs', () => {
    /**
     * **Feature: anki-statistics, Property 12: 复习记录往返一致性（存储层）**
     * **Validates: Requirements 11.2, 11.3**
     * 
     * 对于任意复习记录，保存后再读取应该得到等价的记录
     */
    it('Property 12 (storage): save then get should return equivalent logs', async () => {
      // 生成具有唯一 ID 的日志数组
      const uniqueLogsArbitrary = fc.array(reviewLogEntryArbitrary, { minLength: 1, maxLength: 20 })
        .map(logs => {
          // 为每个日志分配唯一 ID
          return logs.map((log, index) => ({
            ...log,
            id: `${log.timestamp}_${log.cardId}_${index}`
          }))
        })
      
      await fc.assert(
        fc.asyncProperty(
          uniqueLogsArbitrary,
          async (logs) => {
            // 清理存储
            clearMockStorage()
            
            // 保存所有记录
            for (const log of logs) {
              await saveReviewLog(PLUGIN_NAME, log)
            }
            
            // 确保所有记录已写入
            await flushReviewLogs(PLUGIN_NAME)
            
            // 获取所有记录
            const retrieved = await getAllReviewLogs(PLUGIN_NAME)
            
            // 验证数量相等
            expect(retrieved.length).toBe(logs.length)
            
            // 验证每条记录都能找到
            for (const log of logs) {
              const found = retrieved.find(r => r.id === log.id)
              expect(found).toBeDefined()
              if (found) {
                expect(found.cardId).toBe(log.cardId)
                expect(found.deckName).toBe(log.deckName)
                expect(found.timestamp).toBe(log.timestamp)
                expect(found.grade).toBe(log.grade)
                expect(found.duration).toBe(log.duration)
                expect(found.previousInterval).toBe(log.previousInterval)
                expect(found.newInterval).toBe(log.newInterval)
                expect(found.previousState).toBe(log.previousState)
                expect(found.newState).toBe(log.newState)
              }
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should filter logs by date range correctly', async () => {
      clearMockStorage()
      
      // 创建跨越多个月份的记录
      const logs: ReviewLogEntry[] = [
        {
          id: '1',
          cardId: 1,
          deckName: 'test',
          timestamp: new Date('2024-01-15').getTime(),
          grade: 'good',
          duration: 1000,
          previousInterval: 0,
          newInterval: 1,
          previousState: 'new',
          newState: 'learning'
        },
        {
          id: '2',
          cardId: 2,
          deckName: 'test',
          timestamp: new Date('2024-02-15').getTime(),
          grade: 'good',
          duration: 1000,
          previousInterval: 1,
          newInterval: 3,
          previousState: 'learning',
          newState: 'review'
        },
        {
          id: '3',
          cardId: 3,
          deckName: 'test',
          timestamp: new Date('2024-03-15').getTime(),
          grade: 'easy',
          duration: 500,
          previousInterval: 3,
          newInterval: 7,
          previousState: 'review',
          newState: 'review'
        }
      ]
      
      for (const log of logs) {
        await saveReviewLog(PLUGIN_NAME, log)
      }
      await flushReviewLogs(PLUGIN_NAME)
      
      // 查询 2024-02-01 到 2024-02-28 的记录
      const startDate = new Date('2024-02-01')
      const endDate = new Date('2024-02-28')
      const filtered = await getReviewLogs(PLUGIN_NAME, startDate, endDate)
      
      expect(filtered.length).toBe(1)
      expect(filtered[0].id).toBe('2')
    })
  })

  describe('cleanupOldLogs', () => {
    /**
     * **Feature: anki-statistics, Property 13: 旧记录清理正确性**
     * **Validates: Requirements 11.4**
     * 
     * 对于任意复习记录集合和清理日期，清理后应该只保留清理日期之后的记录
     */
    it('Property 13: cleanup should only keep logs after the specified date', async () => {
      // 使用整数时间戳生成有效日期，避免 NaN 日期
      const validDateArbitrary = fc.integer({ 
        min: new Date('2021-01-01').getTime(), 
        max: new Date('2029-12-31').getTime() 
      }).map(ts => new Date(ts))
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(reviewLogEntryArbitrary, { minLength: 1, maxLength: 20 }),
          validDateArbitrary,
          async (logs, cleanupDate) => {
            // 清理存储
            clearMockStorage()
            
            // 保存所有记录
            for (const log of logs) {
              await saveReviewLog(PLUGIN_NAME, log)
            }
            await flushReviewLogs(PLUGIN_NAME)
            
            // 计算预期保留的记录数
            const cleanupTime = cleanupDate.getTime()
            const expectedRemaining = logs.filter(log => log.timestamp >= cleanupTime)
            const expectedCleaned = logs.filter(log => log.timestamp < cleanupTime)
            
            // 执行清理
            const cleanedCount = await cleanupOldLogs(PLUGIN_NAME, cleanupDate)
            
            // 验证清理数量
            expect(cleanedCount).toBe(expectedCleaned.length)
            
            // 获取剩余记录
            const remaining = await getAllReviewLogs(PLUGIN_NAME)
            
            // 验证剩余记录数量
            expect(remaining.length).toBe(expectedRemaining.length)
            
            // 验证所有剩余记录都在清理日期之后
            for (const log of remaining) {
              expect(log.timestamp).toBeGreaterThanOrEqual(cleanupTime)
            }
            
            // 验证预期保留的记录都存在
            for (const expected of expectedRemaining) {
              const found = remaining.find(r => r.id === expected.id)
              expect(found).toBeDefined()
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should handle empty storage gracefully', async () => {
      clearMockStorage()
      
      const cleanedCount = await cleanupOldLogs(PLUGIN_NAME, new Date())
      expect(cleanedCount).toBe(0)
    })

    it('should clean up entire months when all logs are old', async () => {
      clearMockStorage()
      
      // 创建 2023 年的记录
      const oldLog: ReviewLogEntry = {
        id: '1',
        cardId: 1,
        deckName: 'test',
        timestamp: new Date('2023-06-15').getTime(),
        grade: 'good',
        duration: 1000,
        previousInterval: 0,
        newInterval: 1,
        previousState: 'new',
        newState: 'learning'
      }
      
      await saveReviewLog(PLUGIN_NAME, oldLog)
      await flushReviewLogs(PLUGIN_NAME)
      
      // 清理 2024 年之前的记录
      const cleanedCount = await cleanupOldLogs(PLUGIN_NAME, new Date('2024-01-01'))
      
      expect(cleanedCount).toBe(1)
      
      const remaining = await getAllReviewLogs(PLUGIN_NAME)
      expect(remaining.length).toBe(0)
    })
  })

  describe('clearAllReviewLogs', () => {
    it('should remove all logs from storage', async () => {
      clearMockStorage()
      
      // 保存一些记录
      const logs: ReviewLogEntry[] = [
        {
          id: '1',
          cardId: 1,
          deckName: 'test',
          timestamp: new Date('2024-01-15').getTime(),
          grade: 'good',
          duration: 1000,
          previousInterval: 0,
          newInterval: 1,
          previousState: 'new',
          newState: 'learning'
        },
        {
          id: '2',
          cardId: 2,
          deckName: 'test',
          timestamp: new Date('2024-02-15').getTime(),
          grade: 'hard',
          duration: 2000,
          previousInterval: 1,
          newInterval: 1,
          previousState: 'learning',
          newState: 'learning'
        }
      ]
      
      for (const log of logs) {
        await saveReviewLog(PLUGIN_NAME, log)
      }
      await flushReviewLogs(PLUGIN_NAME)
      
      // 验证记录已保存
      let allLogs = await getAllReviewLogs(PLUGIN_NAME)
      expect(allLogs.length).toBe(2)
      
      // 清除所有记录
      await clearAllReviewLogs(PLUGIN_NAME)
      
      // 验证记录已清除
      allLogs = await getAllReviewLogs(PLUGIN_NAME)
      expect(allLogs.length).toBe(0)
    })
  })
})
