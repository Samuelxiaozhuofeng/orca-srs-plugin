/**
 * FC-01：每日新卡/旧卡正式根卡限额
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "./types"
import {
  applyDailyRootLimits,
  buildReviewQueue,
  interleaveDueAndNew,
  partitionDueAndNewCards
} from "./cardCollector"
import {
  acceptFormalRoot,
  createSessionRootCardBudget,
  isValidDailyCardLimit,
  MAX_DAILY_CARD_LIMIT,
  remainingNewSlots,
  remainingReviewSlots,
  resolveDailyQueueLimits
} from "./reviewSessionBudget"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  createAllScope,
  createDeckScope,
  createFixedScope,
  selectNewDueCardsForSession,
  selectPendingDueCardsForRequeue
} from "./reviewSessionScope"

function baseSrs(overrides: Partial<ReviewCard["srs"]> = {}): ReviewCard["srs"] {
  return {
    stability: 1,
    difficulty: 5,
    interval: 1,
    due: new Date("2020-01-01T00:00:00Z"),
    lastReviewed: new Date("2019-12-01T00:00:00Z"),
    reps: 1,
    lapses: 0,
    ...overrides
  }
}

function dueCard(
  id: number,
  overrides: Partial<ReviewCard> = {}
): ReviewCard {
  return {
    id,
    front: `Q${id}`,
    back: `A${id}`,
    srs: baseSrs(),
    isNew: false,
    deck: "A",
    cardType: "basic",
    ...overrides
  }
}

function newCard(
  id: number,
  overrides: Partial<ReviewCard> = {}
): ReviewCard {
  return {
    id,
    front: `N${id}`,
    back: `A${id}`,
    srs: baseSrs({ lastReviewed: null, reps: 0 }),
    isNew: true,
    deck: "A",
    cardType: "basic",
    ...overrides
  }
}

function rangeCards(
  count: number,
  factory: (id: number) => ReviewCard,
  startId = 1
): ReviewCard[] {
  return Array.from({ length: count }, (_, i) => factory(startId + i))
}

describe("resolveDailyQueueLimits / validation", () => {
  const warns: string[] = []
  const warn = (m: string) => {
    warns.push(m)
  }

  afterEach(() => {
    warns.length = 0
  })

  it("接受有限非负整数", () => {
    const r = resolveDailyQueueLimits(30, 200, { warn })
    expect(r.newCardsPerDay).toBe(30)
    expect(r.reviewCardsPerDay).toBe(200)
    expect(r.usedDefaults).toBe(false)
    expect(r.warnings).toEqual([])
    expect(warns).toEqual([])
  })

  it("接受 0 限额", () => {
    const r = resolveDailyQueueLimits(0, 0, { warn })
    expect(r.newCardsPerDay).toBe(0)
    expect(r.reviewCardsPerDay).toBe(0)
    expect(r.usedDefaults).toBe(false)
  })

  it.each([
    [-1, 200, 30, 200],
    [30, -5, 30, 200],
    [Number.NaN, 200, 30, 200],
    [30, Number.NaN, 30, 200],
    [Number.POSITIVE_INFINITY, 200, 30, 200],
    [30, Number.NEGATIVE_INFINITY, 30, 200],
    [30.5, 200, 30, 200],
    [30, 200.1, 30, 200],
    [MAX_DAILY_CARD_LIMIT + 1, 200, 30, 200],
    [30, MAX_DAILY_CARD_LIMIT + 1, 30, 200],
    ["30" as unknown, 200, 30, 200],
    [null, 200, 30, 200],
    [undefined, 200, 30, 200],
    [Number.NaN, Number.NaN, 30, 200],
    [-3, -9, 30, 200]
  ])(
    "无效值 rawNew=%s rawReview=%s → new=%s review=%s 并发出 warn",
    (rawNew, rawReview, expNew, expReview) => {
      const r = resolveDailyQueueLimits(rawNew, rawReview, { warn })
      expect(r.newCardsPerDay).toBe(expNew)
      expect(r.reviewCardsPerDay).toBe(expReview)
      expect(r.usedDefaults).toBe(true)
      expect(r.warnings.length).toBeGreaterThan(0)
      expect(warns.length).toBeGreaterThan(0)
    }
  )

  it("仅一侧无效时另一侧保留有效值", () => {
    const r = resolveDailyQueueLimits(15, -1, { warn })
    expect(r.newCardsPerDay).toBe(15)
    expect(r.reviewCardsPerDay).toBe(200)
    expect(r.usedDefaults).toBe(true)
  })

  it("isValidDailyCardLimit 边界", () => {
    expect(isValidDailyCardLimit(0)).toBe(true)
    expect(isValidDailyCardLimit(MAX_DAILY_CARD_LIMIT)).toBe(true)
    expect(isValidDailyCardLimit(-0)).toBe(true)
    expect(isValidDailyCardLimit(1.1)).toBe(false)
    expect(isValidDailyCardLimit(MAX_DAILY_CARD_LIMIT + 1)).toBe(false)
  })
})

describe("buildReviewQueue daily limits", () => {
  it("新卡 50 限 30 → 仅 30 张新卡", () => {
    const cards = rangeCards(50, (id) => newCard(id))
    const queue = buildReviewQueue(cards, {
      newCardsPerDay: 30,
      reviewCardsPerDay: 200
    })
    expect(queue).toHaveLength(30)
    expect(queue.every((c) => c.isNew)).toBe(true)
    expect(queue.map((c) => c.id)).toEqual(rangeCards(30, (id) => newCard(id)).map((c) => c.id))
  })

  it("旧卡 300 限 200 → 仅 200 张旧卡", () => {
    const cards = rangeCards(300, (id) => dueCard(id))
    const queue = buildReviewQueue(cards, {
      newCardsPerDay: 30,
      reviewCardsPerDay: 200
    })
    expect(queue).toHaveLength(200)
    expect(queue.every((c) => !c.isNew)).toBe(true)
    expect(queue[0].id).toBe(1)
    expect(queue[199].id).toBe(200)
  })

  it("新旧并存时先截断再 2:1 交织", () => {
    const dues = rangeCards(5, (id) => dueCard(id))
    const news = rangeCards(3, (id) => newCard(id), 100)
    const queue = buildReviewQueue([...dues, ...news], {
      newCardsPerDay: 2,
      reviewCardsPerDay: 4
    })
    // 截断后 due=[1,2,3,4] new=[100,101] → 2:1 → 1,2,100,3,4,101
    expect(queue.map((c) => c.id)).toEqual([1, 2, 100, 3, 4, 101])
  })

  it("0 限额 → 空队列（合法设置，非静默失败）", () => {
    const cards = [...rangeCards(5, (id) => dueCard(id)), ...rangeCards(5, (id) => newCard(id), 50)]
    const queue = buildReviewQueue(cards, {
      newCardsPerDay: 0,
      reviewCardsPerDay: 0
    })
    expect(queue).toEqual([])
  })

  it("limits null 不限额", () => {
    const cards = rangeCards(50, (id) => newCard(id))
    expect(buildReviewQueue(cards, null)).toHaveLength(50)
    expect(buildReviewQueue(cards)).toHaveLength(50)
  })

  it("未到期卡不进入队列", () => {
    const future = dueCard(1, {
      srs: baseSrs({ due: new Date("2099-01-01T00:00:00Z") })
    })
    const futureNew = newCard(2, {
      srs: baseSrs({ due: new Date("2099-01-01T00:00:00Z"), lastReviewed: null, reps: 0 })
    })
    expect(buildReviewQueue([future, futureNew], { newCardsPerDay: 30, reviewCardsPerDay: 200 })).toEqual([])
  })

  it("applyDailyRootLimits / interleave 纯 helper", () => {
    const due = rangeCards(5, (id) => dueCard(id))
    const neu = rangeCards(3, (id) => newCard(id), 10)
    const limited = applyDailyRootLimits(due, neu, {
      newCardsPerDay: 1,
      reviewCardsPerDay: 2
    })
    expect(limited.dueCards.map((c) => c.id)).toEqual([1, 2])
    expect(limited.newCards.map((c) => c.id)).toEqual([10])
    expect(interleaveDueAndNew(limited.dueCards, limited.newCards).map((c) => c.id)).toEqual([
      1, 2, 10
    ])
  })
})

describe("deck-scoped limits", () => {
  it("指定牌组：额度在 deck 过滤后的范围内计算", () => {
    const cards = [
      ...rangeCards(40, (id) => newCard(id, { deck: "A" })),
      ...rangeCards(40, (id) => newCard(id, { deck: "B" }), 100)
    ]
    const deckA = cards.filter((c) => c.deck === "A")
    const queue = buildReviewQueue(deckA, {
      newCardsPerDay: 30,
      reviewCardsPerDay: 200
    })
    expect(queue).toHaveLength(30)
    expect(queue.every((c) => c.deck === "A")).toBe(true)
    expect(queue.every((c) => c.id < 100)).toBe(true)
  })
})

describe("session budget + dynamic append", () => {
  it("动态剩余额度 0 不追加", () => {
    const initial = rangeCards(30, (id) => newCard(id))
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 30, reviewCardsPerDay: 200 },
      initial
    )!
    expect(remainingNewSlots(budget)).toBe(0)

    const more = rangeCards(5, (id) => newCard(id), 100)
    const selected = selectNewDueCardsForSession(
      more,
      initial,
      createAllScope(),
      budget
    )
    expect(selected).toEqual([])
    expect(remainingNewSlots(budget)).toBe(0)
  })

  it("动态追加不可超限", () => {
    const initial = rangeCards(28, (id) => newCard(id))
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 30, reviewCardsPerDay: 200 },
      initial
    )!
    expect(remainingNewSlots(budget)).toBe(2)

    const candidates = rangeCards(10, (id) => newCard(id), 100)
    const selected = selectNewDueCardsForSession(
      candidates,
      initial,
      createAllScope(),
      budget
    )
    expect(selected).toHaveLength(2)
    expect(selected.map((c) => c.id)).toEqual([100, 101])
    expect(remainingNewSlots(budget)).toBe(0)

    // 再次追加仍为 0
    const again = selectNewDueCardsForSession(
      rangeCards(5, (id) => newCard(id), 200),
      [...initial, ...selected],
      createAllScope(),
      budget
    )
    expect(again).toEqual([])
  })

  it("同一卡短期重入不重复消耗额度", () => {
    const card = dueCard(1)
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 30, reviewCardsPerDay: 1 },
      [card]
    )!
    expect(remainingReviewSlots(budget)).toBe(0)

    // 已接纳身份从 pending 重入
    const requeued = selectPendingDueCardsForRequeue(
      [card],
      createAllScope(),
      budget
    )
    expect(requeued).toEqual([card])
    expect(remainingReviewSlots(budget)).toBe(0)
    expect(budget.acceptedReviewKeys.size).toBe(1)

    // 动态路径：不在 existingQueue 时仍不重复消耗（已接纳）
    const selected = selectNewDueCardsForSession(
      [card],
      [],
      createAllScope(),
      budget
    )
    expect(selected).toEqual([card])
    expect(remainingReviewSlots(budget)).toBe(0)
  })

  it("Cloze/Direction 变体独立计额度", () => {
    const c1 = dueCard(10, { cardType: "cloze", clozeNumber: 1 })
    const c2 = dueCard(10, { cardType: "cloze", clozeNumber: 2 })
    const dFwd = dueCard(20, { cardType: "direction", directionType: "forward" })
    const dBwd = dueCard(20, { cardType: "direction", directionType: "backward" })

    expect(cardKeyFromReviewCard(c1)).not.toBe(cardKeyFromReviewCard(c2))
    expect(cardKeyFromReviewCard(dFwd)).not.toBe(cardKeyFromReviewCard(dBwd))

    const budget = createSessionRootCardBudget({
      newCardsPerDay: 0,
      reviewCardsPerDay: 3
    })!
    expect(acceptFormalRoot(budget, c1)).toBe(true)
    expect(acceptFormalRoot(budget, c2)).toBe(true)
    expect(acceptFormalRoot(budget, dFwd)).toBe(true)
    expect(acceptFormalRoot(budget, dBwd)).toBe(false) // 第 4 个旧身份超限
    expect(remainingReviewSlots(budget)).toBe(0)
  })

  it("deck scope 动态追加只计本牌组且受额度约束", () => {
    const initial = [dueCard(1, { deck: "A" })]
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 0, reviewCardsPerDay: 2 },
      initial
    )!
    const candidates = [
      dueCard(2, { deck: "A" }),
      dueCard(3, { deck: "B" }),
      dueCard(4, { deck: "A" })
    ]
    const selected = selectNewDueCardsForSession(
      candidates,
      initial,
      createDeckScope("A"),
      budget
    )
    // 仅 1 个剩余额度，且只接受 deck A
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe(2)
    expect(selected[0].deck).toBe("A")
  })

  it("额度不因「已评分离开尾部」释放：accepted 集合保留", () => {
    const a = dueCard(1)
    const b = dueCard(2)
    const budget = createSessionRootCardBudget(
      { newCardsPerDay: 0, reviewCardsPerDay: 2 },
      [a, b]
    )!
    // 模拟 currentIndex 前移后 existing 仅含未复习尾部 b（a 仍在完整队列中，
    // 但即便 existing 变空，也不得释放 a 的额度）
    expect(remainingReviewSlots(budget)).toBe(0)
    const tryMore = selectNewDueCardsForSession(
      [dueCard(3)],
      [],
      createAllScope(),
      budget
    )
    expect(tryMore).toEqual([])
  })

  it("自动/手动共用 selectNewDueCardsForSession", () => {
    const budget = createSessionRootCardBudget({
      newCardsPerDay: 1,
      reviewCardsPerDay: 0
    })!
    const candidates = rangeCards(3, (id) => newCard(id))
    const forAuto = selectNewDueCardsForSession(
      candidates,
      [],
      createAllScope(),
      budget
    )
    // 第二个入口应看到已耗尽
    const forManual = selectNewDueCardsForSession(
      candidates,
      forAuto,
      createAllScope(),
      budget
    )
    expect(forAuto).toHaveLength(1)
    expect(forManual).toEqual([])
  })
})

describe("fixed unlimited + no dynamic scan semantics", () => {
  it("fixed budget null：不限额", () => {
    const many = rangeCards(50, (id) => dueCard(id))
    const queue = buildReviewQueue(many, null)
    expect(queue).toHaveLength(50)

    const selected = selectNewDueCardsForSession(
      many.slice(10),
      many.slice(0, 10),
      createFixedScope(many.slice(0, 10)),
      null
    )
    // fixed scope 过滤后仅 fixed 集合内；但这里 candidates 是 11-50，均不在 fixed
    expect(selected).toEqual([])
  })

  it("fixed 集合内卡可重入且不限额", () => {
    const fixed = dueCard(1)
    const scope = createFixedScope([fixed])
    const requeued = selectPendingDueCardsForRequeue([fixed], scope, null)
    expect(requeued).toEqual([fixed])
  })
})

describe("partitionDueAndNewCards order", () => {
  it("保持收集相对顺序", () => {
    const cards = [dueCard(3), newCard(1), dueCard(1), newCard(2), dueCard(2)]
    const { dueCards, newCards } = partitionDueAndNewCards(cards)
    expect(dueCards.map((c) => c.id)).toEqual([3, 1, 2])
    expect(newCards.map((c) => c.id)).toEqual([1, 2])
  })
})
