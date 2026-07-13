/**
 * FC-01：会话正式根卡额度、跨会话每日日志累计与子卡不计额度规则
 */
import { describe, expect, it, vi, afterEach } from "vitest"
import type { ReviewCard, ReviewLogEntry } from "./types"
import {
  acceptFormalRoot,
  computeRemainingDailyLimits,
  countUsedDailyQuotasFromLogs,
  createSessionRootCardBudget,
  filterAndAcceptNewFormalRoots,
  getLocalTodayBounds,
  isFormalRootAccepted,
  remainingDailyLimitsFromLogs,
  remainingNewSlots,
  remainingReviewSlots,
  resolveDailyQueueLimits,
  stableCardKeyFromReviewLog,
  takeFormalRootsWithinBudget
} from "./reviewSessionBudget"
import { buildReviewQueue } from "./cardCollector"
import { cardKeyFromReviewCard } from "./cardIdentity"

function srs(overrides: Partial<ReviewCard["srs"]> = {}): ReviewCard["srs"] {
  return {
    stability: 1,
    difficulty: 5,
    interval: 1,
    due: new Date("2020-01-01T00:00:00Z"),
    lastReviewed: new Date("2019-01-01T00:00:00Z"),
    reps: 1,
    lapses: 0,
    ...overrides
  }
}

function card(partial: Partial<ReviewCard> & { id: number }): ReviewCard {
  return {
    front: "Q",
    back: "A",
    srs: srs(),
    isNew: false,
    deck: "A",
    cardType: "basic",
    ...partial
  }
}

describe("createSessionRootCardBudget", () => {
  it("limits null → null budget（fixed 不限额）", () => {
    expect(createSessionRootCardBudget(null)).toBeNull()
    expect(createSessionRootCardBudget(undefined)).toBeNull()
  })

  it("初始正式根卡 seed 计入已接纳", () => {
    const roots = [
      card({ id: 1, isNew: true, srs: srs({ lastReviewed: null, reps: 0 }) }),
      card({ id: 2, isNew: false })
    ]
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 30, reviewCardsPerDay: 200 },
      roots
    )!
    expect(remainingNewSlots(budget)).toBe(29)
    expect(remainingReviewSlots(budget)).toBe(199)
    expect(isFormalRootAccepted(budget, roots[0])).toBe(true)
    expect(isFormalRootAccepted(budget, roots[1])).toBe(true)
  })
})

describe("child cards do not consume formal-root budget", () => {
  it("子卡不进入 formal root 限额：仅对已选根卡展开的语义用预算集合表达", () => {
    // 正式根卡限额 1 旧；子卡即便出现在展开队列中也不应被 accept 进预算
    const root = card({ id: 1 })
    const child = card({ id: 2 })
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 0, reviewCardsPerDay: 1 },
      [root]
    )!

    // 只有已选根卡计额度；子卡若误当作正式根追加会失败（额度 0）
    expect(acceptFormalRoot(budget, child)).toBe(false)
    expect(remainingReviewSlots(budget)).toBe(0)

    // 展开后的队列可包含子卡，但不改变 accepted 集合
    const expandedQueue = [root, child]
    expect(expandedQueue).toHaveLength(2)
    expect(budget.acceptedReviewKeys.size).toBe(1)
    expect(budget.acceptedReviewKeys.has(cardKeyFromReviewCard(root))).toBe(true)
    expect(budget.acceptedReviewKeys.has(cardKeyFromReviewCard(child))).toBe(false)
  })

  it("额外根卡不能因「子卡路径」绕过限额进入 accepted", () => {
    const rootA = card({ id: 1 })
    const extraRoot = card({ id: 99 })
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 0, reviewCardsPerDay: 1 },
      [rootA]
    )!
    // 模拟：只有 rootA 被选入；extraRoot 试图动态进入
    const appended = filterAndAcceptNewFormalRoots(
      [extraRoot],
      new Set([cardKeyFromReviewCard(rootA)]),
      budget
    )
    expect(appended).toEqual([])
  })

  it("buildReviewQueue 限额后子卡展开输入仅含已选根（无额外根）", () => {
    const many = Array.from({ length: 5 }, (_, i) => card({ id: i + 1 }))
    const formalRoots = buildReviewQueue(many, {
      newCardsPerDay: 0,
      reviewCardsPerDay: 2
    })
    expect(formalRoots.map((c) => c.id)).toEqual([1, 2])
    // 展开只应对 formalRoots 调用，故 3/4/5 不会作为根进入
    expect(formalRoots.every((c) => c.id <= 2)).toBe(true)
  })
})

describe("takeFormalRootsWithinBudget", () => {
  it("按相对顺序截取直到额度用尽", () => {
    const budget = createSessionRootCardBudget({
      newCardsPerDay: 1,
      reviewCardsPerDay: 2
    })!
    const candidates = [
      card({ id: 1 }),
      card({ id: 2 }),
      card({ id: 3 }),
      card({
        id: 10,
        isNew: true,
        srs: srs({ lastReviewed: null, reps: 0 })
      }),
      card({
        id: 11,
        isNew: true,
        srs: srs({ lastReviewed: null, reps: 0 })
      })
    ]
    const taken = takeFormalRootsWithinBudget(candidates, budget)
    expect(taken.map((c) => c.id)).toEqual([1, 2, 10])
    expect(remainingReviewSlots(budget)).toBe(0)
    expect(remainingNewSlots(budget)).toBe(0)
  })
})

