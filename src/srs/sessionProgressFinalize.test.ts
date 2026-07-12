/**
 * FC-09 修补：会话完成一次性 finalize
 */

import { describe, expect, it, vi } from "vitest"
import {
  createSessionFinalizeController,
  ensureSessionFinalized,
  peekFinalizedSessionStats,
  resetSessionFinalizeController
} from "./sessionProgressFinalize"

type FakeStats = { totalReviewed: number; id: string }

function makeStats(id: string, totalReviewed = 3): FakeStats {
  return { id, totalReviewed }
}

describe("sessionProgressFinalize", () => {
  it("多次 ensure / peek 不重复调用 finish", () => {
    const controller = createSessionFinalizeController<FakeStats>()
    const finishOnce = vi.fn(() => makeStats("first", 5))

    const a = ensureSessionFinalized(controller, finishOnce)
    const b = ensureSessionFinalized(controller, finishOnce)
    const c = ensureSessionFinalized(controller, finishOnce)
    const peeked = peekFinalizedSessionStats(controller)

    expect(finishOnce).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(peeked).toBe(a)
    expect(a.totalReviewed).toBe(5)
    expect(controller.finalized).toBe(true)
  })

  it("未 finalize 时 peek 为 null，不调用 finish", () => {
    const controller = createSessionFinalizeController<FakeStats>()
    expect(peekFinalizedSessionStats(controller)).toBeNull()
    expect(controller.finalized).toBe(false)
  })

  it("多次完成/关闭语义：已 finalize 后再次 ensure 仍只 finish 一次", () => {
    const controller = createSessionFinalizeController<FakeStats>()
    let calls = 0
    const finishOnce = () => {
      calls += 1
      return makeStats(`call-${calls}`, calls)
    }

    // 模拟 effect 结算
    const fromEffect = ensureSessionFinalized(controller, finishOnce)
    // 模拟完成按钮
    const fromButton = ensureSessionFinalized(controller, finishOnce)
    // 模拟关闭前再读
    const fromClose = ensureSessionFinalized(controller, finishOnce)

    expect(calls).toBe(1)
    expect(fromEffect.id).toBe("call-1")
    expect(fromButton.id).toBe("call-1")
    expect(fromClose.id).toBe("call-1")
  })

  it("round reset 后可再 finalize 一次", () => {
    const controller = createSessionFinalizeController<FakeStats>()
    let n = 0
    const finishOnce = vi.fn(() => {
      n += 1
      return makeStats(`n-${n}`)
    })

    const first = ensureSessionFinalized(controller, finishOnce)
    expect(finishOnce).toHaveBeenCalledTimes(1)
    expect(first.id).toBe("n-1")

    resetSessionFinalizeController(controller)
    expect(controller.finalized).toBe(false)
    expect(peekFinalizedSessionStats(controller)).toBeNull()

    const second = ensureSessionFinalized(controller, finishOnce)
    expect(finishOnce).toHaveBeenCalledTimes(2)
    expect(second.id).toBe("n-2")
    expect(second).not.toBe(first)
  })

  it("reset 后再次多次 ensure 仍只 finish 一次（新一轮）", () => {
    const controller = createSessionFinalizeController<FakeStats>()
    const finishOnce = vi.fn(() => makeStats("round"))

    ensureSessionFinalized(controller, finishOnce)
    resetSessionFinalizeController(controller)
    finishOnce.mockClear()

    ensureSessionFinalized(controller, finishOnce)
    ensureSessionFinalized(controller, finishOnce)
    ensureSessionFinalized(controller, finishOnce)
    expect(finishOnce).toHaveBeenCalledTimes(1)
  })
})
