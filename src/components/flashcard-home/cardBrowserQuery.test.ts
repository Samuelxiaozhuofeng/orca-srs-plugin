import { describe, expect, it } from "vitest"
import { State } from "ts-fsrs"
import type { ReviewCard, SrsState } from "../../srs/types"
import { cardKeyFromReviewCard } from "../../srs/cardIdentity"
import {
  browserCardKeySet,
  collectBrowserDeckOptions,
  countReviewableDueCards,
  dedupeCardsByBlockId,
  matchesBrowserSearch,
  mergeBrowserSourceCards,
  nextSelectionAfterBatch,
  pickCardsByKeys,
  pruneBrowserSelection,
  queryBrowserCards,
  resolveBrowserStatus,
  stableSortBrowserCards,
  type BrowserQuery
} from "./cardBrowserQuery"

function srs(partial: Partial<SrsState> & { due: Date }): SrsState {
  return {
    stability: 1,
    difficulty: 5,
    interval: 0,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: State.New,
    ...partial
  }
}

function card(partial: Partial<ReviewCard> & { id: number; front: string }): ReviewCard {
  return {
    back: partial.back ?? "",
    deck: partial.deck ?? "Default",
    isNew: partial.isNew ?? true,
    srs: partial.srs ?? srs({ due: new Date(2026, 0, 1) }),
    ...partial
  }
}

const day = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0)

describe("resolveBrowserStatus", () => {
  it("paused 优先于 pending", () => {
    expect(
      resolveBrowserStatus({ isSuspended: true, isPending: true })
    ).toBe("suspended")
    expect(resolveBrowserStatus({ isPending: true })).toBe("pending")
    expect(resolveBrowserStatus({})).toBe("active")
  })
})

describe("mergeBrowserSourceCards", () => {
  it("合并 active + suspended，并为未标记行补 isSuspended", () => {
    const active = [card({ id: 1, front: "a" })]
    const suspended = [card({ id: 2, front: "b" })]
    const merged = mergeBrowserSourceCards(active, suspended)
    expect(merged).toHaveLength(2)
    expect(merged[1].isSuspended).toBe(true)
  })
})

describe("matchesBrowserSearch", () => {
  it("匹配 front / back / tag（大小写不敏感，trim）", () => {
    const c = card({
      id: 1,
      front: "Hello World",
      back: "答案 SIDE",
      tags: [{ name: "语法", blockId: 9 }]
    })
    expect(matchesBrowserSearch(c, "  hello ")).toBe(true)
    expect(matchesBrowserSearch(c, "side")).toBe(true)
    expect(matchesBrowserSearch(c, "语法")).toBe(true)
    expect(matchesBrowserSearch(c, "missing")).toBe(false)
    expect(matchesBrowserSearch(c, "   ")).toBe(true)
  })
})

