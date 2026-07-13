/**
 * 重复复习会话管理器测试（F2-01：按 sessionId 隔离）
 */

import { describe, it, expect, beforeEach } from "vitest"
import type { DbId } from "../orca.d.ts"
import type { ReviewCard, SrsState } from "./types"
import * as fc from "fast-check"
import {
  createRepeatReviewSession,
  resetCurrentRound,
  getRepeatReviewSession,
  getRepeatReviewSessionById,
  clearRepeatReviewSession,
  clearAllRepeatReviewSessionsForTests,
  hasActiveRepeatSession,
  getActiveRepeatSessionCount,
  retainRepeatReviewSession,
  releaseRepeatReviewSession,
  getRepeatReviewRetainCount
} from "./repeatReviewManager"

const srsStateArbitrary: fc.Arbitrary<SrsState> = fc.record({
  stability: fc.float({
    min: Math.fround(0.1),
    max: Math.fround(100),
    noNaN: true
  }),
  difficulty: fc.float({
    min: Math.fround(1),
    max: Math.fround(10),
    noNaN: true
  }),
  interval: fc.integer({ min: 1, max: 365 }),
  due: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
  lastReviewed: fc.option(
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
    { nil: null }
  ),
  reps: fc.integer({ min: 0, max: 100 }),
  lapses: fc.integer({ min: 0, max: 50 }),
  resets: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined })
})

const reviewCardArbitrary: fc.Arbitrary<ReviewCard> = fc.record({
  id: fc.integer({ min: 1, max: 10000 }) as fc.Arbitrary<DbId>,
  front: fc.string({ minLength: 1, maxLength: 200 }),
  back: fc.string({ minLength: 0, maxLength: 200 }),
  srs: srsStateArbitrary,
  isNew: fc.boolean(),
  deck: fc.string({ minLength: 1, maxLength: 50 }),
  clozeNumber: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  directionType: fc.option(
    fc.constantFrom("forward" as const, "backward" as const),
    { nil: undefined }
  ),
  tags: fc.option(
    fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }),
        blockId: fc.integer({ min: 1, max: 10000 }) as fc.Arbitrary<DbId>
      }),
      { minLength: 0, maxLength: 5 }
    ),
    { nil: undefined }
  )
})

const reviewCardsArbitrary = fc.array(reviewCardArbitrary, {
  minLength: 1,
  maxLength: 20
})
const sourceTypeArbitrary = fc.constantFrom(
  "query" as const,
  "children" as const
)

function sampleCard(): ReviewCard {
  return {
    id: 1 as DbId,
    front: "Question",
    back: "Answer",
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
    deck: "default"
  }
}

