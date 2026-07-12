/**
 * FC-12：子卡展开深度、数量、循环保护与诊断
 * FC-01 关系：正式根卡额度不含辅助子卡
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  DEFAULT_MAX_AUX_CHILD_CARDS,
  DEFAULT_MAX_CHILD_DEPTH,
  MAX_AUX_CHILD_CARDS_CAP,
  MAX_CHILD_DEPTH_CAP,
  buildReviewQueue,
  buildSessionReviewQueue,
  expandChildCardsForRoots,
  formatChildExpandWarning,
  isValidChildExpandLimit,
  resolveChildExpandLimits,
  type ChildExpandLimits
} from "./cardCollector"

// ---------------------------------------------------------------------------
// Mock childCardCollector：按 parentId 返回直接子卡图
// ---------------------------------------------------------------------------

const childMap = new Map<number, ReviewCard[]>()

vi.mock("./childCardCollector", () => ({
  collectChildCards: vi.fn(async (parentBlockId: number) => {
    return childMap.get(Number(parentBlockId)) ?? []
  }),
  getCardKey: (card: ReviewCard) => cardKeyFromReviewCard(card)
}))

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

function ids(cards: readonly ReviewCard[]): number[] {
  return cards.map((c) => c.id as number)
}

function keys(cards: readonly ReviewCard[]): string[] {
  return cards.map((c) => cardKeyFromReviewCard(c))
}

/** A → B → C 线性链 */
function wireLinearChain(...chainIds: number[]): ReviewCard[] {
  const cards = chainIds.map((id) => dueCard(id))
  for (let i = 0; i < chainIds.length - 1; i++) {
    childMap.set(chainIds[i]!, [cards[i + 1]!])
  }
  return cards
}

