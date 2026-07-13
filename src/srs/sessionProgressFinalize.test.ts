/**
 * FC-09 修补：会话完成一次性 finalize
 * F2-04 review：pending 重入后 reopen finalize（progress 不清零）
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  createSessionFinalizeController,
  ensureSessionFinalized,
  peekFinalizedSessionStats,
  reopenSessionFinalizeIfNeeded,
  resetSessionFinalizeController,
  shouldReopenSessionFinalizeAfterPendingAppend
} from "./sessionProgressFinalize"
import {
  createInitialProgressState,
  generateStatsSummary,
  recordEffectiveGrade,
  serializeProgressState,
  type SessionProgressState,
  type SessionStatsSummary
} from "./sessionProgressTracker"
import {
  autoSaveSessionProgress,
  clearSessionProgressKey,
  getRegisteredSessionProgressKeys,
  registerSessionProgressKey,
  resetSessionProgressKeyRegistryForTests,
  resumeSessionProgressAutosave,
  unregisterSessionProgressKey,
  type StorageLike
} from "./sessionProgressStorage"

type FakeStats = { totalReviewed: number; id: string }

function makeStats(id: string, totalReviewed = 3): FakeStats {
  return { id, totalReviewed }
}

function createMemoryStorage(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    }
  }
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

describe("F2-04 shouldReopenSessionFinalizeAfterPendingAppend", () => {
  it("仅当完成态且实际追加 >0 时 reopen", () => {
    expect(
      shouldReopenSessionFinalizeAfterPendingAppend({
        wasSessionComplete: true,
        actuallyAppendedCount: 1
      })
    ).toBe(true)
    expect(
      shouldReopenSessionFinalizeAfterPendingAppend({
        wasSessionComplete: true,
        actuallyAppendedCount: 0
      })
    ).toBe(false)
    expect(
      shouldReopenSessionFinalizeAfterPendingAppend({
        wasSessionComplete: false,
        actuallyAppendedCount: 2
      })
    ).toBe(false)
  })
})

describe("F2-04 pending requeue reopen finalize harness", () => {
  /**
   * 纯 harness：模拟 Demo 完成 → pending 实际追加 reopen → 重入评分 → 再 finalize。
   * progress 不清零；未实际追加不重置摘要。
   */
  function harnessSessionWithProgress() {
    let progress: SessionProgressState = createInitialProgressState()
    const controller = createSessionFinalizeController<SessionStatsSummary>()
    let sessionStats: SessionStatsSummary | null = null
    let storageActive = true

    const finishOnce = (): SessionStatsSummary => {
      storageActive = false
      return generateStatsSummary(progress, Date.now())
    }

    return {
      get progress() {
        return progress
      },
      get storageActive() {
        return storageActive
      },
      get sessionStats() {
        return sessionStats
      },
      get controller() {
        return controller
      },
      grade(grade: "again" | "hard" | "good" | "easy", ms = 1000) {
        progress = recordEffectiveGrade(progress, grade, ms)
      },
      completeIfNeeded(isSessionComplete: boolean) {
        if (!isSessionComplete) return
        if (sessionStats != null) return
        sessionStats = ensureSessionFinalized(controller, finishOnce)
      },
      /** 模拟 pending wake 提交结果 */
      onPendingAppend(params: {
        wasSessionComplete: boolean
        actuallyAppendedCount: number
      }) {
        const reopened = reopenSessionFinalizeIfNeeded(controller, params)
        if (reopened) {
          sessionStats = null
          storageActive = true // resumeSessionPersistence
        }
        return reopened
      },
      finalizeAgain(isSessionComplete: boolean) {
        if (!isSessionComplete) return sessionStats
        if (sessionStats != null) return sessionStats
        sessionStats = ensureSessionFinalized(controller, finishOnce)
        return sessionStats
      }
    }
  }

  it("评分1次 → 第一次 finalize totalReviewed=1；实际追加 reopen 后 progress 不归零；再评分 → 第二次 totalReviewed=2", () => {
    const h = harnessSessionWithProgress()
    h.grade("again", 500)
    h.completeIfNeeded(true)
    expect(h.sessionStats?.totalReviewed).toBe(1)
    expect(h.controller.finalized).toBe(true)
    expect(h.storageActive).toBe(false)
    expect(h.progress.totalGradedCards).toBe(1)

    const reopened = h.onPendingAppend({
      wasSessionComplete: true,
      actuallyAppendedCount: 1
    })
    expect(reopened).toBe(true)
    expect(h.sessionStats).toBeNull()
    expect(h.controller.finalized).toBe(false)
    expect(h.progress.totalGradedCards).toBe(1) // 不清零
    expect(h.storageActive).toBe(true) // resume autosave

    h.grade("good", 800)
    expect(h.progress.totalGradedCards).toBe(2)

    const second = h.finalizeAgain(true)
    expect(second?.totalReviewed).toBe(2)
    expect(h.sessionStats?.totalReviewed).toBe(2)
    expect(h.sessionStats?.gradeDistribution.again).toBe(1)
    expect(h.sessionStats?.gradeDistribution.good).toBe(1)
  })

  it("wake 未实际追加时不重置已完成摘要", () => {
    const h = harnessSessionWithProgress()
    h.grade("hard", 300)
    h.completeIfNeeded(true)
    const first = h.sessionStats
    expect(first?.totalReviewed).toBe(1)

    const reopened = h.onPendingAppend({
      wasSessionComplete: true,
      actuallyAppendedCount: 0
    })
    expect(reopened).toBe(false)
    expect(h.sessionStats).toBe(first)
    expect(h.controller.finalized).toBe(true)
    expect(h.storageActive).toBe(false)

    // 即使用户误调 complete，仍返回第一次缓存
    const again = h.finalizeAgain(true)
    expect(again).toBe(first)
    expect(again?.totalReviewed).toBe(1)
  })

  it("非完成态追加不 reopen", () => {
    const h = harnessSessionWithProgress()
    h.grade("good", 100)
    // 未 complete
    expect(
      h.onPendingAppend({ wasSessionComplete: false, actuallyAppendedCount: 1 })
    ).toBe(false)
    expect(h.controller.finalized).toBe(false)
    expect(h.sessionStats).toBeNull()
  })
})