describe("resolveDailyQueueLimits console.warn", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("默认路径调用 console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const r = resolveDailyQueueLimits(-1, Number.NaN)
    expect(r.usedDefaults).toBe(true)
    expect(spy).toHaveBeenCalled()
    expect(r.newCardsPerDay).toBe(30)
    expect(r.reviewCardsPerDay).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// 跨会话每日额度：按今日日志累计 used / remaining
// ---------------------------------------------------------------------------

function logEntry(
  partial: Partial<ReviewLogEntry> &
    Pick<ReviewLogEntry, "id" | "cardId" | "deckName" | "previousState">
): ReviewLogEntry {
  return {
    timestamp: Date.now(),
    grade: "good",
    duration: 1000,
    previousInterval: 0,
    newInterval: 1,
    newState: partial.previousState === "new" ? "learning" : "review",
    ...partial
  }
}

describe("stableCardKeyFromReviewLog", () => {
  it("优先使用已有 cardKey（含 legacy 归一化）", () => {
    expect(
      stableCardKeyFromReviewLog(
        logEntry({
          id: "1",
          cardId: 10,
          deckName: "A",
          previousState: "new",
          cardKey: "legacy:10",
          legacy: true
        })
      )
    ).toBe("legacy:10")
    expect(
      stableCardKeyFromReviewLog(
        logEntry({
          id: "2",
          cardId: 20,
          deckName: "A",
          previousState: "review",
          cardKey: "cloze:20:c1",
          cardType: "cloze",
          blockId: 20,
          clozeNumber: 1,
          legacy: false
        })
      )
    ).toBe("cloze:20:c1")
  })

  it("缺 cardKey 时归一化为 legacy:{cardId}", () => {
    expect(
      stableCardKeyFromReviewLog(
        logEntry({
          id: "3",
          cardId: 99,
          deckName: "A",
          previousState: "new"
        })
      )
    ).toBe("legacy:99")
  })
})

describe("countUsedDailyQuotasFromLogs", () => {
  it("新卡按 cardKey 去重：同一身份多次评分只消耗 1 个新卡额度", () => {
    const logs = [
      logEntry({
        id: "n1",
        cardId: 1,
        cardKey: "basic:1",
        deckName: "JP",
        previousState: "new",
        grade: "again"
      }),
      logEntry({
        id: "n2",
        cardId: 1,
        cardKey: "basic:1",
        deckName: "JP",
        previousState: "new",
        grade: "good"
      }),
      logEntry({
        id: "n3",
        cardId: 2,
        cardKey: "basic:2",
        deckName: "JP",
        previousState: "new"
      })
    ]
    const usage = countUsedDailyQuotasFromLogs(logs)
    expect(usage.usedNew).toBe(2)
    expect(usage.usedReview).toBe(0)
    expect([...usage.newKeys].sort()).toEqual(["basic:1", "basic:2"])
  })

  it("旧卡重复评分按 cardKey 去重：只消耗 1 个旧卡额度", () => {
    const logs = [
      logEntry({
        id: "r1",
        cardId: 5,
        cardKey: "basic:5",
        deckName: "JP",
        previousState: "review",
        grade: "again"
      }),
      logEntry({
        id: "r2",
        cardId: 5,
        cardKey: "basic:5",
        deckName: "JP",
        previousState: "relearning",
        grade: "hard"
      }),
      logEntry({
        id: "r3",
        cardId: 5,
        cardKey: "basic:5",
        deckName: "JP",
        previousState: "learning",
        grade: "good"
      })
    ]
    const usage = countUsedDailyQuotasFromLogs(logs)
    expect(usage.usedNew).toBe(0)
    expect(usage.usedReview).toBe(1)
  })

  it("同身份当天同时有新卡与旧卡记录时，只计新卡", () => {
    const logs = [
      logEntry({
        id: "a",
        cardId: 7,
        cardKey: "basic:7",
        deckName: "JP",
        previousState: "new",
        grade: "good"
      }),
      logEntry({
        id: "b",
        cardId: 7,
        cardKey: "basic:7",
        deckName: "JP",
        previousState: "learning",
        grade: "good"
      }),
      logEntry({
        id: "c",
        cardId: 8,
        cardKey: "basic:8",
        deckName: "JP",
        previousState: "review"
      })
    ]
    const usage = countUsedDailyQuotasFromLogs(logs)
    expect(usage.usedNew).toBe(1)
    expect(usage.usedReview).toBe(1)
    expect(usage.newKeys.has("basic:7")).toBe(true)
    expect(usage.reviewKeys.has("basic:7")).toBe(false)
    expect(usage.reviewKeys.has("basic:8")).toBe(true)
  })

  it("指定 deckName 只统计同名牌组日志", () => {
    const logs = [
      logEntry({
        id: "1",
        cardId: 1,
        cardKey: "basic:1",
        deckName: "DeckA",
        previousState: "new"
      }),
      logEntry({
        id: "2",
        cardId: 2,
        cardKey: "basic:2",
        deckName: "DeckB",
        previousState: "new"
      }),
      logEntry({
        id: "3",
        cardId: 3,
        cardKey: "basic:3",
        deckName: "DeckA",
        previousState: "review"
      }),
      logEntry({
        id: "4",
        cardId: 4,
        cardKey: "basic:4",
        deckName: "DeckB",
        previousState: "review"
      })
    ]
    const onlyA = countUsedDailyQuotasFromLogs(logs, { deckName: "DeckA" })
    expect(onlyA.usedNew).toBe(1)
    expect(onlyA.usedReview).toBe(1)
    expect([...onlyA.newKeys]).toEqual(["basic:1"])
    expect([...onlyA.reviewKeys]).toEqual(["basic:3"])

    const all = countUsedDailyQuotasFromLogs(logs)
    expect(all.usedNew).toBe(2)
    expect(all.usedReview).toBe(2)
  })

  it("兼容 legacy 归一化 identity：缺 cardKey 与 legacy:id 视为同一身份", () => {
    const logs = [
      logEntry({
        id: "legacy1",
        cardId: 42,
        deckName: "Old",
        previousState: "new"
        // 无 cardKey
      }),
      logEntry({
        id: "legacy2",
        cardId: 42,
        cardKey: "legacy:42",
        legacy: true,
        deckName: "Old",
        previousState: "new",
        grade: "again"
      })
    ]
    const usage = countUsedDailyQuotasFromLogs(logs)
    expect(usage.usedNew).toBe(1)
    expect([...usage.newKeys]).toEqual(["legacy:42"])
  })

  it("空日志 → used 为 0", () => {
    const usage = countUsedDailyQuotasFromLogs([])
    expect(usage.usedNew).toBe(0)
    expect(usage.usedReview).toBe(0)
  })
})

describe("computeRemainingDailyLimits / remainingDailyLimitsFromLogs", () => {
  it("remaining = max(0, configured - used)，不可为负", () => {
    const remaining = computeRemainingDailyLimits(
      { newCardsPerDay: 1, reviewCardsPerDay: 3 },
      { usedNew: 5, usedReview: 1 }
    )
    expect(remaining.newCardsPerDay).toBe(0)
    expect(remaining.reviewCardsPerDay).toBe(2)
    expect(remaining.usedNew).toBe(5)
    expect(remaining.usedReview).toBe(1)
  })

  it("used 为 0 时 remaining 等于 configured", () => {
    const remaining = computeRemainingDailyLimits(
      { newCardsPerDay: 30, reviewCardsPerDay: 200 },
      { usedNew: 0, usedReview: 0 }
    )
    expect(remaining.newCardsPerDay).toBe(30)
    expect(remaining.reviewCardsPerDay).toBe(200)
  })

  it("remainingDailyLimitsFromLogs 组合 used + remaining", () => {
    const logs = [
      logEntry({
        id: "1",
        cardId: 1,
        cardKey: "basic:1",
        deckName: "JP",
        previousState: "new"
      }),
      logEntry({
        id: "2",
        cardId: 2,
        cardKey: "basic:2",
        deckName: "JP",
        previousState: "review"
      }),
      logEntry({
        id: "3",
        cardId: 3,
        cardKey: "basic:3",
        deckName: "EN",
        previousState: "new"
      })
    ]
    const remaining = remainingDailyLimitsFromLogs(
      { newCardsPerDay: 5, reviewCardsPerDay: 10 },
      logs,
      { deckName: "JP" }
    )
    expect(remaining.usedNew).toBe(1)
    expect(remaining.usedReview).toBe(1)
    expect(remaining.newCardsPerDay).toBe(4)
    expect(remaining.reviewCardsPerDay).toBe(9)
  })

  it("剩余额度可直接 seed 会话 budget（动态追加不得绕过）", () => {
    const remaining = computeRemainingDailyLimits(
      { newCardsPerDay: 1, reviewCardsPerDay: 2 },
      { usedNew: 1, usedReview: 0 }
    )
    // 会话冻结 remaining：新卡额度 0，旧卡 2
    const budget = createSessionRootCardBudget(remaining)!
    expect(remainingNewSlots(budget)).toBe(0)
    expect(remainingReviewSlots(budget)).toBe(2)

    const newCard = card({
      id: 99,
      isNew: true,
      srs: srs({ lastReviewed: null, reps: 0 })
    })
    expect(acceptFormalRoot(budget, newCard)).toBe(false)

    const reviewCard = card({ id: 1 })
    expect(acceptFormalRoot(budget, reviewCard)).toBe(true)
    expect(remainingReviewSlots(budget)).toBe(1)
  })
})

describe("getLocalTodayBounds", () => {
  it("start 为本地日 00:00:00.000，end 为传入时刻", () => {
    const now = new Date(2026, 6, 13, 15, 30, 45, 123)
    const { start, end } = getLocalTodayBounds(now)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(13)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
    expect(end).toBe(now)
  })
})
