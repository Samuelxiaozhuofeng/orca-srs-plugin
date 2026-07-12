import { describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  buildHistoryEntry,
  canGoPrevious,
  continueFromReadOnly,
  createEmptyHistory,
  formatReadOnlyStatus,
  guardSideEffectAction,
  isCardReadOnly,
  isLockingAction,
  navigatePrevious,
  recordHistoryAction,
  READONLY_ACTION_BLOCKED_MESSAGE
} from "./reviewSessionHistory"

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
    cardType: "basic",
    ...overrides
  }
}

describe("reviewSessionHistory", () => {
  describe("locking rules", () => {
    it("skip 不锁定；grade/repeat/auxiliary/postpone/suspend 锁定", () => {
      expect(isLockingAction("skip")).toBe(false)
      expect(isLockingAction("grade")).toBe(true)
      expect(isLockingAction("repeat_grade")).toBe(true)
      expect(isLockingAction("auxiliary_grade")).toBe(true)
      expect(isLockingAction("postpone")).toBe(true)
      expect(isLockingAction("suspend")).toBe(true)
    })

    it("正式评分后 isCardReadOnly / guard 阻止副作用", () => {
      const c = card({ id: 10, cardType: "basic" })
      const key = cardKeyFromReviewCard(c)
      let state = createEmptyHistory()
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: key,
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )
      expect(isCardReadOnly(key, state)).toBe(true)
      expect(guardSideEffectAction(key, state)).toEqual({
        allowed: false,
        message: READONLY_ACTION_BLOCKED_MESSAGE
      })
    })

    it("重复模式评分与辅助预览评分同样只读", () => {
      const c = card({ id: 11, cardType: "basic" })
      const key = cardKeyFromReviewCard(c)
      for (const kind of ["repeat_grade", "auxiliary_grade"] as const) {
        let state = createEmptyHistory()
        state = recordHistoryAction(
          state,
          buildHistoryEntry({
            cardKey: key,
            actionKind: kind,
            originalIndex: 0,
            grade: "hard"
          })
        )
        expect(isCardReadOnly(key, state)).toBe(true)
      }
    })

    it("推迟/暂停后只读", () => {
      const c = card({ id: 12, cardType: "basic" })
      const key = cardKeyFromReviewCard(c)
      for (const kind of ["postpone", "suspend"] as const) {
        let state = createEmptyHistory()
        state = recordHistoryAction(
          state,
          buildHistoryEntry({
            cardKey: key,
            actionKind: kind,
            originalIndex: 0
          })
        )
        expect(isCardReadOnly(key, state)).toBe(true)
        expect(guardSideEffectAction(key, state).allowed).toBe(false)
      }
    })

    it("跳过后返回允许评分（不只读）", () => {
      const c = card({ id: 13, cardType: "basic" })
      const key = cardKeyFromReviewCard(c)
      let state = createEmptyHistory()
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: key,
          actionKind: "skip",
          originalIndex: 0
        })
      )
      expect(isCardReadOnly(key, state)).toBe(false)
      expect(guardSideEffectAction(key, state)).toEqual({ allowed: true })
      // skip 不写 outcomes
      expect(state.outcomesByKey[key]).toBeUndefined()
    })
  })

  describe("card key isolation (Basic/Cloze/Direction/List/Choice)", () => {
    it("变体互不串；Basic/Choice 同 blockId 按 cardType 区分", () => {
      const blockId = 100
      const basic = card({ id: blockId, cardType: "basic" })
      const choice = card({ id: blockId, cardType: "choice" })
      const cloze1 = card({ id: blockId, cardType: "cloze", clozeNumber: 1 })
      const cloze2 = card({ id: blockId, cardType: "cloze", clozeNumber: 2 })
      const dirFwd = card({
        id: blockId,
        cardType: "direction",
        directionType: "forward"
      })
      const dirBwd = card({
        id: blockId,
        cardType: "direction",
        directionType: "backward"
      })
      const listA = card({
        id: blockId,
        cardType: "list",
        listItemId: 201
      })
      const listB = card({
        id: blockId,
        cardType: "list",
        listItemId: 202
      })

      const keys = [
        basic,
        choice,
        cloze1,
        cloze2,
        dirFwd,
        dirBwd,
        listA,
        listB
      ].map(cardKeyFromReviewCard)

      expect(new Set(keys).size).toBe(8)

      let state = createEmptyHistory()
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: cardKeyFromReviewCard(cloze1),
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )

      expect(isCardReadOnly(cardKeyFromReviewCard(cloze1), state)).toBe(true)
      expect(isCardReadOnly(cardKeyFromReviewCard(cloze2), state)).toBe(false)
      expect(isCardReadOnly(cardKeyFromReviewCard(basic), state)).toBe(false)
      expect(isCardReadOnly(cardKeyFromReviewCard(choice), state)).toBe(false)
      expect(isCardReadOnly(cardKeyFromReviewCard(dirFwd), state)).toBe(false)
      expect(isCardReadOnly(cardKeyFromReviewCard(listA), state)).toBe(false)

      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: cardKeyFromReviewCard(listA),
          actionKind: "grade",
          originalIndex: 1,
          grade: "again"
        })
      )
      expect(isCardReadOnly(cardKeyFromReviewCard(listA), state)).toBe(true)
      expect(isCardReadOnly(cardKeyFromReviewCard(listB), state)).toBe(false)
    })
  })

  describe("navigation stack: previous / continue", () => {
    it("Good 后返回，再继续、再返回：栈与只读正确", () => {
      const a = card({ id: 1, cardType: "basic" })
      const b = card({ id: 2, cardType: "basic" })
      const c = card({ id: 3, cardType: "basic" })
      const queue = [a, b, c]
      const keyA = cardKeyFromReviewCard(a)
      const keyB = cardKeyFromReviewCard(b)

      let state = createEmptyHistory()
      // grade A @0
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: keyA,
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )
      // grade B @1
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: keyB,
          actionKind: "grade",
          originalIndex: 1,
          grade: "easy"
        })
      )
      expect(state.stack).toHaveLength(2)
      expect(canGoPrevious(state)).toBe(true)

      // previous → B
      const prevB = navigatePrevious(state, queue)
      expect(prevB.ok).toBe(true)
      if (!prevB.ok) return
      expect(prevB.index).toBe(1)
      expect(prevB.entry.cardKey).toBe(keyB)
      state = prevB.state
      expect(isCardReadOnly(keyB, state)).toBe(true)
      expect(formatReadOnlyStatus(state.outcomesByKey[keyB]!)).toContain("EASY")

      // previous → A
      const prevA = navigatePrevious(state, queue)
      expect(prevA.ok).toBe(true)
      if (!prevA.ok) return
      expect(prevA.index).toBe(0)
      state = prevA.state
      expect(isCardReadOnly(keyA, state)).toBe(true)
      expect(state.stack).toHaveLength(0)

      // continue from A → re-push A outcome, next index 1
      const cont = continueFromReadOnly(state, keyA, 0)
      state = cont.state
      expect(cont.nextIndex).toBe(1)
      expect(state.stack).toHaveLength(1)
      expect(state.stack[0]!.cardKey).toBe(keyA)
      // outcome 仍是 grade，不是 skip
      expect(state.outcomesByKey[keyA]!.actionKind).toBe("grade")
      expect(state.outcomesByKey[keyA]!.grade).toBe("good")

      // 再 previous → A still read-only
      const prevA2 = navigatePrevious(state, queue)
      expect(prevA2.ok).toBe(true)
      if (!prevA2.ok) return
      expect(prevA2.index).toBe(0)
      expect(isCardReadOnly(keyA, prevA2.state)).toBe(true)
    })

    it("continue 不得用 skip 覆盖 grade outcome", () => {
      const a = card({ id: 5, cardType: "basic" })
      const key = cardKeyFromReviewCard(a)
      let state = createEmptyHistory()
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: key,
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )
      // simulate previous (pop stack, keep outcomes)
      state = { stack: [], outcomesByKey: state.outcomesByKey }
      const cont = continueFromReadOnly(state, key, 0)
      expect(cont.state.outcomesByKey[key]!.actionKind).toBe("grade")
      expect(cont.state.outcomesByKey[key]!.grade).toBe("good")
      expect(cont.state.stack[0]!.actionKind).toBe("grade")
    })
  })

  describe("queue insert/delete + key lookup", () => {
    it("历史记录后插入项，按 key 仍找对卡", () => {
      const a = card({ id: 1, cardType: "basic" })
      const b = card({ id: 2, cardType: "basic" })
      let queue = [a, b]
      let state = createEmptyHistory()
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: cardKeyFromReviewCard(a),
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: cardKeyFromReviewCard(b),
          actionKind: "grade",
          originalIndex: 1,
          grade: "good"
        })
      )

      // 在头部插入新卡，B 的 index 变化
      const inserted = card({ id: 99, cardType: "basic" })
      queue = [inserted, a, b]

      const prev = navigatePrevious(state, queue)
      expect(prev.ok).toBe(true)
      if (!prev.ok) return
      expect(prev.index).toBe(2) // B now at 2
      expect(prev.entry.cardKey).toBe(cardKeyFromReviewCard(b))
    })

    it("目标删除时不误跳其他卡，并报告 warning", () => {
      const a = card({ id: 1, cardType: "basic" })
      const b = card({ id: 2, cardType: "basic" })
      const c = card({ id: 3, cardType: "basic" })
      let state = createEmptyHistory()
      for (const [cardItem, idx] of [
        [a, 0],
        [b, 1],
        [c, 2]
      ] as const) {
        state = recordHistoryAction(
          state,
          buildHistoryEntry({
            cardKey: cardKeyFromReviewCard(cardItem),
            actionKind: "grade",
            originalIndex: idx,
            grade: "good"
          })
        )
      }

      // 删除 B：previous 应从 C 找 C；再 previous 跳过缺失的 B 并 warn，落到 A
      const queueWithoutB = [a, c]
      const prevC = navigatePrevious(state, queueWithoutB)
      expect(prevC.ok).toBe(true)
      if (!prevC.ok) return
      expect(prevC.index).toBe(1) // c
      expect(prevC.entry.cardKey).toBe(cardKeyFromReviewCard(c))

      const prevA = navigatePrevious(prevC.state, queueWithoutB)
      expect(prevA.ok).toBe(true)
      if (!prevA.ok) return
      expect(prevA.index).toBe(0) // a
      expect(prevA.entry.cardKey).toBe(cardKeyFromReviewCard(a))
      expect(prevA.warnings.length).toBeGreaterThan(0)
      expect(prevA.warnings[0]).toContain(cardKeyFromReviewCard(b))
      expect(prevA.warnings[0]).toMatch(/已不在队列|跳过/)
    })

    it("全部历史目标都缺失时 ok=false 且不给假索引", () => {
      const a = card({ id: 1, cardType: "basic" })
      let state = createEmptyHistory()
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: cardKeyFromReviewCard(a),
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )
      const other = card({ id: 999, cardType: "basic" })
      const result = navigatePrevious(state, [other])
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe("all_missing")
      expect(result.warnings.length).toBe(1)
      expect(result.message).toMatch(/已不在队列/)
      // outcomes 仍在，只是栈空了
      expect(result.state.stack).toHaveLength(0)
      expect(isCardReadOnly(cardKeyFromReviewCard(a), result.state)).toBe(true)
    })
  })

  describe("acceptance: grade only once after return (guard path)", () => {
    it("Good 后返回，再次 guard 评分/数字键路径均 blocked；模拟 gradeReviewCard 只应成功一次", () => {
      const c = card({ id: 42, cardType: "basic", srs: baseSrs({ reps: 1, lapses: 0 }) })
      const key = cardKeyFromReviewCard(c)
      const gradeReviewCard = vi.fn()

      let state = createEmptyHistory()
      // first successful grade path
      const firstGuard = guardSideEffectAction(key, state)
      expect(firstGuard.allowed).toBe(true)
      gradeReviewCard("good")
      state = recordHistoryAction(
        state,
        buildHistoryEntry({
          cardKey: key,
          actionKind: "grade",
          originalIndex: 0,
          grade: "good"
        })
      )

      // return (outcomes keep locking)
      state = { stack: [], outcomesByKey: state.outcomesByKey }
      expect(isCardReadOnly(key, state)).toBe(true)

      // direct grade call + simulated number key path
      for (const g of ["again", "hard", "good", "easy"] as const) {
        const g2 = guardSideEffectAction(key, state)
        expect(g2.allowed).toBe(false)
        if (g2.allowed) gradeReviewCard(g)
      }
      // postpone/suspend similarly blocked
      expect(guardSideEffectAction(key, state).allowed).toBe(false)

      expect(gradeReviewCard).toHaveBeenCalledTimes(1)
      expect(gradeReviewCard).toHaveBeenCalledWith("good")
    })
  })
})
