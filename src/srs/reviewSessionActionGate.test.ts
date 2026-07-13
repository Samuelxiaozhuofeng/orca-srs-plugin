import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  canCommitSessionAction,
  createReviewSessionActionGate,
  decideAdvanceAfterDelay,
  simulateSameTickAcquires,
  type SessionActionToken
} from "./reviewSessionActionGate"

describe("reviewSessionActionGate", () => {
  describe("同 tick 双 acquire", () => {
    it("同动作双击只有第一次成功", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")

      const first = gate.acquire("card:A", "grade")
      const second = gate.acquire("card:A", "grade")

      expect(first).not.toBeNull()
      expect(first!.id).toBe(1)
      expect(second).toBeNull()
      expect(gate.locked).toBe(true)
      expect(gate.heldActionKind).toBe("grade")
    })

    it("simulateSameTickAcquires 仅首个非 null", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const results = simulateSameTickAcquires(gate, "card:A", [
        "grade",
        "grade",
        "grade"
      ])
      expect(results[0]).not.toBeNull()
      expect(results[1]).toBeNull()
      expect(results[2]).toBeNull()
    })
  })

  describe("交叉动作", () => {
    it("grade 锁持有时 postpone / suspend 均失败", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      expect(gate.acquire("card:A", "grade")).not.toBeNull()

      expect(gate.acquire("card:A", "postpone")).toBeNull()
      expect(gate.acquire("card:A", "suspend")).toBeNull()
      expect(gate.heldActionKind).toBe("grade")
    })

    it("postpone 持有时 grade 失败", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      expect(gate.acquire("card:A", "postpone")).not.toBeNull()
      expect(gate.acquire("card:A", "grade")).toBeNull()
    })
  })

  describe("键盘重复等价", () => {
    it("连续重复 grade 只有第一次成功", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      // 等价于 keydown 自动重复：同 tick 或紧邻多次 onGrade
      const tokens = Array.from({ length: 5 }, () =>
        gate.acquire("card:A", "grade")
      )
      expect(tokens.filter((t) => t != null)).toHaveLength(1)
      expect(tokens[0]!.id).toBeGreaterThan(0)
    })
  })

  describe("失败后 release 可重试", () => {
    it("async 失败 release 后可重新 acquire", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const t1 = gate.acquire("card:A", "grade")!
      expect(gate.locked).toBe(true)

      // 模拟 await 失败
      expect(gate.release(t1)).toBe(true)
      expect(gate.locked).toBe(false)
      expect(gate.isValid(t1)).toBe(false)

      const t2 = gate.acquire("card:A", "grade")
      expect(t2).not.toBeNull()
      expect(t2!.id).toBeGreaterThan(t1.id)
    })

    it("release 不匹配 token 无效", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const t1 = gate.acquire("card:A", "grade")!
      const forged: SessionActionToken = {
        id: t1.id + 99,
        cardKey: "card:A",
        actionKind: "grade"
      }
      expect(gate.release(forged)).toBe(false)
      expect(gate.locked).toBe(true)
    })
  })

  describe("成功后 250ms 切卡前仍锁定", () => {
    it("complete 前第二次动作失败；complete 后可换卡 acquire", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!

      // 评分副作用已提交，但尚未切卡：仍持锁
      expect(canCommitSessionAction(gate, token)).toBe(true)
      expect(gate.acquire("card:A", "grade")).toBeNull()
      expect(gate.acquire("card:A", "postpone")).toBeNull()

      // timer 触发：校验 → complete → 切卡
      expect(decideAdvanceAfterDelay(gate, token)).toBe("advance")
      expect(gate.complete(token)).toBe(true)
      expect(gate.locked).toBe(false)
      expect(gate.isValid(token)).toBe(false)

      gate.bindCard("card:B")
      const next = gate.acquire("card:B", "grade")
      expect(next).not.toBeNull()
      expect(gate.isValid(token)).toBe(false)
    })

    it("fake timer：250ms 窗口内拒绝第二次；到时后 complete 才解锁", () => {
      vi.useFakeTimers()
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!

      let advanced = false
      const timer = setTimeout(() => {
        if (decideAdvanceAfterDelay(gate, token) !== "advance") return
        if (!gate.complete(token)) return
        advanced = true
        gate.bindCard("card:B")
      }, 250)

      // 窗口内
      expect(gate.acquire("card:A", "grade")).toBeNull()
      expect(advanced).toBe(false)

      vi.advanceTimersByTime(249)
      expect(gate.acquire("card:A", "suspend")).toBeNull()
      expect(advanced).toBe(false)

      vi.advanceTimersByTime(1)
      expect(advanced).toBe(true)
      expect(gate.locked).toBe(false)
      expect(gate.acquire("card:B", "grade")).not.toBeNull()

      clearTimeout(timer)
      vi.useRealTimers()
    })
  })

  describe("旧 Promise 不得推进新卡", () => {
    it("卡片 A token 在切到 B 后失效，A 完成不能 commit B", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const tokenA = gate.acquire("card:A", "grade")!

      // 用户跳过 / 返回 / 自动剔除 → 身份变为 B
      gate.bindCard("card:B")
      expect(gate.isValid(tokenA)).toBe(false)
      expect(canCommitSessionAction(gate, tokenA)).toBe(false)
      expect(decideAdvanceAfterDelay(gate, tokenA)).toBe("stale")
      expect(gate.complete(tokenA)).toBe(false)

      // B 可正常 acquire
      const tokenB = gate.acquire("card:B", "grade")
      expect(tokenB).not.toBeNull()
      expect(canCommitSessionAction(gate, tokenB!)).toBe(true)
      // A 仍不能
      expect(canCommitSessionAction(gate, tokenA)).toBe(false)
    })

    it("invalidate 后旧 token 安静失效", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "postpone")!
      gate.invalidate()
      expect(gate.locked).toBe(false)
      expect(gate.isValid(token)).toBe(false)
      expect(decideAdvanceAfterDelay(gate, token)).toBe("stale")
    })
  })

  describe("旧延迟 timer 在导航/卸载后失效", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function scheduleAdvance(
      gate: ReturnType<typeof createReviewSessionActionGate>,
      token: SessionActionToken,
      onAdvance: () => void
    ) {
      return setTimeout(() => {
        if (decideAdvanceAfterDelay(gate, token) !== "advance") return
        if (!gate.complete(token)) return
        onAdvance()
      }, 250)
    }

    it("返回上一张（bind 旧卡）后 timer 不推进", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!
      let advanced = false
      scheduleAdvance(gate, token, () => {
        advanced = true
      })

      // 返回上一张：绑定到 history 中的卡（或同卡只读）
      gate.invalidate()
      gate.bindCard("card:prev")

      vi.advanceTimersByTime(250)
      expect(advanced).toBe(false)
    })

    it("跳过后 timer 不推进", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!
      let advanced = false
      scheduleAdvance(gate, token, () => {
        advanced = true
      })

      gate.invalidate()
      gate.bindCard("card:B") // 跳过后的下一张

      vi.advanceTimersByTime(250)
      expect(advanced).toBe(false)
    })

    it("只读继续后 timer 不推进", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!
      let advanced = false
      scheduleAdvance(gate, token, () => {
        advanced = true
      })

      // continueFromReadOnly 换到后续索引身份
      gate.invalidate()
      gate.bindCard("card:next")

      vi.advanceTimersByTime(250)
      expect(advanced).toBe(false)
    })

    it("卸载 invalidate 后 timer 不推进", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!
      let advanced = false
      scheduleAdvance(gate, token, () => {
        advanced = true
      })

      // unmount
      gate.invalidate()
      gate.bindCard(null)

      vi.advanceTimersByTime(250)
      expect(advanced).toBe(false)
    })
  })

  describe("repeat / auxiliary 同样只能推进一次", () => {
    it("repeat_grade 双触发只有一次", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:R")
      const a = gate.acquire("card:R", "repeat_grade")
      const b = gate.acquire("card:R", "repeat_grade")
      expect(a).not.toBeNull()
      expect(b).toBeNull()
    })

    it("auxiliary_grade 与 grade 互斥", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:L")
      expect(gate.acquire("card:L", "auxiliary_grade")).not.toBeNull()
      expect(gate.acquire("card:L", "grade")).toBeNull()
      expect(gate.acquire("card:L", "auxiliary_grade")).toBeNull()
    })
  })

  describe("bindCard 同卡不误清锁", () => {
    it("同一 cardKey 重复 bind 不释放 in-flight", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const token = gate.acquire("card:A", "grade")!
      gate.bindCard("card:A")
      expect(gate.isValid(token)).toBe(true)
      expect(gate.locked).toBe(true)
    })
  })

  describe("token 单调唯一", () => {
    it("多次 acquire/release 的 id 严格递增且不复用", () => {
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:A")
      const ids: number[] = []
      for (let i = 0; i < 5; i++) {
        const t = gate.acquire("card:A", "grade")!
        ids.push(t.id)
        gate.release(t)
      }
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]!).toBeGreaterThan(ids[i - 1]!)
      }
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe("会话 harness：旧 Promise 完成不写新卡状态", () => {
    it("模拟 A 的 grade Promise 完成后不推进 B 的 index/history", () => {
      type HarnessState = {
        index: number
        cardKeys: string[]
        history: string[]
        lastLog: string | null
        reviewedCount: number
      }

      const state: HarnessState = {
        index: 0,
        cardKeys: ["card:A", "card:B"],
        history: [],
        lastLog: null,
        reviewedCount: 0
      }

      const gate = createReviewSessionActionGate()
      const currentKey = () => state.cardKeys[state.index] ?? null

      gate.bindCard(currentKey())
      const tokenA = gate.acquire("card:A", "grade")!

      // 模拟用户在 A 的 await 期间跳过到 B
      gate.invalidate()
      state.index = 1
      gate.bindCard(currentKey())

      // A 的 Promise 完成
      if (canCommitSessionAction(gate, tokenA)) {
        state.lastLog = "graded A"
        state.history.push("grade:A")
        state.reviewedCount += 1
        // 不应走到这里
      }
      // timer 也不应推进
      if (decideAdvanceAfterDelay(gate, tokenA) === "advance" && gate.complete(tokenA)) {
        state.index += 1
      }

      expect(state.index).toBe(1)
      expect(state.history).toEqual([])
      expect(state.lastLog).toBeNull()
      expect(state.reviewedCount).toBe(0)

      // B 可评分一次
      const tokenB = gate.acquire("card:B", "grade")!
      expect(canCommitSessionAction(gate, tokenB)).toBe(true)
      state.lastLog = "graded B"
      state.history.push("grade:B")
      state.reviewedCount += 1
      expect(gate.complete(tokenB)).toBe(true)
      state.index += 1
      gate.bindCard(currentKey())

      expect(state.history).toEqual(["grade:B"])
      expect(state.reviewedCount).toBe(1)
      expect(state.index).toBe(2)
    })

    it("repeat/auxiliary harness 只推进一次", () => {
      let advances = 0
      const gate = createReviewSessionActionGate()
      gate.bindCard("card:R")

      const tryAdvance = (kind: "repeat_grade" | "auxiliary_grade") => {
        const t = gate.acquire("card:R", kind)
        if (!t) return false
        if (!canCommitSessionAction(gate, t)) return false
        advances += 1
        // 成功后保持锁至 timer
        setTimeout(() => {
          if (decideAdvanceAfterDelay(gate, t) === "advance") {
            gate.complete(t)
          }
        }, 250)
        return true
      }

      vi.useFakeTimers()
      expect(tryAdvance("repeat_grade")).toBe(true)
      expect(tryAdvance("repeat_grade")).toBe(false)
      expect(tryAdvance("auxiliary_grade")).toBe(false)
      expect(advances).toBe(1)
      vi.advanceTimersByTime(250)
      expect(gate.locked).toBe(false)
      vi.useRealTimers()
    })
  })
})