describe("queryBrowserCards 组合筛选", () => {
  const base: ReviewCard[] = [
    card({
      id: 1,
      front: "alpha",
      back: "one",
      deck: "A",
      cardType: "basic",
      isNew: false,
      srs: srs({ due: day(2020, 0, 1) }),
      tags: [{ name: "tag-x", blockId: 1 }]
    }),
    card({
      id: 2,
      front: "beta",
      back: "two",
      deck: "B",
      cardType: "cloze",
      clozeNumber: 1,
      isPending: true,
      isNew: true,
      srs: srs({ due: day(2099, 0, 1) }),
      tags: [{ name: "tag-y", blockId: 2 }]
    }),
    card({
      id: 3,
      front: "gamma",
      back: "three",
      deck: "A",
      cardType: "basic",
      isSuspended: true,
      isNew: false,
      srs: srs({ due: day(2026, 5, 1) }),
      tags: [{ name: "tag-x", blockId: 1 }]
    })
  ]

  it("默认 status=active 不含 pending/suspended", () => {
    const q: BrowserQuery = {
      dueFilter: "all",
      status: "active",
      search: "",
      tag: "",
      cardType: "",
      deck: "",
      sort: "default"
    }
    const out = queryBrowserCards(base, q)
    expect(out.map((c) => c.id)).toEqual([1])
  })

  it("status + deck + tag + search 为 AND", () => {
    const out = queryBrowserCards(base, {
      dueFilter: "all",
      status: "suspended",
      search: "gam",
      tag: "tag-x",
      cardType: "basic",
      deck: "A",
      sort: "default"
    })
    expect(out.map((c) => c.id)).toEqual([3])
  })

  it("pending 状态 + 卡型", () => {
    const out = queryBrowserCards(base, {
      dueFilter: "all",
      status: "pending",
      search: "",
      tag: "",
      cardType: "cloze",
      deck: "",
      sort: "default"
    })
    expect(out.map((c) => c.id)).toEqual([2])
  })

  it("来源牌组筛选", () => {
    const out = queryBrowserCards(base, {
      dueFilter: "all",
      status: "active",
      search: "",
      tag: "",
      cardType: "",
      deck: "A",
      sort: "default"
    })
    expect(out.map((c) => c.id)).toEqual([1])
  })

  it("到期 overdue 与 active 组合", () => {
    const out = queryBrowserCards(base, {
      dueFilter: "overdue",
      status: "active",
      search: "",
      tag: "",
      cardType: "",
      deck: "",
      sort: "default"
    })
    expect(out.map((c) => c.id)).toEqual([1])
  })
})

describe("stableSortBrowserCards", () => {
  it("相等键保持原相对顺序", () => {
    const cards = [
      card({ id: 1, front: "b", deck: "Z", srs: srs({ due: day(2026, 1, 1) }) }),
      card({ id: 2, front: "a", deck: "Z", srs: srs({ due: day(2026, 1, 1) }) }),
      card({ id: 3, front: "a", deck: "Y", srs: srs({ due: day(2026, 2, 1) }) })
    ]
    // due-asc：1 与 2 due 相同 → 保持 1 在 2 前
    expect(
      stableSortBrowserCards(cards, "due-asc").map((c) => c.id)
    ).toEqual([1, 2, 3])

    // front-az：2 与 3 front 同为 a → 2 先于 3
    expect(
      stableSortBrowserCards(cards, "front-az").map((c) => c.id)
    ).toEqual([2, 3, 1])

    // deck-az
    expect(
      stableSortBrowserCards(cards, "deck-az").map((c) => c.id)
    ).toEqual([3, 1, 2])

    // due-desc
    expect(
      stableSortBrowserCards(cards, "due-desc").map((c) => c.id)
    ).toEqual([3, 1, 2])

    // default 浅拷贝
    const def = stableSortBrowserCards(cards, "default")
    expect(def.map((c) => c.id)).toEqual([1, 2, 3])
    expect(def).not.toBe(cards)
  })
})

describe("cardKey 选择与同块去重", () => {
  it("pickCardsByKeys 按 key 取卡", () => {
    const cards = [
      card({ id: 10, front: "a", cardType: "basic" }),
      card({ id: 11, front: "b", cardType: "cloze", clozeNumber: 1 }),
      card({ id: 11, front: "c", cardType: "cloze", clozeNumber: 2 })
    ]
    const k1 = cardKeyFromReviewCard(cards[0])
    const k3 = cardKeyFromReviewCard(cards[2])
    const picked = pickCardsByKeys(cards, new Set([k3, k1]))
    // keys 迭代顺序：k3 先插入... 实际 Set 插入顺序是 k3, k1
    expect(picked.map((c) => cardKeyFromReviewCard(c))).toEqual([k3, k1])
  })

  it("dedupeCardsByBlockId 保留首次", () => {
    const cards = [
      card({ id: 5, front: "c1", clozeNumber: 1, cardType: "cloze" }),
      card({ id: 5, front: "c2", clozeNumber: 2, cardType: "cloze" }),
      card({ id: 6, front: "x", cardType: "basic" })
    ]
    const d = dedupeCardsByBlockId(cards)
    expect(d).toHaveLength(2)
    expect(d[0].clozeNumber).toBe(1)
    expect(d[1].id).toBe(6)
  })

  it("pruneBrowserSelection 去掉幽灵 key", () => {
    const visible = new Set(["basic:1", "cloze:2:c1"])
    const selected = new Set(["basic:1", "ghost", "cloze:2:c1"])
    const next = pruneBrowserSelection(selected, visible)
    expect([...next].sort()).toEqual(["basic:1", "cloze:2:c1"])
  })

  it("browserCardKeySet", () => {
    const cards = [card({ id: 1, front: "a", cardType: "basic" })]
    expect(browserCardKeySet(cards).has("basic:1")).toBe(true)
  })
})

