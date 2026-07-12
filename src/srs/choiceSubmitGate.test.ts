import { describe, expect, it } from "vitest"
import {
  canFireSingleSubmit,
  cancelPendingSubmit,
  completeSingleSubmit,
  createChoiceSubmitGate,
  enterReadOnlyGate,
  isSubmitGateBlocking,
  resetGateForCard,
  tryBeginMultiSubmit,
  tryBeginSingleSubmit
} from "./choiceSubmitGate"

describe("choiceSubmitGate", () => {
  describe("single delayed submit", () => {
    it("快速重复只接受一次（同步锁）", () => {
      let state = createChoiceSubmitGate("choice:1")
      const a = tryBeginSingleSubmit(state, { cardKey: "choice:1", readOnly: false })
      state = a.state
      expect(a.token).toBe(1)
      expect(state.locked).toBe(true)

      const b = tryBeginSingleSubmit(state, { cardKey: "choice:1", readOnly: false })
      expect(b.token).toBeNull()
      expect(b.state.pendingToken).toBe(1)

      const c = tryBeginSingleSubmit(state, { cardKey: "choice:1", readOnly: false })
      expect(c.token).toBeNull()
    })

    it("timer 校验通过后 complete；token 不匹配不可 fire", () => {
      let state = createChoiceSubmitGate("choice:1")
      const { state: s1, token } = tryBeginSingleSubmit(state, {
        cardKey: "choice:1",
        readOnly: false
      })
      state = s1
      expect(token).not.toBeNull()

      expect(
        canFireSingleSubmit(state, {
          token: token!,
          cardKey: "choice:1",
          readOnly: false,
          mounted: true
        })
      ).toBe(true)

      expect(
        canFireSingleSubmit(state, {
          token: token! + 99,
          cardKey: "choice:1",
          readOnly: false,
          mounted: true
        })
      ).toBe(false)

      state = completeSingleSubmit(state, token!)
      expect(state.pendingToken).toBeNull()
      expect(state.locked).toBe(true)
      // 完成后仍不可再 begin
      expect(
        tryBeginSingleSubmit(state, { cardKey: "choice:1", readOnly: false }).token
      ).toBeNull()
    })

    it("readOnly 后 pending 不得 fire", () => {
      let state = createChoiceSubmitGate("choice:1")
      const { state: s1, token } = tryBeginSingleSubmit(state, {
        cardKey: "choice:1",
        readOnly: false
      })
      state = enterReadOnlyGate(s1)
      expect(
        canFireSingleSubmit(state, {
          token: token!,
          cardKey: "choice:1",
          readOnly: true,
          mounted: true
        })
      ).toBe(false)
      // enterReadOnly 已作废 token
      expect(state.pendingToken).toBeNull()
      expect(
        canFireSingleSubmit(state, {
          token: token!,
          cardKey: "choice:1",
          readOnly: false,
          mounted: true
        })
      ).toBe(false)
    })

    it("card key 变化后旧 token 不得 fire；新卡可重新提交", () => {
      let state = createChoiceSubmitGate("choice:1")
      const first = tryBeginSingleSubmit(state, {
        cardKey: "choice:1",
        readOnly: false
      })
      state = first.state
      const oldToken = first.token!

      state = resetGateForCard(state, "choice:2")
      expect(
        canFireSingleSubmit(state, {
          token: oldToken,
          cardKey: "choice:1",
          readOnly: false,
          mounted: true
        })
      ).toBe(false)
      expect(
        canFireSingleSubmit(state, {
          token: oldToken,
          cardKey: "choice:2",
          readOnly: false,
          mounted: true
        })
      ).toBe(false)

      const second = tryBeginSingleSubmit(state, {
        cardKey: "choice:2",
        readOnly: false
      })
      expect(second.token).not.toBeNull()
      expect(second.token).not.toBe(oldToken)
      state = second.state
      expect(
        canFireSingleSubmit(state, {
          token: second.token!,
          cardKey: "choice:2",
          readOnly: false,
          mounted: true
        })
      ).toBe(true)
    })

    it("unmount（mounted=false）不得 fire", () => {
      let state = createChoiceSubmitGate("choice:1")
      const { state: s1, token } = tryBeginSingleSubmit(state, {
        cardKey: "choice:1",
        readOnly: false
      })
      expect(
        canFireSingleSubmit(s1, {
          token: token!,
          cardKey: "choice:1",
          readOnly: false,
          mounted: false
        })
      ).toBe(false)
    })

    it("cancelPending 后旧 token 不得 fire，可重新 begin", () => {
      let state = createChoiceSubmitGate("choice:1")
      const first = tryBeginSingleSubmit(state, {
        cardKey: "choice:1",
        readOnly: false
      })
      state = cancelPendingSubmit(first.state)
      expect(
        canFireSingleSubmit(state, {
          token: first.token!,
          cardKey: "choice:1",
          readOnly: false,
          mounted: true
        })
      ).toBe(false)
      const again = tryBeginSingleSubmit(state, {
        cardKey: "choice:1",
        readOnly: false
      })
      expect(again.token).not.toBeNull()
    })
  })

  describe("multi submit lock", () => {
    it("同一周期重复提交只接受一次", () => {
      let state = createChoiceSubmitGate("choice:m")
      const a = tryBeginMultiSubmit(state, {
        cardKey: "choice:m",
        readOnly: false
      })
      expect(a.accepted).toBe(true)
      state = a.state
      const b = tryBeginMultiSubmit(state, {
        cardKey: "choice:m",
        readOnly: false
      })
      expect(b.accepted).toBe(false)
    })

    it("readOnly / answerRevealed 拒绝", () => {
      const state = createChoiceSubmitGate("choice:m")
      expect(
        tryBeginMultiSubmit(state, {
          cardKey: "choice:m",
          readOnly: true
        }).accepted
      ).toBe(false)
      expect(
        tryBeginMultiSubmit(state, {
          cardKey: "choice:m",
          readOnly: false,
          answerRevealed: true
        }).accepted
      ).toBe(false)
    })

    it("切卡后可再提交", () => {
      let state = createChoiceSubmitGate("choice:m1")
      state = tryBeginMultiSubmit(state, {
        cardKey: "choice:m1",
        readOnly: false
      }).state
      state = resetGateForCard(state, "choice:m2")
      expect(
        tryBeginMultiSubmit(state, {
          cardKey: "choice:m2",
          readOnly: false
        }).accepted
      ).toBe(true)
    })
  })

  describe("isSubmitGateBlocking", () => {
    it("locked / readOnly / revealed / grading 挡住交互", () => {
      let state = createChoiceSubmitGate("c")
      expect(isSubmitGateBlocking(state, { readOnly: false })).toBe(false)
      state = tryBeginSingleSubmit(state, {
        cardKey: "c",
        readOnly: false
      }).state
      expect(isSubmitGateBlocking(state, { readOnly: false })).toBe(true)
      expect(
        isSubmitGateBlocking(createChoiceSubmitGate("c"), {
          readOnly: true
        })
      ).toBe(true)
      expect(
        isSubmitGateBlocking(createChoiceSubmitGate("c"), {
          readOnly: false,
          answerRevealed: true
        })
      ).toBe(true)
    })
  })
})
