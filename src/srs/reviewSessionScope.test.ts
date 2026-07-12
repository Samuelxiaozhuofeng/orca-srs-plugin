import { describe, expect, it } from "vitest"
import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  allowsFullLibraryDynamicScan,
  createAllScope,
  createDeckScope,
  createFixedScope,
  createScopeFromDeckFilter,
  filterCardsBySessionScope,
  FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE,
  isCardInSessionScope,
  prepareFixedSessionScope,
  prepareNormalSessionQueueInput,
  selectNewDueCardsForSession,
  selectPendingDueCardsForRequeue
} from "./reviewSessionScope"
import { createSessionRootCardBudget } from "./reviewSessionBudget"

function baseSrs(overrides: Partial<ReviewCard["srs"]> = {}) {
  return {
    stability: 1,
    difficulty: 5,
    interval: 1,
    due: new Date("2026-07-13T00:00:00Z"),
    lastReviewed: new Date("2026-07-12T00:00:00Z"),
    reps: 1,
    lapses: 0,
    ...overrides
  }
}

function card(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 1,
    front: "Q",
    back: "A",
    srs: baseSrs(),
    isNew: false,
    deck: "A",
    ...overrides
  }
}

describe("reviewSessionScope", () => {
  describe("deck vs all filtering", () => {
    const deckA = card({ id: 10, deck: "A", cardType: "basic" })
    const deckB = card({ id: 20, deck: "B", cardType: "basic" })
    const candidates = [deckA, deckB]

    it("deck A scope 对 A/B 候选只保留 A", () => {
      const scope = createDeckScope("A")
      const filtered = filterCardsBySessionScope(candidates, scope)
      expect(filtered).toEqual([deckA])
      expect(isCardInSessionScope(deckA, scope)).toBe(true)
      expect(isCardInSessionScope(deckB, scope)).toBe(false)
    })

    it("all scope 同时保留 A/B", () => {
      const scope = createAllScope()
      const filtered = filterCardsBySessionScope(candidates, scope)
      expect(filtered).toEqual([deckA, deckB])
      expect(allowsFullLibraryDynamicScan(scope)).toBe(true)
    })
  })

  describe("scope immutability / freeze at creation", () => {
    it("创建 deck A scope 后，后续再创建 deck B 或改变外部字符串不改变 A scope", () => {
      let mutableFilter = "A"
      const scopeA = createScopeFromDeckFilter(mutableFilter)
      mutableFilter = "B"
      const scopeB = createScopeFromDeckFilter(mutableFilter)

      expect(scopeA.kind).toBe("deck")
      if (scopeA.kind === "deck") {
        expect(scopeA.deckName).toBe("A")
      }
      expect(scopeB.kind).toBe("deck")
      if (scopeB.kind === "deck") {
        expect(scopeB.deckName).toBe("B")
      }

      const cardA = card({ id: 1, deck: "A" })
      const cardB = card({ id: 2, deck: "B" })
      expect(isCardInSessionScope(cardA, scopeA)).toBe(true)
      expect(isCardInSessionScope(cardB, scopeA)).toBe(false)
      expect(isCardInSessionScope(cardB, scopeB)).toBe(true)

      // 冻结：不能改写 deckName
      if (scopeA.kind === "deck") {
        expect(() => {
          // @ts-expect-error 验证运行时冻结
          scopeA.deckName = "B"
        }).toThrow()
        expect(scopeA.deckName).toBe("A")
      }
    })

    it("null/空 deck filter → all scope", () => {
      expect(createScopeFromDeckFilter(null).kind).toBe("all")
      expect(createScopeFromDeckFilter(undefined).kind).toBe("all")
      expect(createScopeFromDeckFilter("").kind).toBe("all")
    })
  })

  describe("fixed scope", () => {
    it("只允许固定 cardKey；禁止全库动态扫描", () => {
      const fixedCard = card({
        id: 100,
        deck: "A",
        cardType: "basic"
      })
      const other = card({ id: 200, deck: "A", cardType: "basic" })
      const scope = createFixedScope([fixedCard])

      expect(allowsFullLibraryDynamicScan(scope)).toBe(false)
      expect(isCardInSessionScope(fixedCard, scope)).toBe(true)
      expect(isCardInSessionScope(other, scope)).toBe(false)
      expect(scope.cardKeys).toContain(cardKeyFromReviewCard(fixedCard))
      expect(FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE).toContain("固定")
    })

    it("fixed List 根卡允许同一 root 的后续 listItemId / 辅助变体，不允许其他根卡", () => {
      const listRoot1Item1 = card({
        id: 500,
        deck: "A",
        cardType: "list",
        listItemId: 501,
        listItemIndex: 1,
        listItemIds: [501, 502]
      })
      const scope = createFixedScope([listRoot1Item1])

      const nextItemSameRoot = card({
        id: 500,
        deck: "A",
        cardType: "list",
        listItemId: 502,
        listItemIndex: 2,
        listItemIds: [501, 502]
      })
      const auxPreviewSameRoot = card({
        id: 500,
        deck: "A",
        cardType: "list",
        listItemId: 502,
        listItemIndex: 2,
        listItemIds: [501, 502],
        isAuxiliaryPreview: true
      })
      const otherRoot = card({
        id: 600,
        deck: "A",
        cardType: "list",
        listItemId: 601,
        listItemIndex: 1,
        listItemIds: [601]
      })

      expect(isCardInSessionScope(listRoot1Item1, scope)).toBe(true)
      expect(isCardInSessionScope(nextItemSameRoot, scope)).toBe(true)
      expect(isCardInSessionScope(auxPreviewSameRoot, scope)).toBe(true)
      expect(isCardInSessionScope(otherRoot, scope)).toBe(false)
      expect(scope.fixedRootIds).toContain("500")
      expect(scope.fixedRootIds).not.toContain("600")
    })

    it("Cloze/Direction 不因同 blockId 串入未固定的其他变体", () => {
      const clozeC1 = card({
        id: 100,
        deck: "A",
        cardType: "cloze",
        clozeNumber: 1
      })
      const clozeC2 = card({
        id: 100,
        deck: "A",
        cardType: "cloze",
        clozeNumber: 2
      })
      const dirFwd = card({
        id: 200,
        deck: "A",
        cardType: "direction",
        directionType: "forward"
      })
      const dirBwd = card({
        id: 200,
        deck: "A",
        cardType: "direction",
        directionType: "backward"
      })

      const scope = createFixedScope([clozeC1, dirFwd])

      expect(isCardInSessionScope(clozeC1, scope)).toBe(true)
      expect(isCardInSessionScope(clozeC2, scope)).toBe(false)
      expect(isCardInSessionScope(dirFwd, scope)).toBe(true)
      expect(isCardInSessionScope(dirBwd, scope)).toBe(false)

      // fixedRootIds 仅给 List，不得把 cloze/direction 当 root 放开
      expect(scope.fixedRootIds).toEqual([])
    })

    it("展开后的子卡纳入 fixed cardKeys", () => {
      const root = card({ id: 1, cardType: "basic" })
      const child = card({ id: 2, cardType: "basic" })
      const scope = prepareFixedSessionScope([root, child])
      expect(isCardInSessionScope(root, scope)).toBe(true)
      expect(isCardInSessionScope(child, scope)).toBe(true)
    })
  })

  describe("pending due helper", () => {
    it("scope 外卡不重新入队", () => {
      const inDeck = card({ id: 1, deck: "A" })
      const outDeck = card({ id: 2, deck: "B" })
      const scope = createDeckScope("A")

      const requeued = selectPendingDueCardsForRequeue([inDeck, outDeck], scope)
      expect(requeued).toEqual([inDeck])
    })

    it("fixed scope 外卡不重新入队；集合内可入队", () => {
      const fixed = card({ id: 10, cardType: "basic" })
      const outsider = card({ id: 11, cardType: "basic" })
      const scope = createFixedScope([fixed])
      expect(selectPendingDueCardsForRequeue([fixed, outsider], scope)).toEqual([
        fixed
      ])
    })
  })

  describe("auto/manual 共用 selectNewDueCardsForSession", () => {
    it("deck scope：只追加本牌组且不在队列中的卡", () => {
      const existing = card({ id: 1, deck: "A", cardType: "basic" })
      const newInDeck = card({ id: 2, deck: "A", cardType: "basic" })
      const newOtherDeck = card({ id: 3, deck: "B", cardType: "basic" })
      const scope = createDeckScope("A")

      // 模拟自动刷新与手动刷新同一路径
      const forAuto = selectNewDueCardsForSession(
        [existing, newInDeck, newOtherDeck],
        [existing],
        scope
      )
      const forManual = selectNewDueCardsForSession(
        [existing, newInDeck, newOtherDeck],
        [existing],
        scope
      )

      expect(forAuto).toEqual([newInDeck])
      expect(forManual).toEqual([newInDeck])
      expect(forAuto).toEqual(forManual)
    })

    it("all scope 可追加任意牌组新卡", () => {
      const existing = card({ id: 1, deck: "A" })
      const fromB = card({ id: 2, deck: "B" })
      const scope = createAllScope()
      expect(
        selectNewDueCardsForSession([fromB], [existing], scope)
      ).toEqual([fromB])
    })

    it("fixed scope 下候选过滤仍可用，但不允许全库扫描标志为 false", () => {
      const fixed = card({ id: 1, cardType: "basic" })
      const outsider = card({ id: 2, cardType: "basic" })
      const scope = createFixedScope([fixed])
      expect(allowsFullLibraryDynamicScan(scope)).toBe(false)
      // 若有人误扫全库，过滤结果也不应放进 outsider
      expect(
        selectNewDueCardsForSession([outsider], [fixed], scope)
      ).toEqual([])
    })

    it("FC-01：先 scope 再剩余额度；budget 共享于自动/手动", () => {
      const existing = card({ id: 1, deck: "A", isNew: false })
      const budget = createSessionRootCardBudget(
        { newCardsPerDay: 0, reviewCardsPerDay: 2 },
        [existing]
      )!
      const a2 = card({ id: 2, deck: "A" })
      const a3 = card({ id: 3, deck: "A" })
      const b1 = card({ id: 4, deck: "B" })
      const scope = createDeckScope("A")

      const forAuto = selectNewDueCardsForSession(
        [a2, a3, b1],
        [existing],
        scope,
        budget
      )
      expect(forAuto.map((c) => c.id)).toEqual([2])
      const forManual = selectNewDueCardsForSession(
        [a2, a3, b1],
        [existing, ...forAuto],
        scope,
        budget
      )
      expect(forManual).toEqual([])
    })
  })

  describe("Renderer prepareNormalSessionQueueInput", () => {
    it("读取一次 deck filter 语义：创建 scope 并筛选初始 cards", () => {
      const a = card({ id: 1, deck: "Japanese" })
      const b = card({ id: 2, deck: "English" })
      const { scope, filteredCards } = prepareNormalSessionQueueInput(
        [a, b],
        "Japanese"
      )
      expect(scope.kind).toBe("deck")
      if (scope.kind === "deck") {
        expect(scope.deckName).toBe("Japanese")
      }
      expect(filteredCards).toEqual([a])
    })

    it("无 filter 时 all + 全量 cards", () => {
      const a = card({ id: 1, deck: "A" })
      const b = card({ id: 2, deck: "B" })
      const { scope, filteredCards } = prepareNormalSessionQueueInput(
        [a, b],
        null
      )
      expect(scope.kind).toBe("all")
      expect(filteredCards).toEqual([a, b])
    })
  })
})
