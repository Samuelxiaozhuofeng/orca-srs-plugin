import { describe, expect, it } from "vitest"
import type { ReviewCard, ReviewLogEntry } from "./types"
import {
  buildCardKey,
  cardKeyFromReviewCard,
  compatibleCardId,
  identityFieldsForLog,
  identityFromReviewCard,
  isStructuredReviewLog,
  normalizeReviewLogIdentity,
  reviewLogMatchesIdentity
} from "./cardIdentity"

function baseSrs() {
  return {
    stability: 1,
    difficulty: 5,
    interval: 1,
    due: new Date("2026-07-13T00:00:00Z"),
    lastReviewed: new Date("2026-07-12T00:00:00Z"),
    reps: 1,
    lapses: 0
  }
}

function baseCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 100,
    front: "Q",
    back: "A",
    srs: baseSrs(),
    isNew: false,
    deck: "Deck",
    ...overrides
  }
}

function baseLog(overrides: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    id: "1",
    cardId: 100,
    deckName: "Deck",
    timestamp: 1_700_000_000_000,
    grade: "again",
    duration: 1000,
    previousInterval: 1,
    newInterval: 0,
    previousState: "review",
    newState: "relearning",
    ...overrides
  }
}

describe("cardIdentity", () => {
  describe("Basic vs Choice", () => {
    it("Basic 与 Choice 身份不同、cardKey 不同", () => {
      const basic = identityFromReviewCard(baseCard({ cardType: "basic" }))
      const choice = identityFromReviewCard(baseCard({ cardType: "choice" }))

      expect(basic.cardType).toBe("basic")
      expect(choice.cardType).toBe("choice")
      expect(buildCardKey(basic)).toBe("basic:100")
      expect(buildCardKey(choice)).toBe("choice:100")
      expect(buildCardKey(basic)).not.toBe(buildCardKey(choice))
    })
  })

  describe("Cloze / Direction / List 变体", () => {
    it("同父块 Cloze c1/c2 的 cardKey 不同", () => {
      const c1 = identityFromReviewCard(
        baseCard({ cardType: "cloze", clozeNumber: 1 })
      )
      const c2 = identityFromReviewCard(
        baseCard({ cardType: "cloze", clozeNumber: 2 })
      )
      expect(buildCardKey(c1)).toBe("cloze:100:c1")
      expect(buildCardKey(c2)).toBe("cloze:100:c2")
      expect(buildCardKey(c1)).not.toBe(buildCardKey(c2))
    })

    it("Direction forward/backward 精确区分", () => {
      const fwd = identityFromReviewCard(
        baseCard({ cardType: "direction", directionType: "forward" })
      )
      const bwd = identityFromReviewCard(
        baseCard({ cardType: "direction", directionType: "backward" })
      )
      expect(buildCardKey(fwd)).toBe("direction:100:forward")
      expect(buildCardKey(bwd)).toBe("direction:100:backward")
      expect(buildCardKey(fwd)).not.toBe(buildCardKey(bwd))
    })

    it("List 不同 listItemId 精确区分", () => {
      const itemA = identityFromReviewCard(
        baseCard({ cardType: "list", listItemId: 201, listItemIndex: 1, listItemIds: [201, 202] })
      )
      const itemB = identityFromReviewCard(
        baseCard({ cardType: "list", listItemId: 202, listItemIndex: 2, listItemIds: [201, 202] })
      )
      expect(buildCardKey(itemA)).toBe("list:100:item:201")
      expect(buildCardKey(itemB)).toBe("list:100:item:202")
      expect(buildCardKey(itemA)).not.toBe(buildCardKey(itemB))
    })
  })

  describe("ReviewCard → identity → cardKey 稳定", () => {
    it("同一 ReviewCard 多次生成相同 cardKey", () => {
      const card = baseCard({ cardType: "cloze", clozeNumber: 3 })
      expect(cardKeyFromReviewCard(card)).toBe(cardKeyFromReviewCard(card))
      expect(cardKeyFromReviewCard(card)).toBe("cloze:100:c3")
    })

    it("compatibleCardId：List 用 listItemId，其余用父 blockId", () => {
      const list = identityFromReviewCard(
        baseCard({ cardType: "list", listItemId: 55, listItemIndex: 1, listItemIds: [55] })
      )
      const cloze = identityFromReviewCard(
        baseCard({ cardType: "cloze", clozeNumber: 1 })
      )
      expect(compatibleCardId(list)).toBe(55)
      expect(compatibleCardId(cloze)).toBe(100)
    })

    it("identityFieldsForLog 写入完整结构化字段且非 legacy", () => {
      const identity = identityFromReviewCard(
        baseCard({ cardType: "direction", directionType: "forward" })
      )
      const fields = identityFieldsForLog(identity)
      expect(fields).toEqual({
        blockId: 100,
        cardType: "direction",
        cardKey: "direction:100:forward",
        clozeNumber: undefined,
        directionType: "forward",
        listItemId: undefined,
        legacy: false
      })
    })
  })

  describe("日志匹配", () => {
    it("新日志按 cardKey 精确匹配：c1 Again 不匹配 c2", () => {
      const c1 = identityFromReviewCard(baseCard({ cardType: "cloze", clozeNumber: 1 }))
      const c2 = identityFromReviewCard(baseCard({ cardType: "cloze", clozeNumber: 2 }))
      const logC1 = baseLog({
        cardId: 100,
        blockId: 100,
        cardType: "cloze",
        cardKey: "cloze:100:c1",
        clozeNumber: 1,
        legacy: false,
        grade: "again"
      })

      expect(reviewLogMatchesIdentity(logC1, c1)).toBe(true)
      expect(reviewLogMatchesIdentity(logC1, c2)).toBe(false)
    })

    it("Direction / List 新日志精确匹配", () => {
      const fwd = identityFromReviewCard(
        baseCard({ cardType: "direction", directionType: "forward" })
      )
      const bwd = identityFromReviewCard(
        baseCard({ cardType: "direction", directionType: "backward" })
      )
      const item1 = identityFromReviewCard(
        baseCard({ cardType: "list", listItemId: 11, listItemIndex: 1, listItemIds: [11, 12] })
      )
      const item2 = identityFromReviewCard(
        baseCard({ cardType: "list", listItemId: 12, listItemIndex: 2, listItemIds: [11, 12] })
      )

      const logFwd = baseLog({
        cardId: 100,
        blockId: 100,
        cardType: "direction",
        cardKey: "direction:100:forward",
        directionType: "forward",
        legacy: false
      })
      const logItem1 = baseLog({
        cardId: 11,
        blockId: 100,
        cardType: "list",
        cardKey: "list:100:item:11",
        listItemId: 11,
        legacy: false
      })

      expect(reviewLogMatchesIdentity(logFwd, fwd)).toBe(true)
      expect(reviewLogMatchesIdentity(logFwd, bwd)).toBe(false)
      expect(reviewLogMatchesIdentity(logItem1, item1)).toBe(true)
      expect(reviewLogMatchesIdentity(logItem1, item2)).toBe(false)
    })

    it("legacy 日志按父 blockId 兼容匹配，且保留 legacy 标记", () => {
      const c1 = identityFromReviewCard(baseCard({ cardType: "cloze", clozeNumber: 1 }))
      const c2 = identityFromReviewCard(baseCard({ cardType: "cloze", clozeNumber: 2 }))
      const legacy = normalizeReviewLogIdentity(baseLog({ cardId: 100 }))

      expect(legacy.legacy).toBe(true)
      expect(isStructuredReviewLog(legacy)).toBe(false)
      // 旧日志无法区分变体：同父块均匹配
      expect(reviewLogMatchesIdentity(legacy, c1)).toBe(true)
      expect(reviewLogMatchesIdentity(legacy, c2)).toBe(true)
    })
  })

  describe("normalizeReviewLogIdentity", () => {
    it("缺字段旧日志不报错并标记 legacy", () => {
      const raw = baseLog({ cardId: 42 })
      const normalized = normalizeReviewLogIdentity(raw)
      expect(normalized.legacy).toBe(true)
      expect(normalized.blockId).toBe(42)
      expect(normalized.cardKey).toBe("legacy:42")
    })

    it("完整结构化日志不标记 legacy", () => {
      const structured = baseLog({
        cardId: 100,
        blockId: 100,
        cardType: "basic",
        cardKey: "basic:100",
        legacy: false
      })
      const normalized = normalizeReviewLogIdentity(structured)
      expect(normalized.legacy).toBe(false)
      expect(isStructuredReviewLog(normalized)).toBe(true)
    })
  })
})
