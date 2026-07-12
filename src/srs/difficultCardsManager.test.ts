/**
 * 困难卡片管理器测试
 * FC-05：验证真实身份匹配，不再把 c1 的 Again 计入 c2
 */

import { describe, it, expect } from "vitest"
import type { ReviewCard, ReviewLogEntry } from "./types"
import {
  analyzeRecentReviews,
  getDifficultReasonText
} from "./difficultCardsManager"
import {
  identityFromReviewCard,
  normalizeReviewLogIdentity
} from "./cardIdentity"

// 模拟数据
const mockCards: ReviewCard[] = [
  {
    id: 1,
    front: "问题1",
    back: "答案1",
    deck: "测试牌组",
    cardType: "basic",
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
    cardType: "basic",
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
    cardType: "basic",
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
  { id: "1_1", cardId: 1, blockId: 1, cardType: "basic", cardKey: "basic:1", legacy: false, deckName: "测试牌组", timestamp: Date.now() - 1000, grade: "again", duration: 5000, previousInterval: 7, newInterval: 1, previousState: "review", newState: "relearning" },
  { id: "1_2", cardId: 1, blockId: 1, cardType: "basic", cardKey: "basic:1", legacy: false, deckName: "测试牌组", timestamp: Date.now() - 2000, grade: "again", duration: 4000, previousInterval: 5, newInterval: 7, previousState: "review", newState: "relearning" },
  { id: "1_3", cardId: 1, blockId: 1, cardType: "basic", cardKey: "basic:1", legacy: false, deckName: "测试牌组", timestamp: Date.now() - 3000, grade: "again", duration: 6000, previousInterval: 3, newInterval: 5, previousState: "review", newState: "relearning" },
  { id: "1_4", cardId: 1, blockId: 1, cardType: "basic", cardKey: "basic:1", legacy: false, deckName: "测试牌组", timestamp: Date.now() - 4000, grade: "good", duration: 3000, previousInterval: 2, newInterval: 3, previousState: "review", newState: "review" },
  // 卡片2的复习记录 - 正常
  { id: "2_1", cardId: 2, blockId: 2, cardType: "basic", cardKey: "basic:2", legacy: false, deckName: "测试牌组", timestamp: Date.now() - 1000, grade: "good", duration: 2000, previousInterval: 20, newInterval: 30, previousState: "review", newState: "review" },
  { id: "2_2", cardId: 2, blockId: 2, cardType: "basic", cardKey: "basic:2", legacy: false, deckName: "测试牌组", timestamp: Date.now() - 2000, grade: "easy", duration: 1500, previousInterval: 15, newInterval: 20, previousState: "review", newState: "review" },
]

function structuredLog(
  partial: Partial<ReviewLogEntry> & Pick<ReviewLogEntry, "cardId" | "cardKey" | "cardType" | "blockId" | "grade" | "timestamp">
): ReviewLogEntry {
  return {
    id: `${partial.timestamp}_${partial.cardKey}`,
    deckName: "Deck",
    duration: 1000,
    previousInterval: 1,
    newInterval: 1,
    previousState: "review",
    newState: partial.grade === "again" ? "relearning" : "review",
    legacy: false,
    ...partial
  }
}

describe("困难卡片管理器", () => {
  describe("困难卡片判定", () => {
    it("应该识别高难度卡片", () => {
      const card = mockCards[0]
      expect(card.srs.difficulty).toBeGreaterThanOrEqual(7)
    })

    it("应该识别高遗忘次数卡片", () => {
      const card = mockCards[0]
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

  describe("复习记录分析（真实 analyzeRecentReviews）", () => {
    it("应该正确统计 Again 次数", () => {
      const identity = identityFromReviewCard(mockCards[0])
      const { recentAgainCount } = analyzeRecentReviews(identity, mockLogs)
      expect(recentAgainCount).toBe(3)
    })

    it("应该正确统计正常卡片的 Again 次数", () => {
      const identity = identityFromReviewCard(mockCards[1])
      const { recentAgainCount } = analyzeRecentReviews(identity, mockLogs)
      expect(recentAgainCount).toBe(0)
    })

    it("c1 的 Again 不会计入 c2（精确身份匹配）", () => {
      const parentId = 500
      const c1 = identityFromReviewCard({
        id: parentId,
        front: "cloze",
        back: "",
        deck: "Deck",
        isNew: false,
        cardType: "cloze",
        clozeNumber: 1,
        srs: mockCards[0].srs
      })
      const c2 = identityFromReviewCard({
        id: parentId,
        front: "cloze",
        back: "",
        deck: "Deck",
        isNew: false,
        cardType: "cloze",
        clozeNumber: 2,
        srs: mockCards[1].srs
      })

      const now = Date.now()
      const logs: ReviewLogEntry[] = [
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "cloze",
          cardKey: "cloze:500:c1",
          clozeNumber: 1,
          grade: "again",
          timestamp: now - 1000
        }),
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "cloze",
          cardKey: "cloze:500:c1",
          clozeNumber: 1,
          grade: "again",
          timestamp: now - 2000
        }),
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "cloze",
          cardKey: "cloze:500:c1",
          clozeNumber: 1,
          grade: "again",
          timestamp: now - 3000
        }),
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "cloze",
          cardKey: "cloze:500:c2",
          clozeNumber: 2,
          grade: "good",
          timestamp: now - 1500
        })
      ]

      expect(analyzeRecentReviews(c1, logs).recentAgainCount).toBe(3)
      expect(analyzeRecentReviews(c2, logs).recentAgainCount).toBe(0)
    })

    it("Direction forward 的 Again 不计入 backward", () => {
      const parentId = 600
      const fwd = identityFromReviewCard({
        id: parentId,
        front: "L",
        back: "R",
        deck: "Deck",
        isNew: false,
        cardType: "direction",
        directionType: "forward",
        srs: mockCards[0].srs
      })
      const bwd = identityFromReviewCard({
        id: parentId,
        front: "R",
        back: "L",
        deck: "Deck",
        isNew: false,
        cardType: "direction",
        directionType: "backward",
        srs: mockCards[1].srs
      })

      const now = Date.now()
      const logs: ReviewLogEntry[] = [
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "direction",
          cardKey: "direction:600:forward",
          directionType: "forward",
          grade: "again",
          timestamp: now - 1
        }),
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "direction",
          cardKey: "direction:600:forward",
          directionType: "forward",
          grade: "again",
          timestamp: now - 2
        }),
        structuredLog({
          cardId: parentId,
          blockId: parentId,
          cardType: "direction",
          cardKey: "direction:600:forward",
          directionType: "forward",
          grade: "again",
          timestamp: now - 3
        })
      ]

      expect(analyzeRecentReviews(fwd, logs).recentAgainCount).toBe(3)
      expect(analyzeRecentReviews(bwd, logs).recentAgainCount).toBe(0)
    })

    it("List 不同 listItemId 日志互不串号", () => {
      const parentId = 700
      const item1 = identityFromReviewCard({
        id: parentId,
        front: "list",
        back: "",
        deck: "Deck",
        isNew: false,
        cardType: "list",
        listItemId: 701,
        listItemIndex: 1,
        listItemIds: [701, 702],
        srs: mockCards[0].srs
      })
      const item2 = identityFromReviewCard({
        id: parentId,
        front: "list",
        back: "",
        deck: "Deck",
        isNew: false,
        cardType: "list",
        listItemId: 702,
        listItemIndex: 2,
        listItemIds: [701, 702],
        srs: mockCards[1].srs
      })

      const now = Date.now()
      const logs: ReviewLogEntry[] = [
        structuredLog({
          cardId: 701,
          blockId: parentId,
          cardType: "list",
          cardKey: "list:700:item:701",
          listItemId: 701,
          grade: "again",
          timestamp: now - 1
        }),
        structuredLog({
          cardId: 701,
          blockId: parentId,
          cardType: "list",
          cardKey: "list:700:item:701",
          listItemId: 701,
          grade: "again",
          timestamp: now - 2
        }),
        structuredLog({
          cardId: 701,
          blockId: parentId,
          cardType: "list",
          cardKey: "list:700:item:701",
          listItemId: 701,
          grade: "again",
          timestamp: now - 3
        }),
        structuredLog({
          cardId: 702,
          blockId: parentId,
          cardType: "list",
          cardKey: "list:700:item:702",
          listItemId: 702,
          grade: "good",
          timestamp: now - 4
        })
      ]

      expect(analyzeRecentReviews(item1, logs).recentAgainCount).toBe(3)
      expect(analyzeRecentReviews(item2, logs).recentAgainCount).toBe(0)
    })

    it("legacy 旧日志按父块兼容匹配（无法区分变体）", () => {
      const parentId = 800
      const c1 = identityFromReviewCard({
        id: parentId,
        front: "c",
        back: "",
        deck: "Deck",
        isNew: false,
        cardType: "cloze",
        clozeNumber: 1,
        srs: mockCards[0].srs
      })
      const c2 = identityFromReviewCard({
        id: parentId,
        front: "c",
        back: "",
        deck: "Deck",
        isNew: false,
        cardType: "cloze",
        clozeNumber: 2,
        srs: mockCards[1].srs
      })

      const legacyLogs = [
        normalizeReviewLogIdentity({
          id: "legacy_1",
          cardId: parentId,
          deckName: "Deck",
          timestamp: Date.now() - 1,
          grade: "again",
          duration: 1,
          previousInterval: 1,
          newInterval: 0,
          previousState: "review",
          newState: "relearning"
        }),
        normalizeReviewLogIdentity({
          id: "legacy_2",
          cardId: parentId,
          deckName: "Deck",
          timestamp: Date.now() - 2,
          grade: "again",
          duration: 1,
          previousInterval: 1,
          newInterval: 0,
          previousState: "review",
          newState: "relearning"
        }),
        normalizeReviewLogIdentity({
          id: "legacy_3",
          cardId: parentId,
          deckName: "Deck",
          timestamp: Date.now() - 3,
          grade: "again",
          duration: 1,
          previousInterval: 1,
          newInterval: 0,
          previousState: "review",
          newState: "relearning"
        })
      ]

      // 旧日志无法区分 c1/c2，两边都会看到 3 次 Again
      expect(analyzeRecentReviews(c1, legacyLogs).recentAgainCount).toBe(3)
      expect(analyzeRecentReviews(c2, legacyLogs).recentAgainCount).toBe(3)
    })
  })

  describe("困难原因文本", () => {
    it("应该返回正确的困难原因文本", () => {
      expect(getDifficultReasonText("high_again_rate")).toBe("频繁遗忘")
      expect(getDifficultReasonText("high_lapses")).toBe("遗忘次数多")
      expect(getDifficultReasonText("high_difficulty")).toBe("难度较高")
      expect(getDifficultReasonText("multiple")).toBe("多重困难")
    })
  })
})