beforeEach(() => {
  childMap.clear()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// resolve / validate
// ---------------------------------------------------------------------------

describe("resolveChildExpandLimits / validation", () => {
  const warns: string[] = []
  const warn = (m: string) => {
    warns.push(m)
  }

  afterEach(() => {
    warns.length = 0
  })

  it("省略 raw → 默认 10 / 200", () => {
    const r = resolveChildExpandLimits(undefined, { warn })
    expect(r.maxDepth).toBe(DEFAULT_MAX_CHILD_DEPTH)
    expect(r.maxAuxChildCards).toBe(DEFAULT_MAX_AUX_CHILD_CARDS)
    expect(r.usedDefaults).toBe(false)
    expect(r.warnings).toEqual([])
    expect(warns).toEqual([])
  })

  it("null → 默认", () => {
    const r = resolveChildExpandLimits(null, { warn })
    expect(r.maxDepth).toBe(10)
    expect(r.maxAuxChildCards).toBe(200)
  })

  it("接受 0 限制（仅根、无辅助）", () => {
    const r = resolveChildExpandLimits(
      { maxDepth: 0, maxAuxChildCards: 0 },
      { warn }
    )
    expect(r.maxDepth).toBe(0)
    expect(r.maxAuxChildCards).toBe(0)
    expect(r.usedDefaults).toBe(false)
  })

  it.each([
    [{ maxDepth: -1 }, 10, 200],
    [{ maxAuxChildCards: -5 }, 10, 200],
    [{ maxDepth: Number.NaN }, 10, 200],
    [{ maxAuxChildCards: Number.NaN }, 10, 200],
    [{ maxDepth: 1.5 }, 10, 200],
    [{ maxAuxChildCards: 3.2 }, 10, 200],
    [{ maxDepth: MAX_CHILD_DEPTH_CAP + 1 }, 10, 200],
    [{ maxAuxChildCards: MAX_AUX_CHILD_CARDS_CAP + 1 }, 10, 200],
    [{ maxDepth: Number.POSITIVE_INFINITY }, 10, 200],
    [{ maxDepth: "5" as unknown as number }, 10, 200]
  ])("无效 raw=%j → 回退默认并发 warn", (raw, expDepth, expCount) => {
    const r = resolveChildExpandLimits(raw as Partial<ChildExpandLimits>, { warn })
    expect(r.maxDepth).toBe(expDepth)
    expect(r.maxAuxChildCards).toBe(expCount)
    expect(r.usedDefaults).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(warns.length).toBeGreaterThan(0)
  })

  it("仅一侧无效时另一侧保留", () => {
    const r = resolveChildExpandLimits(
      { maxDepth: 3, maxAuxChildCards: -1 },
      { warn }
    )
    expect(r.maxDepth).toBe(3)
    expect(r.maxAuxChildCards).toBe(200)
    expect(r.usedDefaults).toBe(true)
  })

  it("isValidChildExpandLimit 边界", () => {
    expect(isValidChildExpandLimit(0, 100)).toBe(true)
    expect(isValidChildExpandLimit(100, 100)).toBe(true)
    expect(isValidChildExpandLimit(-1, 100)).toBe(false)
    expect(isValidChildExpandLimit(1.1, 100)).toBe(false)
    expect(isValidChildExpandLimit(101, 100)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// expand: depth / count / multi-root / cycle / order / roots retained
// ---------------------------------------------------------------------------

describe("expandChildCardsForRoots", () => {
  it("A→B→C 正常前序展开", async () => {
    const [a, b, c] = wireLinearChain(1, 2, 3)
    const result = await expandChildCardsForRoots([a!], "test", {
      maxDepth: 10,
      maxAuxChildCards: 200
    })
    expect(ids(result.queue)).toEqual([1, 2, 3])
    expect(result.auxChildCount).toBe(2)
    expect(result.diagnostics).toEqual([])
    expect(result.resolvedLimits).toEqual({ maxDepth: 10, maxAuxChildCards: 200 })
  })

  it("深度超过限制时截断并诊断，根仍保留", async () => {
    // depth: 1=root(0), 2(d1), 3(d2), 4(d3)
    const cards = wireLinearChain(1, 2, 3, 4)
    const result = await expandChildCardsForRoots([cards[0]!], "test", {
      maxDepth: 2,
      maxAuxChildCards: 200
    })
    expect(ids(result.queue)).toEqual([1, 2, 3]) // 4 在 depth 3 被截
    expect(result.auxChildCount).toBe(2)
    expect(result.diagnostics.some((d) => d.reason === "max_depth")).toBe(true)
    expect(result.diagnostics[0]!.truncated).toBe(true)
    expect(result.diagnostics[0]!.rootKey).toBe(cardKeyFromReviewCard(cards[0]!))
    expect(result.diagnostics[0]!.depth).toBeDefined()
  })

  it("数量超过限制时截断并诊断，根仍保留", async () => {
    const root = dueCard(1)
    const children = [dueCard(2), dueCard(3), dueCard(4), dueCard(5)]
    childMap.set(1, children)

    const result = await expandChildCardsForRoots([root], "test", {
      maxDepth: 10,
      maxAuxChildCards: 2
    })
    expect(ids(result.queue)).toEqual([1, 2, 3])
    expect(result.auxChildCount).toBe(2)
    expect(result.diagnostics.some((d) => d.reason === "max_count")).toBe(true)
    expect(result.diagnostics.find((d) => d.reason === "max_count")!.count).toBe(2)
  })

  it("多根：一链触限后仍继续后续正式根卡", async () => {
    // root A: A→A1→A2→A3（深度限 1 → 仅 A,A1）
    // root B: B→B1
    const a = dueCard(10)
    const a1 = dueCard(11)
    const a2 = dueCard(12)
    const a3 = dueCard(13)
    const b = dueCard(20)
    const b1 = dueCard(21)
    childMap.set(10, [a1])
    childMap.set(11, [a2])
    childMap.set(12, [a3])
    childMap.set(20, [b1])

    const result = await expandChildCardsForRoots([a, b], "test", {
      maxDepth: 1,
      maxAuxChildCards: 200
    })
    expect(ids(result.queue)).toEqual([10, 11, 20, 21])
    expect(result.diagnostics.some((d) => d.reason === "max_depth")).toBe(true)
    // 两正式根均保留
    expect(ids(result.queue)).toContain(10)
    expect(ids(result.queue)).toContain(20)
  })

  it("全局辅助数量触限后后续根卡仍保留（可不展开其子卡）", async () => {
    const r1 = dueCard(1)
    const r1c = dueCard(2)
    const r2 = dueCard(3)
    const r2c = dueCard(4)
    childMap.set(1, [r1c])
    childMap.set(3, [r2c])

    const result = await expandChildCardsForRoots([r1, r2], "test", {
      maxDepth: 10,
      maxAuxChildCards: 1
    })
    // 根 1、子 2、根 3；子 4 因数量上限未入队
    expect(ids(result.queue)).toEqual([1, 2, 3])
    expect(result.auxChildCount).toBe(1)
    expect(result.diagnostics.some((d) => d.reason === "max_count")).toBe(true)
  })

  it("A→B→A 循环安全终止并诊断", async () => {
    const a = dueCard(1)
    const b = dueCard(2)
    childMap.set(1, [b])
    childMap.set(2, [a]) // 回到 A

    const result = await expandChildCardsForRoots([a], "test", {
      maxDepth: 10,
      maxAuxChildCards: 200
    })
    expect(ids(result.queue)).toEqual([1, 2])
    expect(result.diagnostics.some((d) => d.reason === "cycle")).toBe(true)
    expect(result.diagnostics.find((d) => d.reason === "cycle")!.rootKey).toBe(
      cardKeyFromReviewCard(a)
    )
  })

  it("确定性前序：多子卡按 collect 返回顺序", async () => {
    const root = dueCard(1)
    const c1 = dueCard(2)
    const c2 = dueCard(3)
    const c1a = dueCard(4)
    childMap.set(1, [c1, c2])
    childMap.set(2, [c1a])

    const result = await expandChildCardsForRoots([root], "test", {
      maxDepth: 10,
      maxAuxChildCards: 200
    })
    // 前序：1, 2, 4, 3
    expect(ids(result.queue)).toEqual([1, 2, 4, 3])
  })

  it("不改变正式根卡输入顺序（FC-11 已排序后的相对序）", async () => {
    const roots = [dueCard(30), dueCard(10), dueCard(20)]
    childMap.set(30, [dueCard(31)])
    childMap.set(10, [dueCard(11)])
    childMap.set(20, [dueCard(21)])

    const result = await expandChildCardsForRoots(roots, "test", {
      maxDepth: 10,
      maxAuxChildCards: 200
    })
    // 根序 30,10,20 保持；各链内前序
    expect(ids(result.queue)).toEqual([30, 31, 10, 11, 20, 21])
  })

  it("maxDepth=0 / maxAux=0：仅正式根，无辅助", async () => {
    const [a] = wireLinearChain(1, 2, 3)
    const byDepth = await expandChildCardsForRoots([a!], "test", {
      maxDepth: 0,
      maxAuxChildCards: 200
    })
    expect(ids(byDepth.queue)).toEqual([1])
    expect(byDepth.auxChildCount).toBe(0)
    expect(byDepth.diagnostics.some((d) => d.reason === "max_depth")).toBe(true)

    childMap.clear()
    const [a2] = wireLinearChain(1, 2, 3)
    const byCount = await expandChildCardsForRoots([a2!], "test", {
      maxDepth: 10,
      maxAuxChildCards: 0
    })
    expect(ids(byCount.queue)).toEqual([1])
    expect(byCount.auxChildCount).toBe(0)
    expect(byCount.diagnostics.some((d) => d.reason === "max_count")).toBe(true)
  })

  it("已作为子卡出现的正式根被跳过（既有去重）", async () => {
    // 正式根 [A, B]，A→B→C；B 作为根时已出现则跳过
    const a = dueCard(1)
    const b = dueCard(2)
    const c = dueCard(3)
    childMap.set(1, [b])
    childMap.set(2, [c])

    const result = await expandChildCardsForRoots([a, b], "test", {
      maxDepth: 10,
      maxAuxChildCards: 200
    })
    expect(ids(result.queue)).toEqual([1, 2, 3])
  })

  it("无效 limits 回退默认后仍可展开", async () => {
    const [a] = wireLinearChain(1, 2)
    const result = await expandChildCardsForRoots([a!], "test", {
      maxDepth: -1 as unknown as number,
      maxAuxChildCards: Number.NaN
    })
    expect(ids(result.queue)).toEqual([1, 2])
    expect(result.resolvedLimits.maxDepth).toBe(DEFAULT_MAX_CHILD_DEPTH)
    expect(result.resolvedLimits.maxAuxChildCards).toBe(DEFAULT_MAX_AUX_CHILD_CARDS)
  })

  it("formatChildExpandWarning 简短可读", () => {
    expect(formatChildExpandWarning([])).toBeNull()
    const msg = formatChildExpandWarning([
      {
        truncated: true,
        reason: "max_depth",
        rootKey: "1",
        depth: 11,
        message: "..."
      },
      {
        truncated: true,
        reason: "max_count",
        rootKey: "2",
        count: 200,
        message: "..."
      }
    ])
    expect(msg).toContain("深度")
    expect(msg).toContain("数量")
    expect(msg).toContain("2 处")
  })
})

// ---------------------------------------------------------------------------
// FC-01 关系：根额度不含辅助子卡
// ---------------------------------------------------------------------------

describe("FC-01 与子卡展开：根额度不含辅助子卡", () => {
  it("buildSessionReviewQueue：限额后的 formalRoot 不含辅助；展开可含子卡", async () => {
    // 5 张旧根，限额 2；每根 1 子
    const roots = [1, 2, 3, 4, 5].map((id) => dueCard(id))
    for (const r of roots) {
      childMap.set(r.id as number, [dueCard((r.id as number) + 100)])
    }

    const result = await buildSessionReviewQueue(
      roots,
      "test",
      { newCardsPerDay: 0, reviewCardsPerDay: 2 },
      { maxDepth: 10, maxAuxChildCards: 200 }
    )

    expect(result.formalRootCards).toHaveLength(2)
    expect(ids(result.formalRootCards)).toEqual([1, 2])
    // 展开：2 根 + 2 辅助
    expect(ids(result.queue)).toEqual([1, 101, 2, 102])
    expect(result.auxChildCount).toBe(2)
    // 辅助不进 formalRoot
    expect(result.formalRootCards.every((c) => (c.id as number) < 100)).toBe(true)
  })

  it("正式根卡额度独立于辅助数量上限", async () => {
    // 根限额 3；辅助上限 1 → 3 根全保留，仅 1 辅助
    const roots = [dueCard(1), dueCard(2), dueCard(3)]
    childMap.set(1, [dueCard(11)])
    childMap.set(2, [dueCard(22)])
    childMap.set(3, [dueCard(33)])

    const base = buildReviewQueue(roots, {
      newCardsPerDay: 0,
      reviewCardsPerDay: 3
    })
    expect(base).toHaveLength(3)

    const expanded = await expandChildCardsForRoots(base, "test", {
      maxDepth: 10,
      maxAuxChildCards: 1
    })
    expect(ids(expanded.queue).filter((id) => id <= 3)).toEqual([1, 2, 3])
    expect(expanded.auxChildCount).toBe(1)
    expect(expanded.queue).toHaveLength(4) // 3 根 + 1 子
  })

  it("新卡根限额后子卡仍可展开且不占新卡额度语义", async () => {
    const news = [newCard(1), newCard(2), newCard(3)]
    childMap.set(1, [dueCard(10)])
    childMap.set(2, [dueCard(20)])

    const result = await buildSessionReviewQueue(
      news,
      "test",
      { newCardsPerDay: 2, reviewCardsPerDay: 0 },
      { maxDepth: 5, maxAuxChildCards: 50 }
    )
    expect(result.formalRootCards).toHaveLength(2)
    expect(result.formalRootCards.every((c) => c.isNew)).toBe(true)
    expect(result.auxChildCount).toBe(2)
    expect(result.queue.length).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// 诊断字段完整性
// ---------------------------------------------------------------------------

describe("诊断字段", () => {
  it("max_depth 诊断含 truncated/reason/rootKey/depth", async () => {
    const cards = wireLinearChain(1, 2, 3)
    const result = await expandChildCardsForRoots([cards[0]!], "test", {
      maxDepth: 1,
      maxAuxChildCards: 200
    })
    const d = result.diagnostics.find((x) => x.reason === "max_depth")
    expect(d).toBeDefined()
    expect(d!.truncated).toBe(true)
    expect(d!.reason).toBe("max_depth")
    expect(d!.rootKey).toBe(cardKeyFromReviewCard(cards[0]!))
    expect(typeof d!.depth).toBe("number")
    expect(d!.message.length).toBeGreaterThan(0)
  })

  it("max_count 诊断含 count", async () => {
    const root = dueCard(1)
    childMap.set(1, [dueCard(2), dueCard(3)])
    const result = await expandChildCardsForRoots([root], "test", {
      maxDepth: 10,
      maxAuxChildCards: 1
    })
    const d = result.diagnostics.find((x) => x.reason === "max_count")
    expect(d).toBeDefined()
    expect(d!.count).toBe(1)
    expect(d!.rootKey).toBe(cardKeyFromReviewCard(root))
  })

  it("buildSessionReviewQueue 透传诊断", async () => {
    const cards = wireLinearChain(1, 2, 3, 4)
    const result = await buildSessionReviewQueue(
      [cards[0]!],
      "test",
      null,
      { maxDepth: 1, maxAuxChildCards: 200 }
    )
    expect(result.childExpandDiagnostics.length).toBeGreaterThan(0)
    expect(result.childExpandLimits.maxDepth).toBe(1)
    expect(result.auxChildCount).toBe(1)
    expect(formatChildExpandWarning(result.childExpandDiagnostics)).not.toBeNull()
  })
})