describe("F2-04 resumeSessionProgressAutosave（不清零 state）", () => {
  beforeEach(() => {
    resetSessionProgressKeyRegistryForTests()
  })
  afterEach(() => {
    resetSessionProgressKeyRegistryForTests()
  })

  it("finish 清 key 后 resume 重写同一 progress，不改内容", () => {
    const storage = createMemoryStorage()
    const key = "srs-session-progress:v2:test-reopen"
    let progress = createInitialProgressState()
    progress = recordEffectiveGrade(progress, "again", 1000)
    const serialized = serializeProgressState(progress)

    registerSessionProgressKey(key)
    autoSaveSessionProgress(storage, key, serialized)
    expect(storage.getItem(key)).toBe(serialized)

    // 模拟 finishSession：清 key + unregister
    clearSessionProgressKey(storage, key)
    unregisterSessionProgressKey(key)
    expect(storage.getItem(key)).toBeNull()
    expect(getRegisteredSessionProgressKeys()).not.toContain(key)

    // resume：重新登记并写回，progress 对象未变
    const ok = resumeSessionProgressAutosave(storage, key, serialized)
    expect(ok).toBe(true)
    expect(getRegisteredSessionProgressKeys()).toContain(key)
    expect(storage.getItem(key)).toBe(serialized)

    // 再评分后的序列化应能覆盖（同一会话累计）
    progress = recordEffectiveGrade(progress, "good", 200)
    const next = serializeProgressState(progress)
    resumeSessionProgressAutosave(storage, key, next)
    expect(storage.getItem(key)).toBe(next)
    expect(progress.totalGradedCards).toBe(2)
  })
})