describe("repeatReviewManager", () => {
  beforeEach(() => {
    clearAllRepeatReviewSessionsForTests()
  })

  describe("createRepeatReviewSession", () => {
    it("should create a session with correct initial values and sessionId", () => {
      const cards = [sampleCard()]
      const session = createRepeatReviewSession(
        cards,
        100 as DbId,
        "query",
        "sess-1"
      )

      expect(session.sessionId).toBe("sess-1")
      expect(session.cards.length).toBe(1)
      expect(session.originalCards.length).toBe(1)
      expect(session.currentRound).toBe(1)
      expect(session.totalRounds).toBe(1)
      expect(session.isRepeatMode).toBe(true)
      expect(session.sourceBlockId).toBe(100)
      expect(session.sourceType).toBe("query")
    })

    it("requires non-empty sessionId", () => {
      expect(() =>
        createRepeatReviewSession([sampleCard()], 1 as DbId, "query", "")
      ).toThrow(/sessionId/)
    })

    it("indexes session by sessionId", () => {
      createRepeatReviewSession(
        [sampleCard()],
        100 as DbId,
        "children",
        "sess-x"
      )
      expect(hasActiveRepeatSession("sess-x")).toBe(true)
      expect(getRepeatReviewSessionById("sess-x")).not.toBeNull()
    })
  })

  describe("session isolation (F2-01)", () => {
    it("two sessions stay independent; later create does not overwrite the other", () => {
      const a = createRepeatReviewSession(
        [{ ...sampleCard(), id: 1 as DbId, front: "A" }],
        10 as DbId,
        "query",
        "sess-a"
      )
      const b = createRepeatReviewSession(
        [{ ...sampleCard(), id: 2 as DbId, front: "B" }],
        20 as DbId,
        "children",
        "sess-b"
      )

      expect(getActiveRepeatSessionCount()).toBe(2)
      expect(getRepeatReviewSessionById("sess-a")?.cards[0].front).toBe("A")
      expect(getRepeatReviewSessionById("sess-b")?.cards[0].front).toBe("B")
      expect(a.sessionId).toBe("sess-a")
      expect(b.sessionId).toBe("sess-b")
    })

    it("clearing one session does not clear the other", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "sess-a"
      )
      createRepeatReviewSession(
        [sampleCard()],
        2 as DbId,
        "query",
        "sess-b"
      )
      clearRepeatReviewSession("sess-a")
      expect(getRepeatReviewSessionById("sess-a")).toBeNull()
      expect(getRepeatReviewSessionById("sess-b")).not.toBeNull()
      expect(getActiveRepeatSessionCount()).toBe(1)
    })

    it("clear without sessionId does not wipe all sessions", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "sess-a"
      )
      clearRepeatReviewSession()
      expect(getRepeatReviewSessionById("sess-a")).not.toBeNull()
    })

    it("deprecated getRepeatReviewSession always returns null", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "sess-a"
      )
      expect(getRepeatReviewSession()).toBeNull()
    })

    it("fixed/repeat session is not replaced by a second normal-looking create with different id", () => {
      createRepeatReviewSession(
        [{ ...sampleCard(), front: "fixed-1" }],
        50 as DbId,
        "query",
        "fixed-sess"
      )
      createRepeatReviewSession(
        [{ ...sampleCard(), front: "fixed-2" }],
        60 as DbId,
        "children",
        "other-fixed"
      )
      expect(getRepeatReviewSessionById("fixed-sess")?.cards[0].front).toBe(
        "fixed-1"
      )
      expect(getRepeatReviewSessionById("other-fixed")?.cards[0].front).toBe(
        "fixed-2"
      )
    })
  })

  describe("resetCurrentRound", () => {
    it("Property 4: resetCurrentRound should restore cards to original state", async () => {
      await fc.assert(
        fc.asyncProperty(
          reviewCardsArbitrary,
          fc.integer({ min: 1, max: 10000 }) as fc.Arbitrary<DbId>,
          sourceTypeArbitrary,
          fc.uuid(),
          async (cards, sourceBlockId, sourceType, sessionId) => {
            clearAllRepeatReviewSessionsForTests()
            const session = createRepeatReviewSession(
              cards,
              sourceBlockId,
              sourceType,
              sessionId
            )
            if (session.cards.length > 0) {
              session.cards.pop()
            }
            const resetSession = resetCurrentRound(session)
            expect(resetSession.cards.length).toBe(cards.length)
            for (let i = 0; i < cards.length; i++) {
              expect(resetSession.cards[i].id).toBe(cards[i].id)
              expect(resetSession.cards[i].front).toBe(cards[i].front)
            }
            expect(resetSession.currentRound).toBe(session.currentRound + 1)
            expect(getRepeatReviewSessionById(sessionId)?.currentRound).toBe(
              resetSession.currentRound
            )
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should increment round counters", () => {
      const session = createRepeatReviewSession(
        [sampleCard()],
        100 as DbId,
        "query",
        "r1"
      )
      const reset1 = resetCurrentRound(session)
      expect(reset1.currentRound).toBe(2)
      const reset2 = resetCurrentRound(reset1)
      expect(reset2.currentRound).toBe(3)
    })
  })

  describe("hasActiveRepeatSession", () => {
    it("should return false when no session exists", () => {
      expect(hasActiveRepeatSession()).toBe(false)
    })

    it("should return true when session exists", () => {
      createRepeatReviewSession(
        [sampleCard()],
        100 as DbId,
        "query",
        "active"
      )
      expect(hasActiveRepeatSession()).toBe(true)
      expect(hasActiveRepeatSession("active")).toBe(true)
      expect(hasActiveRepeatSession("missing")).toBe(false)
    })
  })

  describe("retain / release (F2-01 multi-panel)", () => {
    it("create does not retain; retain twice then release once keeps payload", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "shared"
      )
      expect(getRepeatReviewRetainCount("shared")).toBe(0)
      expect(hasActiveRepeatSession("shared")).toBe(true)

      retainRepeatReviewSession("shared")
      retainRepeatReviewSession("shared")
      expect(getRepeatReviewRetainCount("shared")).toBe(2)

      releaseRepeatReviewSession("shared")
      expect(getRepeatReviewRetainCount("shared")).toBe(1)
      expect(getRepeatReviewSessionById("shared")).not.toBeNull()
    })

    it("second release deletes payload", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "shared"
      )
      retainRepeatReviewSession("shared")
      retainRepeatReviewSession("shared")
      releaseRepeatReviewSession("shared")
      releaseRepeatReviewSession("shared")
      expect(getRepeatReviewSessionById("shared")).toBeNull()
      expect(getRepeatReviewRetainCount("shared")).toBe(0)
    })

    it("different sessionIds are independent", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "a"
      )
      createRepeatReviewSession(
        [sampleCard()],
        2 as DbId,
        "query",
        "b"
      )
      retainRepeatReviewSession("a")
      retainRepeatReviewSession("b")
      releaseRepeatReviewSession("a")
      expect(getRepeatReviewSessionById("a")).toBeNull()
      expect(getRepeatReviewSessionById("b")).not.toBeNull()
      expect(getRepeatReviewRetainCount("b")).toBe(1)
    })

    it("extra release does not go negative or delete a recreated session", () => {
      createRepeatReviewSession(
        [sampleCard()],
        1 as DbId,
        "query",
        "x"
      )
      retainRepeatReviewSession("x")
      releaseRepeatReviewSession("x")
      expect(getRepeatReviewSessionById("x")).toBeNull()

      // stale extra release
      releaseRepeatReviewSession("x")
      expect(getRepeatReviewRetainCount("x")).toBe(0)

      // recreate with same id
      createRepeatReviewSession(
        [{ ...sampleCard(), front: "new" }],
        1 as DbId,
        "query",
        "x"
      )
      // stale release must not delete new payload
      releaseRepeatReviewSession("x")
      expect(getRepeatReviewSessionById("x")?.cards[0].front).toBe("new")
      expect(getRepeatReviewRetainCount("x")).toBe(0)
    })

    it("retain without payload throws", () => {
      expect(() => retainRepeatReviewSession("missing")).toThrow(/retain/)
    })
  })
})
