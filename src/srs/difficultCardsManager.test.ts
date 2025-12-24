/**
 * 困难卡片管理器测试
 */

import { describe, it, expect } from "vitest"
import type { ReviewCard, ReviewLogEntry } from "./types"

// 模拟数据
const mockCards: ReviewCard[] = [
  {
    id: 1,
    front: "问题1",
    back: "答案1",
    deck: "测试牌组",
    isNew: false,
    srs: {
      stability: 5,
      difficulty: 8.5,  // 高难度
      interval: 7,
      due: new Date(),
      lastReviewed: new Date(),
      reps: 10,
      lapses: 5,  // 高遗忘次数
      state: 2
    }
  },
  {
    id: 2,
    front: "问题2",
    back: "答案2",
    deck: "测试牌组",
    isNew: false,
    srs: {
      stability: 10,
      difficulty: 3,  // 低难度
      interval: 30,
      due: new Date(),
      lastReviewed: new Date(),
      reps: 20,
      lapses: 1,  // 低遗忘次数
      state: 2
    }
  },
  {
    id: 3,
    front: "问题3",
    back: "答案3",
    deck: "测试牌组",
    isNew: true,  // 新卡
    srs: {
      stability: 0,
      difficulty: 5,
      interval: 0,
      due: new Date(),
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0
    }
  }
]

const mockLogs: ReviewLogEntry[] = [
  // 卡片1的复习记录 - 频繁 Again
  { id: "1_1", cardId: 1, deckName: "测试牌组", timestamp: Date.now() - 1000, grade: "again", duration: 5000, previousInterval: 7, newInterval: 1, previousState: "review", newState: "relearning" },
  { id: "1_2", cardId: 1, deckName: "测试牌组", timestamp: Date.now() - 2000, grade: "again", duration: 4000, previousInterval: 5, newInterval: 7, previousState: "review", newState: "relearning" },
  { id: "1_3", cardId: 1, deckName: "测试牌组", timestamp: Date.now() - 3000, grade: "again", duration: 6000, previousInterval: 3, newInterval: 5, previousState: "review", newState: "relearning" },
  { id: "1_4", cardId: 1, deckName: "测试牌组", timestamp: Date.now() - 4000, grade: "good", duration: 3000, previousInterval: 2, newInterval: 3, previousState: "review", newState: "review" },
  // 卡片2的复习记录 - 正常
  { id: "2_1", cardId: 2, deckName: "测试牌组", timestamp: Date.now() - 1000, grade: "good", duration: 2000, previousInterval: 20, newInterval: 30, previousState: "review", newState: "review" },
  { id: "2_2", cardId: 2, deckName: "测试牌组", timestamp: Date.now() - 2000, grade: "easy", duration: 1500, previousInterval: 15, newInterval: 20, previousState: "review", newState: "review" },
]

describe("困难卡片管理器", () => {
  describe("困难卡片判定", () => {
    it("应该识别高难度卡片", () => {
      const card = mockCards[0]
      // 难度 8.5 >= 7，应该被识别为困难卡片
      expect(card.srs.difficulty).toBeGreaterThanOrEqual(7)
    })

    it("应该识别高遗忘次数卡片", () => {
      const card = mockCards[0]
      // lapses 5 >= 3，应该被识别为困难卡片
      expect(card.srs.lapses).toBeGreaterThanOrEqual(3)
    })

    it("不应该将新卡识别为困难卡片", () => {
      const card = mockCards[2]
      expect(card.isNew).toBe(true)
    })

    it("不应该将正常卡片识别为困难卡片", () => {
      const card = mockCards[1]
      expect(card.srs.difficulty).toBeLessThan(7)
      expect(card.srs.lapses).toBeLessThan(3)
    })
  })

  describe("复习记录分析", () => {
    it("应该正确统计 Again 次数", () => {
      const card1Logs = mockLogs.filter(log => log.cardId === 1)
      const againCount = card1Logs.filter(log => log.grade === "again").length
      expect(againCount).toBe(3)
    })

    it("应该正确统计正常卡片的 Again 次数", () => {
      const card2Logs = mockLogs.filter(log => log.cardId === 2)
      const againCount = card2Logs.filter(log => log.grade === "again").length
      expect(againCount).toBe(0)
    })
  })

  describe("困难原因文本", () => {
    it("应该返回正确的困难原因文本", () => {
      const reasons = {
        "high_again_rate": "频繁遗忘",
        "high_lapses": "遗忘次数多",
        "high_difficulty": "难度较高",
        "multiple": "多重困难"
      }
      
      expect(reasons["high_again_rate"]).toBe("频繁遗忘")
      expect(reasons["high_lapses"]).toBe("遗忘次数多")
      expect(reasons["high_difficulty"]).toBe("难度较高")
      expect(reasons["multiple"]).toBe("多重困难")
    })
  })
})
