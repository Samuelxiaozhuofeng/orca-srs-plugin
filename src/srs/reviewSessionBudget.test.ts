/**
 * FC-01：会话正式根卡额度与子卡不计额度规则
 */
import { describe, expect, it, vi, afterEach } from "vitest"
import type { ReviewCard } from "./types"
import {
  acceptFormalRoot,
  createSessionRootCardBudget,
  filterAndAcceptNewFormalRoots,
  isFormalRootAccepted,
  remainingNewSlots,
  remainingReviewSlots,
  resolveDailyQueueLimits,
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
