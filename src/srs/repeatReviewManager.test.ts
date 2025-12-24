/**
 * 重复复习会话管理器属性测试
 * 
 * 使用 fast-check 进行属性测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import type { DbId } from '../orca.d.ts'
import type { ReviewCard, SrsState } from './types'
import {
  createRepeatReviewSession,
  resetCurrentRound,
  getRepeatReviewSession,
  clearRepeatReviewSession,
  hasActiveRepeatSession
} from './repeatReviewManager'

/**
 * 生成随机 SrsState 的 fast-check arbitrary
 */
const srsStateArbitrary: fc.Arbitrary<SrsState> = fc.record({
  stability: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
  difficulty: fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }),
  interval: fc.integer({ min: 1, max: 365 }),
  due: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  lastReviewed: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
  reps: fc.integer({ min: 0, max: 100 }),
  lapses: fc.integer({ min: 0, max: 50 }),
  resets: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined })
})

/**
 * 生成随机 ReviewCard 的 fast-check arbitrary
 */
const reviewCardArbitrary: fc.Arbitrary<ReviewCard> = fc.record({
  id: fc.integer({ min: 1, max: 10000 }) as fc.Arbitrary<DbId>,
  front: fc.string({ minLength: 1, maxLength: 200 }),
  back: fc.string({ minLength: 0, maxLength: 200 }),
  srs: srsStateArbitrary,
  isNew: fc.boolean(),
  deck: fc.string({ minLength: 1, maxLength: 50 }),
  clozeNumber: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  directionType: fc.option(fc.constantFrom('forward' as const, 'backward' as const), { nil: undefined }),
  tags: fc.option(fc.array(fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    blockId: fc.integer({ min: 1, max: 10000 }) as fc.Arbitrary<DbId>
  }), { minLength: 0, maxLength: 5 }), { nil: undefined })
})

/**
 * 生成随机卡片数组的 fast-check arbitrary
 */
const reviewCardsArbitrary = fc.array(reviewCardArbitrary, { minLength: 1, maxLength: 20 })

/**
 * 生成随机来源类型的 fast-check arbitrary
 */
const sourceTypeArbitrary = fc.constantFrom('query' as const, 'children' as const)

describe('repeatReviewManager', () => {
  beforeEach(() => {
    // 每个测试前清除会话
    clearRepeatReviewSession()
  })

  describe('createRepeatReviewSession', () => {
    it('should create a session with correct initial values', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Question',
        back: 'Answer',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      const session = createRepeatReviewSession(cards, 100 as DbId, 'query')
      
      expect(session.cards.length).toBe(1)
      expect(session.originalCards.length).toBe(1)
      expect(session.currentRound).toBe(1)
      expect(session.totalRounds).toBe(1)
      expect(session.isRepeatMode).toBe(true)
      expect(session.sourceBlockId).toBe(100)
      expect(session.sourceType).toBe('query')
    })

    it('should set the session as current session', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Q',
        back: 'A',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      createRepeatReviewSession(cards, 100 as DbId, 'children')
      
      expect(hasActiveRepeatSession()).toBe(true)
      expect(getRepeatReviewSession()).not.toBeNull()
    })
  })

  describe('resetCurrentRound', () => {
    /**
     * Property 4: 重复复习队列重置
     * 
     * **Feature: context-menu-review, Property 4: 重复复习队列重置**
     * **Validates: Requirements 3.2**
     * 
     * 对于任意重复复习会话，重置后的卡片队列应该与原始卡片队列相同
     */
    it('Property 4: resetCurrentRound should restore cards to original state', async () => {
      await fc.assert(
        fc.asyncProperty(
          reviewCardsArbitrary,
          fc.integer({ min: 1, max: 10000 }) as fc.Arbitrary<DbId>,
          sourceTypeArbitrary,
          async (cards, sourceBlockId, sourceType) => {
            // 清除之前的会话
            clearRepeatReviewSession()
            
            // 创建会话
            const session = createRepeatReviewSession(cards, sourceBlockId, sourceType)
            
            // 模拟修改当前卡片队列（如同用户复习过程中的变化）
            if (session.cards.length > 0) {
              session.cards.pop() // 移除一张卡片
            }
            
            // 重置轮次
            const resetSession = resetCurrentRound(session)
            
            // 验证：重置后的卡片数量应该与原始卡片数量相同
            expect(resetSession.cards.length).toBe(cards.length)
            
            // 验证：重置后的每张卡片 ID 应该与原始卡片 ID 相同
            for (let i = 0; i < cards.length; i++) {
              expect(resetSession.cards[i].id).toBe(cards[i].id)
              expect(resetSession.cards[i].front).toBe(cards[i].front)
              expect(resetSession.cards[i].back).toBe(cards[i].back)
              expect(resetSession.cards[i].deck).toBe(cards[i].deck)
            }
            
            // 验证：轮次计数应该增加
            expect(resetSession.currentRound).toBe(session.currentRound + 1)
            expect(resetSession.totalRounds).toBe(session.totalRounds + 1)
            
            // 验证：原始卡片列表应该保持不变
            expect(resetSession.originalCards.length).toBe(cards.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should increment round counters', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Q',
        back: 'A',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      const session = createRepeatReviewSession(cards, 100 as DbId, 'query')
      expect(session.currentRound).toBe(1)
      expect(session.totalRounds).toBe(1)
      
      const reset1 = resetCurrentRound(session)
      expect(reset1.currentRound).toBe(2)
      expect(reset1.totalRounds).toBe(2)
      
      const reset2 = resetCurrentRound(reset1)
      expect(reset2.currentRound).toBe(3)
      expect(reset2.totalRounds).toBe(3)
    })

    it('should create independent copies of cards', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Q',
        back: 'A',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      const session = createRepeatReviewSession(cards, 100 as DbId, 'query')
      
      // 修改当前卡片
      session.cards[0].front = 'Modified'
      
      // 重置
      const resetSession = resetCurrentRound(session)
      
      // 验证：重置后的卡片应该是原始值，不受修改影响
      expect(resetSession.cards[0].front).toBe('Q')
    })
  })

  describe('getRepeatReviewSession', () => {
    it('should return null when no session exists', () => {
      expect(getRepeatReviewSession()).toBeNull()
    })

    it('should return current session when exists', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Q',
        back: 'A',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      const created = createRepeatReviewSession(cards, 100 as DbId, 'query')
      const retrieved = getRepeatReviewSession()
      
      expect(retrieved).toBe(created)
    })
  })

  describe('clearRepeatReviewSession', () => {
    it('should clear the current session', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Q',
        back: 'A',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      createRepeatReviewSession(cards, 100 as DbId, 'query')
      expect(hasActiveRepeatSession()).toBe(true)
      
      clearRepeatReviewSession()
      expect(hasActiveRepeatSession()).toBe(false)
      expect(getRepeatReviewSession()).toBeNull()
    })
  })

  describe('hasActiveRepeatSession', () => {
    it('should return false when no session exists', () => {
      expect(hasActiveRepeatSession()).toBe(false)
    })

    it('should return true when session exists', () => {
      const cards: ReviewCard[] = [{
        id: 1 as DbId,
        front: 'Q',
        back: 'A',
        srs: {
          stability: 1,
          difficulty: 5,
          interval: 1,
          due: new Date(),
          lastReviewed: null,
          reps: 0,
          lapses: 0
        },
        isNew: true,
        deck: 'default'
      }]
      
      createRepeatReviewSession(cards, 100 as DbId, 'query')
      expect(hasActiveRepeatSession()).toBe(true)
    })
  })
})
