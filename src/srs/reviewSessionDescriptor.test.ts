import { describe, expect, it } from "vitest"
import type { ReviewCard } from "./types"
import {
  REVIEW_SESSION_DESCRIPTOR_VERSION,
  ReviewSessionDescriptorError,
  assertFixedCardsMatchDescriptor,
  buildReviewSessionBlockRepr,
  createCustomSessionDescriptor,
  createFixedRepeatSessionDescriptor,
  createNormalAllSessionDescriptor,
  createNormalDeckSessionDescriptor,
  createNormalSessionDescriptor,
  parseReviewSessionDescriptor,
  readReviewSessionDescriptorFromBlock,
  scopeFromReviewSessionDescriptor,
  serializeReviewSessionDescriptor
} from "./reviewSessionDescriptor"

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

function card(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 1,
    front: "Q",
    back: "A",
    srs: baseSrs(),
    isNew: false,
    deck: "A",
    cardType: "basic",
    ...overrides
  }
}

describe("reviewSessionDescriptor", () => {
  describe("kind mutual exclusion + factories", () => {
    it("creates independent normal/all and normal/deck descriptors", () => {
      const all = createNormalAllSessionDescriptor({
        sessionId: "sess-all",
        createdAt: 1000
      })
      const deckA = createNormalDeckSessionDescriptor("A", {
        sessionId: "sess-a",
        createdAt: 1001
      })
      const deckB = createNormalDeckSessionDescriptor("B", {
        sessionId: "sess-b",
        createdAt: 1002
      })

      expect(all.kind).toBe("normal")
      expect(all.scope.kind).toBe("all")
      expect(all.updatesSrs).toBe(true)
      expect(all.consumesDailyQuota).toBe(true)

      expect(deckA.scope.kind).toBe("deck")
      if (deckA.scope.kind === "deck") {
        expect(deckA.scope.deckName).toBe("A")
      }
      expect(deckB.sessionId).toBe("sess-b")
      if (deckB.scope.kind === "deck") {
        expect(deckB.scope.deckName).toBe("B")
      }
      // B 创建后 A 不变
      if (deckA.scope.kind === "deck") {
        expect(deckA.scope.deckName).toBe("A")
      }
      expect(deckA.sessionId).not.toBe(deckB.sessionId)
    })

    it("createNormalSessionDescriptor: empty → all, name → deck", () => {
      expect(createNormalSessionDescriptor(null).scope.kind).toBe("all")
      expect(createNormalSessionDescriptor(undefined).scope.kind).toBe("all")
      expect(createNormalSessionDescriptor("").scope.kind).toBe("all")
      const d = createNormalSessionDescriptor("Japanese")
      expect(d.scope.kind).toBe("deck")
      if (d.scope.kind === "deck") {
        expect(d.scope.deckName).toBe("Japanese")
      }
    })

    it("creates fixed/repeat with cardKeys and no SRS/quota flags", () => {
      const cards = [
        card({ id: 10, deck: "A" }),
        card({ id: 20, deck: "B", front: "Q2" })
      ]
      const fixed = createFixedRepeatSessionDescriptor({
        cards,
        sourceBlockId: 99,
        sourceType: "query",
        sessionId: "sess-fixed",
        createdAt: 2000
      })
      expect(fixed.kind).toBe("fixed")
      expect(fixed.mode).toBe("repeat")
      expect(fixed.updatesSrs).toBe(false)
      expect(fixed.consumesDailyQuota).toBe(false)
      expect(fixed.source.sourceBlockId).toBe("99")
      expect(fixed.cardKeys.length).toBe(2)
      expect(fixed.sessionId).toBe("sess-fixed")
    })

    it("creates custom type without implying a launch success path", () => {
      const custom = createCustomSessionDescriptor(
        { version: 1, mode: "practice" },
        { sessionId: "sess-custom", createdAt: 3000 }
      )
      expect(custom.kind).toBe("custom")
      expect(custom.definition.mode).toBe("practice")
      expect(custom.updatesSrs).toBe(false)
      expect(custom.consumesDailyQuota).toBe(false)

      const scheduled = createCustomSessionDescriptor(
        { version: 1, mode: "scheduled" },
        { sessionId: "sess-custom-2" }
      )
      expect(scheduled.updatesSrs).toBe(true)
      expect(scheduled.consumesDailyQuota).toBe(true)
    })

    it("custom practice/scheduled flags are fixed and not overridable", () => {
      const practice = createCustomSessionDescriptor(
        { version: 1, mode: "practice" },
        { sessionId: "p1" }
      )
      expect(practice.updatesSrs).toBe(false)
      expect(practice.consumesDailyQuota).toBe(false)

      const scheduled = createCustomSessionDescriptor(
        { version: 1, mode: "scheduled" },
        { sessionId: "s1" }
      )
      expect(scheduled.updatesSrs).toBe(true)
      expect(scheduled.consumesDailyQuota).toBe(true)

      // parse 不一致必须报错
      expect(() =>
        parseReviewSessionDescriptor({
          version: 1,
          sessionId: "bad-p",
          createdAt: 1,
          kind: "custom",
          definition: { version: 1, mode: "practice" },
          updatesSrs: true,
          consumesDailyQuota: false
        })
      ).toThrow(/practice/)

      expect(() =>
        parseReviewSessionDescriptor({
          version: 1,
          sessionId: "bad-s",
          createdAt: 1,
          kind: "custom",
          definition: { version: 1, mode: "scheduled" },
          updatesSrs: false,
          consumesDailyQuota: true
        })
      ).toThrow(/scheduled/)
    })

    it("rejects empty deck name for normal/deck", () => {
      expect(() => createNormalDeckSessionDescriptor("  ")).toThrow(
        ReviewSessionDescriptorError
      )
    })
  })

  describe("Deck A/B independence", () => {
    it("creating B after A does not mutate A", () => {
      const a = createNormalDeckSessionDescriptor("DeckA", {
        sessionId: "a",
        createdAt: 1
      })
      const b = createNormalDeckSessionDescriptor("DeckB", {
        sessionId: "b",
        createdAt: 2
      })
      expect(a.sessionId).toBe("a")
      expect(b.sessionId).toBe("b")
      if (a.scope.kind === "deck" && b.scope.kind === "deck") {
        expect(a.scope.deckName).toBe("DeckA")
        expect(b.scope.deckName).toBe("DeckB")
      }
      const scopeA = scopeFromReviewSessionDescriptor(a)
      const scopeB = scopeFromReviewSessionDescriptor(b)
      expect(scopeA.kind).toBe("deck")
      expect(scopeB.kind).toBe("deck")
      if (scopeA.kind === "deck") expect(scopeA.deckName).toBe("DeckA")
      if (scopeB.kind === "deck") expect(scopeB.deckName).toBe("DeckB")
    })
  })

  describe("serialize / parse round-trip", () => {
    it("round-trips all / deck / fixed / custom", () => {
      const samples = [
        createNormalAllSessionDescriptor({ sessionId: "1", createdAt: 1 }),
        createNormalDeckSessionDescriptor("X", {
          sessionId: "2",
          createdAt: 2
        }),
        createFixedRepeatSessionDescriptor({
          cards: [card({ id: 1 })],
          sourceBlockId: 5,
          sourceType: "children",
          sessionId: "3",
          createdAt: 3
        }),
        createCustomSessionDescriptor(
          { version: 1, mode: "scheduled" },
          { sessionId: "4", createdAt: 4 }
        )
      ]

      for (const d of samples) {
        const raw = serializeReviewSessionDescriptor(d)
        const parsed = parseReviewSessionDescriptor(raw)
        expect(parsed.version).toBe(REVIEW_SESSION_DESCRIPTOR_VERSION)
        expect(parsed.sessionId).toBe(d.sessionId)
        expect(parsed.kind).toBe(d.kind)
        expect(parsed.createdAt).toBe(d.createdAt)
        expect(parsed.updatesSrs).toBe(d.updatesSrs)
        expect(parsed.consumesDailyQuota).toBe(d.consumesDailyQuota)
      }
    })
  })

  describe("missing / corrupt / unknown version fail without all fallback", () => {
    it("missing → error", () => {
      expect(() => parseReviewSessionDescriptor(null)).toThrow(
        /缺失|missing/i
      )
      expect(() => parseReviewSessionDescriptor(undefined)).toThrow(
        ReviewSessionDescriptorError
      )
    })

    it("unknown version → error, not all", () => {
      expect(() =>
        parseReviewSessionDescriptor({
          version: 99,
          sessionId: "x",
          createdAt: 1,
          kind: "normal",
          scope: { kind: "all" },
          updatesSrs: true,
          consumesDailyQuota: true
        })
      ).toThrow(/版本/)
    })

    it("corrupt fields → error", () => {
      expect(() =>
        parseReviewSessionDescriptor({
          version: 1,
          sessionId: "",
          createdAt: 1,
          kind: "normal",
          scope: { kind: "all" },
          updatesSrs: true,
          consumesDailyQuota: true
        })
      ).toThrow(ReviewSessionDescriptorError)

      expect(() =>
        parseReviewSessionDescriptor({
          version: 1,
          sessionId: "x",
          createdAt: 1,
          kind: "normal",
          scope: { kind: "deck" },
          updatesSrs: true,
          consumesDailyQuota: true
        })
      ).toThrow(/deckName/)

      expect(() =>
        parseReviewSessionDescriptor({
          version: 1,
          sessionId: "x",
          createdAt: 1,
          kind: "fixed",
          mode: "repeat",
          source: { sourceType: "query", sourceBlockId: "1" },
          cardKeys: "not-array",
          fixedRootIds: [],
          updatesSrs: false,
          consumesDailyQuota: false
        })
      ).toThrow(ReviewSessionDescriptorError)
    })

    it("unknown kind → error", () => {
      expect(() =>
        parseReviewSessionDescriptor({
          version: 1,
          sessionId: "x",
          createdAt: 1,
          kind: "mystery",
          updatesSrs: true,
          consumesDailyQuota: true
        })
      ).toThrow(/未知会话 kind/)
    })

    it("block without descriptor → error (not all)", () => {
      expect(() =>
        readReviewSessionDescriptorFromBlock({
          _repr: { type: "srs.review-session" }
        })
      ).toThrow(ReviewSessionDescriptorError)

      expect(() => readReviewSessionDescriptorFromBlock(null)).toThrow(
        ReviewSessionDescriptorError
      )
    })
  })

  describe("two blocks with different descriptors do not cross scope", () => {
    it("reads independent descriptors from separate block _repr", () => {
      const descA = createNormalDeckSessionDescriptor("A", {
        sessionId: "block-a",
        createdAt: 10
      })
      const descB = createNormalDeckSessionDescriptor("B", {
        sessionId: "block-b",
        createdAt: 20
      })
      const blockA = { _repr: buildReviewSessionBlockRepr(descA) }
      const blockB = { _repr: buildReviewSessionBlockRepr(descB) }

      const readA = readReviewSessionDescriptorFromBlock(blockA)
      const readB = readReviewSessionDescriptorFromBlock(blockB)

      expect(readA.sessionId).toBe("block-a")
      expect(readB.sessionId).toBe("block-b")
      const scopeA = scopeFromReviewSessionDescriptor(readA)
      const scopeB = scopeFromReviewSessionDescriptor(readB)
      if (scopeA.kind === "deck") expect(scopeA.deckName).toBe("A")
      if (scopeB.kind === "deck") expect(scopeB.deckName).toBe("B")
    })
  })

  describe("fixed/repeat vs normal isolation", () => {
    it("fixed descriptor does not parse as normal/deck", () => {
      const fixed = createFixedRepeatSessionDescriptor({
        cards: [card()],
        sourceBlockId: 7,
        sourceType: "children",
        sessionId: "f1",
        createdAt: 1
      })
      const parsed = parseReviewSessionDescriptor(
        serializeReviewSessionDescriptor(fixed)
      )
      expect(parsed.kind).toBe("fixed")
      if (parsed.kind === "fixed") {
        expect(parsed.mode).toBe("repeat")
        expect(parsed.source.sourceBlockId).toBe("7")
      }
      // scope 派生为 fixed，不是 deck/all
      expect(scopeFromReviewSessionDescriptor(parsed).kind).toBe("fixed")
    })

    it("custom scopeFrom throws (no silent all fallback)", () => {
      const custom = createCustomSessionDescriptor(
        { version: 1, mode: "practice" },
        { sessionId: "c1" }
      )
      expect(() => scopeFromReviewSessionDescriptor(custom)).toThrow(
        /自定义学习/
      )
    })
  })

  describe("same session block reopen semantics", () => {
    it("re-reading the same block returns the same sessionId and scope", () => {
      const desc = createNormalDeckSessionDescriptor("A", {
        sessionId: "stable-1",
        createdAt: 42
      })
      const block = { _repr: buildReviewSessionBlockRepr(desc) }

      const first = readReviewSessionDescriptorFromBlock(block)
      const second = readReviewSessionDescriptorFromBlock(block)
      expect(first.sessionId).toBe("stable-1")
      expect(second.sessionId).toBe(first.sessionId)
      expect(first.createdAt).toBe(42)
      expect(second.createdAt).toBe(first.createdAt)
      // 覆盖 _repr 才会改变；未覆盖则复用
      const other = createNormalDeckSessionDescriptor("B", {
        sessionId: "other",
        createdAt: 99
      })
      const otherBlock = { _repr: buildReviewSessionBlockRepr(other) }
      expect(
        readReviewSessionDescriptorFromBlock(otherBlock).sessionId
      ).toBe("other")
      expect(readReviewSessionDescriptorFromBlock(block).sessionId).toBe(
        "stable-1"
      )
    })
  })

  describe("assertFixedCardsMatchDescriptor", () => {
    it("passes when cards cover descriptor keys", () => {
      const cards = [card({ id: 1 }), card({ id: 2 })]
      const d = createFixedRepeatSessionDescriptor({
        cards,
        sourceBlockId: 1,
        sourceType: "query"
      })
      expect(() => assertFixedCardsMatchDescriptor(d, cards)).not.toThrow()
    })

    it("fails when keys missing", () => {
      const cards = [card({ id: 1 }), card({ id: 2 })]
      const d = createFixedRepeatSessionDescriptor({
        cards,
        sourceBlockId: 1,
        sourceType: "query"
      })
      expect(() =>
        assertFixedCardsMatchDescriptor(d, [card({ id: 1 })])
      ).toThrow(/不一致/)
    })
  })
})
