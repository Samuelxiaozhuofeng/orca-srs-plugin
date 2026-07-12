/**
 * FC-11：正式根卡队列稳定排序
 * 流水线：到期筛选 → 稳定排序 → FC-01 限额 → 2:1 交织
 */
import { describe, expect, it } from "vitest"
import type { ReviewCard } from "./types"
import {
  buildReviewQueue,
  compareReviewCardsForQueue,
  partitionDueAndNewCards,
  sortCardsForReviewQueue
} from "./cardCollector"
import {
  buildCardKey,
  cardKeyFromReviewCard,
  compareCardIdentity,
  compareReviewCardIdentity,
  identityFromReviewCard,
  orderTupleFromIdentity
} from "./cardIdentity"

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

function dueCard(id: number, overrides: Partial<ReviewCard> = {}): ReviewCard {
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

function newCard(id: number, overrides: Partial<ReviewCard> = {}): ReviewCard {
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

function shuffleInPlace<T>(arr: T[], seed = 42): T[] {
  // 确定性伪随机，便于「输入打乱」回归
  let s = seed
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

describe("cardIdentity structured order (FC-11 tie-breaker)", () => {
  it("Cloze c2 < c10 数值序，且 cardKey 字符串格式不变", () => {
    const c2 = identityFromReviewCard(
      dueCard(10, { cardType: "cloze", clozeNumber: 2 })
    )
    const c10 = identityFromReviewCard(
      dueCard(10, { cardType: "cloze", clozeNumber: 10 })
    )
    expect(buildCardKey(c2)).toBe("cloze:10:c2")
    expect(buildCardKey(c10)).toBe("cloze:10:c10")
    // 字符串字典序会让 c10 < c2；结构化比较必须相反
    expect(buildCardKey(c10) < buildCardKey(c2)).toBe(true)
    expect(compareCardIdentity(c2, c10)).toBeLessThan(0)
    expect(orderTupleFromIdentity(c2)[2]).toBe(2)
    expect(orderTupleFromIdentity(c10)[2]).toBe(10)
  })

  it("Direction forward 先于 backward（确定序）", () => {
    const fwd = identityFromReviewCard(
      dueCard(20, { cardType: "direction", directionType: "forward" })
    )
    const bwd = identityFromReviewCard(
      dueCard(20, { cardType: "direction", directionType: "backward" })
    )
    expect(buildCardKey(fwd)).toBe("direction:20:forward")
    expect(buildCardKey(bwd)).toBe("direction:20:backward")
    // 字符串 "backward" < "forward"；结构化要求 forward 优先
    expect(buildCardKey(bwd) < buildCardKey(fwd)).toBe(true)
    expect(compareCardIdentity(fwd, bwd)).toBeLessThan(0)
  })

  it("List item 按 listItemId 数值自然序（item 2 < 10）", () => {
    const item2 = identityFromReviewCard(
      dueCard(30, { cardType: "list", listItemId: 2 })
    )
    const item10 = identityFromReviewCard(
      dueCard(30, { cardType: "list", listItemId: 10 })
    )
    expect(buildCardKey(item2)).toBe("list:30:item:2")
    expect(buildCardKey(item10)).toBe("list:30:item:10")
    expect(buildCardKey(item10) < buildCardKey(item2)).toBe(true)
    expect(compareCardIdentity(item2, item10)).toBeLessThan(0)
  })

  it("compareReviewCardIdentity 与 identity 比较一致", () => {
    const a = dueCard(1, { cardType: "cloze", clozeNumber: 2 })
    const b = dueCard(1, { cardType: "cloze", clozeNumber: 10 })
    expect(compareReviewCardIdentity(a, b)).toBe(
      compareCardIdentity(identityFromReviewCard(a), identityFromReviewCard(b))
    )
  })
})

describe("旧卡 / 新卡 due 与 key 排序", () => {
  it("旧卡按 due 升序（逾期最久优先）", () => {
    const cards = [
      dueCard(3, { srs: baseSrs({ due: new Date("2024-03-01T00:00:00Z") }) }),
      dueCard(1, { srs: baseSrs({ due: new Date("2024-01-01T00:00:00Z") }) }),
      dueCard(2, { srs: baseSrs({ due: new Date("2024-02-01T00:00:00Z") }) })
    ]
    const queue = buildReviewQueue(cards, null)
    expect(queue.map((c) => c.id)).toEqual([1, 2, 3])
  })

  it("相同 due 用结构化 identity 稳定排序", () => {
    const sameDue = new Date("2024-01-01T12:00:00Z")
    const cards = [
      dueCard(30),
      dueCard(10),
      dueCard(20)
    ].map((c) => ({
      ...c,
      srs: baseSrs({ due: sameDue, lastReviewed: new Date("2023-01-01"), reps: 1 })
    }))
    const queue = buildReviewQueue(cards, null)
    expect(queue.map((c) => c.id)).toEqual([10, 20, 30])
    expect(queue.map((c) => cardKeyFromReviewCard(c))).toEqual([
      "basic:10",
      "basic:20",
      "basic:30"
    ])
  })

  it("Cloze 相同 due：c2 先于 c10（非字符串字典序）", () => {
    const sameDue = new Date("2024-06-01T00:00:00Z")
    const c10 = dueCard(5, {
      cardType: "cloze",
      clozeNumber: 10,
      srs: baseSrs({ due: sameDue })
    })
    const c2 = dueCard(5, {
      cardType: "cloze",
      clozeNumber: 2,
      srs: baseSrs({ due: sameDue })
    })
    const c1 = dueCard(5, {
      cardType: "cloze",
      clozeNumber: 1,
      srs: baseSrs({ due: sameDue })
    })
    const queue = buildReviewQueue([c10, c1, c2], null)
    expect(queue.map((c) => c.clozeNumber)).toEqual([1, 2, 10])
  })

  it("Direction 相同 due：forward 先于 backward", () => {
    const sameDue = new Date("2024-06-01T00:00:00Z")
    const bwd = dueCard(7, {
      cardType: "direction",
      directionType: "backward",
      srs: baseSrs({ due: sameDue })
    })
    const fwd = dueCard(7, {
      cardType: "direction",
      directionType: "forward",
      srs: baseSrs({ due: sameDue })
    })
    const queue = buildReviewQueue([bwd, fwd], null)
    expect(queue.map((c) => c.directionType)).toEqual(["forward", "backward"])
  })

  it("List 相同 due：listItemId 自然序", () => {
    const sameDue = new Date("2024-06-01T00:00:00Z")
    const item10 = dueCard(9, {
      cardType: "list",
      listItemId: 10,
      listItemIndex: 2,
      srs: baseSrs({ due: sameDue })
    })
    const item2 = dueCard(9, {
      cardType: "list",
      listItemId: 2,
      listItemIndex: 1,
      srs: baseSrs({ due: sameDue })
    })
    const queue = buildReviewQueue([item10, item2], null)
    expect(queue.map((c) => c.listItemId)).toEqual([2, 10])
  })

  it("新卡：due 升序，再稳定 identity", () => {
    const cards = [
      newCard(3, { srs: baseSrs({ due: new Date("2024-03-01"), lastReviewed: null, reps: 0 }) }),
      newCard(1, { srs: baseSrs({ due: new Date("2024-01-01"), lastReviewed: null, reps: 0 }) }),
      newCard(2, { srs: baseSrs({ due: new Date("2024-01-01"), lastReviewed: null, reps: 0 }) })
    ]
    const queue = buildReviewQueue(cards, null)
    expect(queue.map((c) => c.id)).toEqual([1, 2, 3])
  })
})

describe("输入无关稳定输出", () => {
  it("输入随机排列后输出相同", () => {
    const base = [
      dueCard(5, { srs: baseSrs({ due: new Date("2024-05-01") }) }),
      dueCard(1, { srs: baseSrs({ due: new Date("2024-01-01") }) }),
      dueCard(3, {
        cardType: "cloze",
        clozeNumber: 10,
        srs: baseSrs({ due: new Date("2024-03-01") })
      }),
      dueCard(3, {
        cardType: "cloze",
        clozeNumber: 2,
        srs: baseSrs({ due: new Date("2024-03-01") })
      }),
      newCard(20, { srs: baseSrs({ due: new Date("2024-02-01"), lastReviewed: null, reps: 0 }) }),
      newCard(10, { srs: baseSrs({ due: new Date("2024-02-01"), lastReviewed: null, reps: 0 }) })
    ]

    const expected = buildReviewQueue(base, null).map((c) => cardKeyFromReviewCard(c))

    for (let seed = 1; seed <= 8; seed++) {
      const shuffled = shuffleInPlace([...base], seed)
      const keys = buildReviewQueue(shuffled, null).map((c) => cardKeyFromReviewCard(c))
      expect(keys).toEqual(expected)
    }
  })

  it("compareReviewCardsForQueue 与 sort 一致", () => {
    const cards = [
      dueCard(2, { srs: baseSrs({ due: new Date("2024-02-01") }) }),
      dueCard(1, { srs: baseSrs({ due: new Date("2024-01-01") }) })
    ]
    expect(compareReviewCardsForQueue(cards[0], cards[1])).toBeGreaterThan(0)
    expect(sortCardsForReviewQueue(cards).map((c) => c.id)).toEqual([1, 2])
  })
})

describe("排序 → 限额 → 2:1 精确顺序", () => {
  it("先稳定排序，再限额，再 2:1 交织", () => {
    // 故意反序 + 混入未来卡
    const cards = [
      newCard(103, { srs: baseSrs({ due: new Date("2020-01-01"), lastReviewed: null, reps: 0 }) }),
      dueCard(5, { srs: baseSrs({ due: new Date("2024-05-01") }) }),
      newCard(101, { srs: baseSrs({ due: new Date("2020-01-01"), lastReviewed: null, reps: 0 }) }),
      dueCard(1, { srs: baseSrs({ due: new Date("2024-01-01") }) }),
      dueCard(3, { srs: baseSrs({ due: new Date("2024-03-01") }) }),
      dueCard(2, { srs: baseSrs({ due: new Date("2024-02-01") }) }),
      newCard(102, { srs: baseSrs({ due: new Date("2020-01-01"), lastReviewed: null, reps: 0 }) }),
      dueCard(99, {
        srs: baseSrs({ due: new Date("2099-01-01T00:00:00Z") })
      }), // 未到期，过滤掉
      newCard(199, {
        srs: baseSrs({
          due: new Date("2099-01-01T00:00:00Z"),
          lastReviewed: null,
          reps: 0
        })
      })
    ]

    // 排序后 due=[1,2,3,5] new=[101,102,103]
    // 限额 review=3 new=2 → due=[1,2,3] new=[101,102]
    // 2:1 → 1,2,101,3,102
    const queue = buildReviewQueue(cards, {
      newCardsPerDay: 2,
      reviewCardsPerDay: 3
    })
    expect(queue.map((c) => c.id)).toEqual([1, 2, 101, 3, 102])
  })

  it("limits null 时仍排序并交织，不截断", () => {
    const dues = [
      dueCard(3, { srs: baseSrs({ due: new Date("2024-03-01") }) }),
      dueCard(1, { srs: baseSrs({ due: new Date("2024-01-01") }) })
    ]
    const news = [
      newCard(20, { srs: baseSrs({ due: new Date("2020-01-01"), lastReviewed: null, reps: 0 }) }),
      newCard(10, { srs: baseSrs({ due: new Date("2020-01-01"), lastReviewed: null, reps: 0 }) })
    ]
    // due 排序 [1,3], new [10,20] → 1,3,10,20 中 2:1 → 1,3,10,20 当 due 用完后继续 new
    // 实际：1,3,10 然后 new 剩 20 → 1,3,10,20
    const queue = buildReviewQueue([...dues, ...news], null)
    expect(queue.map((c) => c.id)).toEqual([1, 3, 10, 20])
  })
})

describe("特殊卡 due 分天不被排序破坏", () => {
  it("Cloze 分天 due：仅到期变体入队且按 due 优先", () => {
    const c1 = dueCard(50, {
      cardType: "cloze",
      clozeNumber: 1,
      srs: baseSrs({ due: new Date("2024-01-01T00:00:00Z") })
    })
    const c2 = dueCard(50, {
      cardType: "cloze",
      clozeNumber: 2,
      srs: baseSrs({ due: new Date("2024-01-03T00:00:00Z") })
    })
    const c3Future = dueCard(50, {
      cardType: "cloze",
      clozeNumber: 3,
      srs: baseSrs({ due: new Date("2099-01-01T00:00:00Z") })
    })
    // 输入故意把未来卡和较新 due 放前面
    const queue = buildReviewQueue([c3Future, c2, c1], null)
    expect(queue.map((c) => c.clozeNumber)).toEqual([1, 2])
    expect(queue[0].srs.due.getTime()).toBeLessThan(queue[1].srs.due.getTime())
  })

  it("Direction 分天 due：forward 更早到期时保持 due 优先于 identity 默认序", () => {
    // 若 due 不同，due 优先；即便 identity 上 forward < backward，较晚 due 的 forward 排后
    const fwdLater = dueCard(60, {
      cardType: "direction",
      directionType: "forward",
      srs: baseSrs({ due: new Date("2024-02-01T00:00:00Z") })
    })
    const bwdEarlier = dueCard(60, {
      cardType: "direction",
      directionType: "backward",
      srs: baseSrs({ due: new Date("2024-01-01T00:00:00Z") })
    })
    const queue = buildReviewQueue([fwdLater, bwdEarlier], null)
    expect(queue.map((c) => c.directionType)).toEqual(["backward", "forward"])
  })

  it("List 条目：due 不同时按 due；同 due 才用 listItemId", () => {
    const itemLater = dueCard(70, {
      cardType: "list",
      listItemId: 1,
      srs: baseSrs({ due: new Date("2024-02-01") })
    })
    const itemEarlier = dueCard(70, {
      cardType: "list",
      listItemId: 99,
      srs: baseSrs({ due: new Date("2024-01-01") })
    })
    const queue = buildReviewQueue([itemLater, itemEarlier], null)
    expect(queue.map((c) => c.listItemId)).toEqual([99, 1])
  })

  it("partition 仍只做到期筛选，不排序（排序在 buildReviewQueue）", () => {
    const cards = [
      dueCard(3, { srs: baseSrs({ due: new Date("2024-03-01") }) }),
      dueCard(1, { srs: baseSrs({ due: new Date("2024-01-01") }) })
    ]
    const { dueCards } = partitionDueAndNewCards(cards)
    expect(dueCards.map((c) => c.id)).toEqual([3, 1])
    expect(sortCardsForReviewQueue(dueCards).map((c) => c.id)).toEqual([1, 3])
  })
})
