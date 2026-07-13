/**
 * F2-04：Again/Hard 短期重新入队 — 纯逻辑 + fake timer 回归
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  createAllScope,
  createDeckScope,
  createFixedScope
} from "./reviewSessionScope"
import {
  createSessionRootCardBudget,
  remainingReviewSlots
} from "./reviewSessionBudget"
import {
  activateEmptyPendingDueState,
  commitPendingRequeueToQueue,
  createEmptyPendingDueState,
  deactivateAndClearPending,
  getNearestPendingDueTime,
  getUnprocessedTailCardKeys,
  isPendingWakeTokenCurrent,
  planNextPendingWake,
  processPendingWake,
  removePendingKeys,
  selectDuePendingEntries,
  SHORT_RELEARN_WINDOW_MS,
  shouldTrackFormalShortRelearn,
  sortPendingEntriesForRequeue,
  upsertPendingDueCard
} from "./pendingDueRequeue"

function srs(overrides: Partial<ReviewCard["srs"]> = {}): ReviewCard["srs"] {
  return {
    stability: 1,
    difficulty: 5,
    interval: 0,
    due: new Date("2026-07-13T12:00:00Z"),
    lastReviewed: new Date("2026-07-13T11:00:00Z"),
    reps: 1,
    lapses: 0,
    ...overrides
  }
}

function card(
  partial: Partial<ReviewCard> & { id: number },
  dueMs?: number
): ReviewCard {
  const due = dueMs != null ? new Date(dueMs) : new Date("2026-07-13T12:00:00Z")
  const { srs: srsOverride, ...rest } = partial
  return {
    front: "Q",
    back: "A",
    isNew: false,
    deck: "A",
    cardType: "basic",
    ...rest,
    srs: srs({ due, ...srsOverride })
  }
}

describe("shouldTrackFormalShortRelearn", () => {
  const now = 1_000_000

  it("again/hard 在窗口内 → true", () => {
    expect(
      shouldTrackFormalShortRelearn({
        grade: "again",
        dueTimeMs: now + 60_000,
        nowMs: now
      })
    ).toBe(true)
    expect(
      shouldTrackFormalShortRelearn({
        grade: "hard",
        dueTimeMs: now + SHORT_RELEARN_WINDOW_MS,
        nowMs: now
      })
    ).toBe(true)
  })

  it("good/easy 或超窗口 → false", () => {
    expect(
      shouldTrackFormalShortRelearn({
        grade: "good",
        dueTimeMs: now + 30_000,
        nowMs: now
      })
    ).toBe(false)
    expect(
      shouldTrackFormalShortRelearn({
        grade: "again",
        dueTimeMs: now + SHORT_RELEARN_WINDOW_MS + 1,
        nowMs: now
      })
    ).toBe(false)
  })

  it("repeat / auxiliary 不创建正式 pending", () => {
    expect(
      shouldTrackFormalShortRelearn({
        grade: "again",
        dueTimeMs: now + 30_000,
        nowMs: now,
        isRepeatMode: true
      })
    ).toBe(false)
    expect(
      shouldTrackFormalShortRelearn({
        grade: "hard",
        dueTimeMs: now + 30_000,
        nowMs: now,
        isAuxiliaryPreview: true
      })
    ).toBe(false)
  })
})

describe("upsertPendingDueCard", () => {
  it("幂等 upsert：同 key 覆盖 snapshot/due，generation 递增", () => {
    const now = 1_000_000
    let state = createEmptyPendingDueState()
    const a1 = card({ id: 1, front: "v1" }, now + 120_000)
    const r1 = upsertPendingDueCard(state, a1, now + 120_000, now)
    expect(r1.status).toBe("tracked")
    expect(r1.entry?.generation).toBe(1)
    state = r1.state

    const a2 = card({ id: 1, front: "v2" }, now + 30_000)
    const r2 = upsertPendingDueCard(state, a2, now + 30_000, now)
    expect(r2.status).toBe("tracked")
    expect(r2.entry?.generation).toBe(2)
    expect(r2.entry?.card.front).toBe("v2")
    expect(r2.entry?.dueTime).toBe(now + 30_000)
    expect(r2.state.entries.size).toBe(1)
    expect(r2.needsReschedule).toBe(true)
  })

  it("超窗口 / inactive / invalid due 不写入", () => {
    const now = 1_000_000
    const c = card({ id: 1 }, now + SHORT_RELEARN_WINDOW_MS + 10_000)
    expect(
      upsertPendingDueCard(createEmptyPendingDueState(), c, now + SHORT_RELEARN_WINDOW_MS + 10_000, now)
        .status
    ).toBe("out_of_window")

    const inactive = deactivateAndClearPending(createEmptyPendingDueState())
    expect(
      upsertPendingDueCard(inactive, card({ id: 1 }, now + 10_000), now + 10_000, now)
        .status
    ).toBe("inactive")

    expect(
      upsertPendingDueCard(createEmptyPendingDueState(), card({ id: 1 }), Number.NaN, now)
        .status
    ).toBe("invalid_due")
  })
})

describe("tail-only dedup / requeue", () => {
  it("历史 A 在 currentIndex 之前时仍可追加新 A 到队尾", () => {
    const aHist = card({ id: 1, front: "hist" })
    const b = card({ id: 2 })
    const aNew = card({ id: 1, front: "relearn" })
    // queue: [A_hist, B] currentIndex=1 (on B) → tail empty → A can re-enter
    const result = commitPendingRequeueToQueue([aHist, b], 1, [aNew])
    expect(result.appended).toHaveLength(1)
    expect(result.appended[0].front).toBe("relearn")
    expect(result.queue.map((c) => c.id)).toEqual([1, 2, 1])
    expect(result.skippedInTail).toEqual([])
  })

  it("未处理尾部已有 A 时不重复追加", () => {
    const a = card({ id: 1 })
    const b = card({ id: 2 })
    // queue: [B, A] currentIndex=0 → tail has A
    const result = commitPendingRequeueToQueue([b, a], 0, [card({ id: 1, front: "dup" })])
    expect(result.appended).toEqual([])
    expect(result.skippedInTail).toEqual([cardKeyFromReviewCard(a)])
    expect(result.queue).toHaveLength(2)
  })

  it("getUnprocessedTailCardKeys 不含 currentIndex 及之前", () => {
    const a = card({ id: 1 })
    const b = card({ id: 2 })
    const c = card({ id: 3 })
    const keys = getUnprocessedTailCardKeys([a, b, c], 1)
    expect(keys.has(cardKeyFromReviewCard(a))).toBe(false)
    expect(keys.has(cardKeyFromReviewCard(b))).toBe(false)
    expect(keys.has(cardKeyFromReviewCard(c))).toBe(true)
  })
})

describe("due selection & sorting", () => {
  it("到期前不选出；到期后选出", () => {
    const now = 1_000_000
    let state = createEmptyPendingDueState()
    const a = card({ id: 1 }, now + 60_000)
    state = upsertPendingDueCard(state, a, now + 60_000, now).state

    expect(selectDuePendingEntries(state, now + 59_999)).toEqual([])
    const due = selectDuePendingEntries(state, now + 60_000)
    expect(due).toHaveLength(1)
    expect(due[0].cardKey).toBe(cardKeyFromReviewCard(a))
  })

  it("多卡同到期时间按 cardKey 稳定顺序", () => {
    const t = 5_000
    const c10 = card({ id: 10 }, t)
    const c2 = card({ id: 2 }, t)
    const c5 = card({ id: 5 }, t)
    const entries = sortPendingEntriesForRequeue([
      {
        cardKey: cardKeyFromReviewCard(c10),
        card: c10,
        dueTime: t,
        generation: 1
      },
      {
        cardKey: cardKeyFromReviewCard(c2),
        card: c2,
        dueTime: t,
        generation: 1
      },
      {
        cardKey: cardKeyFromReviewCard(c5),
        card: c5,
        dueTime: t,
        generation: 1
      }
    ])
    expect(entries.map((e) => e.cardKey)).toEqual([
      cardKeyFromReviewCard(c10),
      cardKeyFromReviewCard(c2),
      cardKeyFromReviewCard(c5)
    ].sort())
    // basic:10, basic:2, basic:5 — string sort: basic:10, basic:2, basic:5
    expect(entries.map((e) => e.card.id)).toEqual([10, 2, 5])
  })

  it("dueTime 不同时先按 due 再 key", () => {
    const early = {
      cardKey: "basic:9",
      card: card({ id: 9 }, 100),
      dueTime: 100,
      generation: 1
    }
    const late = {
      cardKey: "basic:1",
      card: card({ id: 1 }, 200),
      dueTime: 200,
      generation: 1
    }
    expect(sortPendingEntriesForRequeue([late, early]).map((e) => e.cardKey)).toEqual([
      "basic:9",
      "basic:1"
    ])
  })
})

describe("timer token / due earlier-later", () => {
  it("due 从晚更新为早：旧 timer token stale，按最新早 due 触发", () => {
    const now = 1_000_000
    let state = createEmptyPendingDueState()
    const c = card({ id: 1 })
    state = upsertPendingDueCard(state, c, now + 120_000, now).state
    const latePlan = planNextPendingWake(state, now)
    state = latePlan.state
    expect(latePlan.plan?.nearestDue).toBe(now + 120_000)
    const lateToken = latePlan.plan!.token

    // update to earlier due
    state = upsertPendingDueCard(state, c, now + 10_000, now).state
    const earlyPlan = planNextPendingWake(state, now)
    state = earlyPlan.state
    expect(earlyPlan.plan?.nearestDue).toBe(now + 10_000)
    const earlyToken = earlyPlan.plan!.token
    expect(earlyToken).not.toBe(lateToken)

    // old late token is stale
    expect(isPendingWakeTokenCurrent(state, lateToken)).toBe(false)
    expect(isPendingWakeTokenCurrent(state, earlyToken)).toBe(true)

    // process with late token does nothing
    const staleResult = processPendingWake({
      state,
      wakeToken: lateToken,
      nowMs: now + 10_000,
      queue: [c],
      currentIndex: 0,
      scope: createAllScope(),
      budget: null
    })
    expect(staleResult.stale).toBe(true)
    expect(staleResult.appended).toEqual([])
    expect(staleResult.state.entries.size).toBe(1)

    // early token at early due appends
    const ok = processPendingWake({
      state,
      wakeToken: earlyToken,
      nowMs: now + 10_000,
      queue: [c],
      currentIndex: 0,
      scope: createAllScope(),
      budget: null
    })
    expect(ok.appended).toHaveLength(1)
    expect(ok.state.entries.size).toBe(0)
  })

  it("due 从早更新为晚：旧 timer 不得提前入队", () => {
    const now = 1_000_000
    let state = createEmptyPendingDueState()
    const c = card({ id: 1 })
    state = upsertPendingDueCard(state, c, now + 10_000, now).state
    const earlyPlan = planNextPendingWake(state, now)
    state = earlyPlan.state
    const earlyToken = earlyPlan.plan!.token

    state = upsertPendingDueCard(state, c, now + 120_000, now).state
    const latePlan = planNextPendingWake(state, now)
    state = latePlan.state

    // old early timer fires at early time — stale
    const r = processPendingWake({
      state,
      wakeToken: earlyToken,
      nowMs: now + 10_000,
      queue: [c],
      currentIndex: 0,
      scope: createAllScope(),
      budget: null
    })
    expect(r.stale).toBe(true)
    expect(r.appended).toEqual([])
    // still pending with late due
    expect(r.state.entries.get(cardKeyFromReviewCard(c))?.dueTime).toBe(
      now + 120_000
    )

    // even if we used current token too early, selectDue won't pick it
    const tooEarly = processPendingWake({
      state: latePlan.state,
      wakeToken: latePlan.plan!.token,
      nowMs: now + 10_000,
      queue: [c],
      currentIndex: 0,
      scope: createAllScope(),
      budget: null
    })
    expect(tooEarly.applied).toBe(true)
    expect(tooEarly.appended).toEqual([])
    expect(tooEarly.state.entries.size).toBe(1)
  })

  it("多次更新只按最新 snapshot/due 触发一次", () => {
    const now = 1_000_000
    let state = createEmptyPendingDueState()
    const key = cardKeyFromReviewCard(card({ id: 7 }))
    for (let i = 1; i <= 5; i++) {
      const snap = card({ id: 7, front: `v${i}` }, now + 50_000 - i * 1000)
      state = upsertPendingDueCard(
        state,
        snap,
        now + 50_000 - i * 1000,
        now
      ).state
    }
    expect(state.entries.size).toBe(1)
    expect(state.entries.get(key)?.card.front).toBe("v5")
    expect(state.entries.get(key)?.generation).toBe(5)

    const plan = planNextPendingWake(state, now)
    state = plan.state
    const result = processPendingWake({
      state,
      wakeToken: plan.plan!.token,
      nowMs: now + 50_000,
      queue: [card({ id: 7, front: "hist" })],
      currentIndex: 0,
      scope: createAllScope(),
      budget: null
    })
    expect(result.appended).toHaveLength(1)
    expect(result.appended[0].front).toBe("v5")
    expect(result.state.entries.size).toBe(0)
  })
})

describe("processPendingWake end-to-end pure", () => {
  it("Again 卡 A 到期后即使历史 A 在 index 前也能入队尾", () => {
    const now = 1_000_000
    const aHist = card({ id: 1, front: "hist" })
    const b = card({ id: 2 })
    let state = createEmptyPendingDueState()
    const aRe = card({ id: 1, front: "again-relearn" }, now + 1000)
    state = upsertPendingDueCard(state, aRe, now + 1000, now).state
    const plan = planNextPendingWake(state, now)
    state = plan.state

    const r = processPendingWake({
      state,
      wakeToken: plan.plan!.token,
      nowMs: now + 1000,
      queue: [aHist, b],
      currentIndex: 1,
      scope: createAllScope(),
      budget: null
    })
    expect(r.appended.map((c) => c.front)).toEqual(["again-relearn"])
    expect(r.queue.map((c) => c.front)).toEqual(["hist", b.front, "again-relearn"])
    expect(r.state.entries.size).toBe(0)
  })

  it("scope 外卡不重入且保留诊断（retain rejected）", () => {
    const now = 1_000_000
    const out = card({ id: 1, deck: "B" }, now)
    let state = createEmptyPendingDueState()
    // simulate already tracked (e.g. edge) then scope is deck A
    state = upsertPendingDueCard(state, out, now, now).state
    const plan = planNextPendingWake(state, now)
    state = plan.state

    const r = processPendingWake({
      state,
      wakeToken: plan.plan!.token,
      nowMs: now,
      queue: [],
      currentIndex: 0,
      scope: createDeckScope("A"),
      budget: null
    })
    expect(r.appended).toEqual([])
    expect(r.retainedRejected).toContain(cardKeyFromReviewCard(out))
    expect(r.state.entries.has(cardKeyFromReviewCard(out))).toBe(true)
    expect(r.diagnostics.some((d) => d.includes("scope/budget"))).toBe(true)
  })

  it("重入不二次消耗 budget；额度 0 时已接纳 key 仍可重入", () => {
    const now = 1_000_000
    const a = card({ id: 1 }, now)
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 0, reviewCardsPerDay: 1 },
      [a]
    )!
    expect(remainingReviewSlots(budget)).toBe(0)

    let state = createEmptyPendingDueState()
    state = upsertPendingDueCard(state, a, now, now).state
    const plan = planNextPendingWake(state, now)
    state = plan.state

    const r = processPendingWake({
      state,
      wakeToken: plan.plan!.token,
      nowMs: now,
      queue: [a],
      currentIndex: 0,
      scope: createAllScope(),
      budget
    })
    expect(r.appended).toHaveLength(1)
    expect(remainingReviewSlots(budget)).toBe(0)
    expect(budget.acceptedReviewKeys.size).toBe(1)
  })

  it("未接纳新 key 仍受额度限制并保留 pending", () => {
    const now = 1_000_000
    const seed = card({ id: 1 })
    const stranger = card({ id: 99 }, now)
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 0, reviewCardsPerDay: 1 },
      [seed]
    )!
    expect(remainingReviewSlots(budget)).toBe(0)

    let state = createEmptyPendingDueState()
    state = upsertPendingDueCard(state, stranger, now, now).state
    const plan = planNextPendingWake(state, now)
    state = plan.state

    const r = processPendingWake({
      state,
      wakeToken: plan.plan!.token,
      nowMs: now,
      queue: [seed],
      currentIndex: 0,
      scope: createAllScope(),
      budget
    })
    expect(r.appended).toEqual([])
    expect(r.retainedRejected).toContain(cardKeyFromReviewCard(stranger))
    expect(r.state.entries.has(cardKeyFromReviewCard(stranger))).toBe(true)
  })

  it("fixed scope 内可重入", () => {
    const now = 1_000_000
    const fixed = card({ id: 3 }, now)
    const scope = createFixedScope([fixed])
    let state = createEmptyPendingDueState()
    state = upsertPendingDueCard(state, fixed, now, now).state
    const plan = planNextPendingWake(state, now)
    const r = processPendingWake({
      state: plan.state,
      wakeToken: plan.plan!.token,
      nowMs: now,
      queue: [fixed],
      currentIndex: 0,
      scope,
      budget: null
    })
    expect(r.appended).toHaveLength(1)
  })
})

describe("deactivate / clear / new round", () => {
  it("完成、关闭、卸载后旧 token 不追加", () => {
    const now = 1_000_000
    let state = createEmptyPendingDueState()
    const c = card({ id: 1 }, now + 1000)
    state = upsertPendingDueCard(state, c, now + 1000, now).state
    const plan = planNextPendingWake(state, now)
    state = plan.state

    state = deactivateAndClearPending(state)
    expect(state.active).toBe(false)
    expect(state.entries.size).toBe(0)
    expect(isPendingWakeTokenCurrent(state, plan.plan!.token)).toBe(false)

    const r = processPendingWake({
      state,
      wakeToken: plan.plan!.token,
      nowMs: now + 1000,
      queue: [c],
      currentIndex: 0,
      scope: createAllScope(),
      budget: null
    })
    expect(r.inactive).toBe(true)
    expect(r.appended).toEqual([])
  })

  it("新轮次 activate 后旧 token 无效", () => {
    let state = createEmptyPendingDueState()
    const now = 1000
    state = upsertPendingDueCard(state, card({ id: 1 }, now + 500), now + 500, now).state
    const plan = planNextPendingWake(state, now)
    state = deactivateAndClearPending(plan.state)
    state = activateEmptyPendingDueState()
    expect(state.active).toBe(true)
    expect(state.entries.size).toBe(0)
    // old token cannot match empty new state token 0 vs old token >=1
    expect(isPendingWakeTokenCurrent(state, plan.plan!.token)).toBe(false)
  })

  it("removePendingKeys 与 getNearestPendingDueTime", () => {
    const now = 0
    let state = createEmptyPendingDueState()
    state = upsertPendingDueCard(state, card({ id: 1 }, 100), 100, now).state
    state = upsertPendingDueCard(state, card({ id: 2 }, 50), 50, now).state
    expect(getNearestPendingDueTime(state)).toBe(50)
    state = removePendingKeys(state, [cardKeyFromReviewCard(card({ id: 2 }))])
    expect(getNearestPendingDueTime(state)).toBe(100)
  })
})

describe("fake timers: schedule / fire semantics", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 模拟 Demo 调度层：唯一 timer + token 校验。
   */
  function createScheduler() {
    let state = createEmptyPendingDueState()
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastAppend: ReviewCard[] = []
    let queue: ReviewCard[] = []
    let currentIndex = 0
    const scope = createAllScope()

    const clearTimer = () => {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
    }

    const reschedule = (nowMs: number) => {
      clearTimer()
      const planned = planNextPendingWake(state, nowMs)
      state = planned.state
      if (!planned.plan) return
      const { token, delayMs } = planned.plan
      timer = setTimeout(() => {
        timer = null
        const r = processPendingWake({
          state,
          wakeToken: token,
          nowMs: Date.now(),
          queue,
          currentIndex,
          scope,
          budget: null
        })
        state = r.state
        if (r.appended.length > 0) {
          queue = r.queue
          lastAppend = r.appended
        }
        if (r.nextNearestDue != null && state.active) {
          reschedule(Date.now())
        }
      }, delayMs)
    }

    return {
      track(c: ReviewCard, dueMs: number) {
        const now = Date.now()
        const up = upsertPendingDueCard(state, c, dueMs, now)
        state = up.state
        if (up.needsReschedule) reschedule(now)
      },
      setQueue(q: ReviewCard[], idx: number) {
        queue = q
        currentIndex = idx
      },
      deactivate() {
        clearTimer()
        state = deactivateAndClearPending(state)
      },
      getState: () => state,
      getQueue: () => queue,
      getLastAppend: () => lastAppend,
      getTimer: () => timer
    }
  }

  it("到期前不追加；到期后追加", () => {
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"))
    const sch = createScheduler()
    const a = card({ id: 1, front: "A" })
    sch.setQueue([a], 0)
    const due = Date.now() + 30_000
    sch.track(card({ id: 1, front: "A-re" }, due), due)

    vi.advanceTimersByTime(29_000)
    expect(sch.getLastAppend()).toEqual([])
    expect(sch.getQueue()).toHaveLength(1)

    vi.advanceTimersByTime(2000 + 500) // due + buffer + min margin
    expect(sch.getLastAppend().map((c) => c.front)).toEqual(["A-re"])
    expect(sch.getQueue()).toHaveLength(2)
  })

  it("due 改晚后旧 timer 不提前入队", () => {
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"))
    const sch = createScheduler()
    sch.setQueue([card({ id: 1 })], 0)
    const early = Date.now() + 10_000
    const late = Date.now() + 60_000
    sch.track(card({ id: 1, front: "early" }, early), early)
    sch.track(card({ id: 1, front: "late" }, late), late)

    vi.advanceTimersByTime(12_000)
    expect(sch.getLastAppend()).toEqual([])
    expect(sch.getState().entries.size).toBe(1)

    vi.advanceTimersByTime(50_000)
    expect(sch.getLastAppend().map((c) => c.front)).toEqual(["late"])
  })

  it("deactivate 后 timer 不追加", () => {
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"))
    const sch = createScheduler()
    sch.setQueue([card({ id: 1 })], 0)
    const due = Date.now() + 5_000
    sch.track(card({ id: 1, front: "x" }, due), due)
    sch.deactivate()
    vi.advanceTimersByTime(20_000)
    expect(sch.getLastAppend()).toEqual([])
    expect(sch.getQueue()).toHaveLength(1)
    expect(sch.getTimer()).toBeNull()
  })
})