describe("collectBrowserDeckOptions", () => {
  it("Default 置顶", () => {
    const cards = [
      card({ id: 1, front: "a", deck: "Zebra" }),
      card({ id: 2, front: "b", deck: "Default" }),
      card({ id: 3, front: "c", deck: "Alpha" })
    ]
    expect(collectBrowserDeckOptions(cards)).toEqual([
      "Default",
      "Alpha",
      "Zebra"
    ])
  })

  it("全库 deck 列表可含 scope 外牌组（改牌组目标路径）", () => {
    // scope 内只有 A；全库含 A+B → 改牌组下拉用全库 options
    const scopeCards = [card({ id: 1, front: "in-a", deck: "A" })]
    const libraryCards = [
      card({ id: 1, front: "in-a", deck: "A" }),
      card({ id: 2, front: "in-b", deck: "B" })
    ]
    expect(collectBrowserDeckOptions(scopeCards)).toEqual(["A"])
    expect(collectBrowserDeckOptions(libraryCards)).toEqual(["A", "B"])
  })
})

describe("nextSelectionAfterBatch", () => {
  it("全成功清空", () => {
    const prev = new Set(["basic:1", "basic:2"])
    const next = nextSelectionAfterBatch(prev, {
      success: [{ cardKey: "basic:1" }, { cardKey: "basic:2" }],
      failed: []
    })
    expect(next.size).toBe(0)
  })

  it("partial 只保留 failed keys", () => {
    const prev = new Set(["basic:1", "basic:2", "basic:3"])
    const next = nextSelectionAfterBatch(prev, {
      success: [{ cardKey: "basic:1" }],
      failed: [{ cardKey: "basic:2" }, { cardKey: "basic:3" }]
    })
    expect([...next].sort()).toEqual(["basic:2", "basic:3"])
  })

  it("全失败保持原选择（同一 Set 引用）", () => {
    const prev = new Set(["basic:1", "basic:2"])
    const next = nextSelectionAfterBatch(prev, {
      success: [],
      failed: [{ cardKey: "basic:1" }, { cardKey: "basic:2" }]
    })
    expect(next).toBe(prev)
  })
})

describe("countReviewableDueCards", () => {
  it("只计 active 非 pending 的到期，忽略 suspended", () => {
    const now = day(2026, 5, 15)
    const cards = [
      card({
        id: 1,
        front: "overdue",
        isNew: false,
        srs: srs({ due: day(2026, 5, 1) })
      }),
      card({
        id: 2,
        front: "today",
        isNew: false,
        srs: srs({ due: day(2026, 5, 15) })
      }),
      card({
        id: 3,
        front: "pending",
        isPending: true,
        isNew: false,
        srs: srs({ due: day(2026, 5, 1) })
      }),
      card({
        id: 4,
        front: "new",
        isNew: true,
        srs: srs({ due: day(2026, 5, 1) })
      })
    ]
    const r = countReviewableDueCards(cards, now)
    expect(r.overdue).toBe(1)
    expect(r.today).toBe(1)
    expect(r.hasDue).toBe(true)
  })
})
