import { describe, expect, it } from "vitest"
import type { Block, CursorData } from "../../orca.d.ts"
import {
  buildCrossBlockSegments,
  extractTextFromCrossBlockSegments,
  extractTextFromFragments,
  isAncestorOf,
  planExtractSelection,
  planRemoveReadRange,
  resolvePreOrderChain,
  resolveSiblingBlockChain
} from "./irRichExtract"

const baseCursor = (overrides: Partial<CursorData> & { anchor: any; focus: any }): CursorData => ({
  panelId: "p",
  rootBlockId: 1,
  isForward: true,
  ...overrides
})

describe("irRichExtract", () => {
  it("plans single fragment selection", () => {
    const plan = planExtractSelection(baseCursor({
      anchor: { blockId: 1, isInline: true, index: 0, offset: 1 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 4 }
    }))
    expect(plan?.mode).toBe("single_fragment")
  })

  it("plans cross fragment selection and extracts joined text", () => {
    const plan = planExtractSelection(baseCursor({
      anchor: { blockId: 1, isInline: true, index: 0, offset: 2 },
      focus: { blockId: 1, isInline: true, index: 2, offset: 3 }
    }))
    expect(plan?.mode).toBe("cross_fragment")
    if (plan?.mode !== "cross_fragment") return
    const text = extractTextFromFragments(
      [
        { t: "t", v: "Hello" } as any,
        { t: "t", v: " " } as any,
        { t: "t", v: "World" } as any
      ],
      plan
    )
    expect(text).toBe("llo Wor")
  })

  it("extracts cross-block selection with offsets and middle blocks", () => {
    const plan = planExtractSelection(baseCursor({
      isForward: true,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 2 },
      focus: { blockId: 3, isInline: true, index: 0, offset: 3 }
    }))
    expect(plan?.mode).toBe("cross_block")
    if (plan?.mode !== "cross_block") return

    const chain = resolveSiblingBlockChain(1, 3, [1, 2, 3, 4])
    expect(chain).toEqual([1, 2, 3])

    const segments = buildCrossBlockSegments(plan, [
      { id: 1, content: [{ t: "t", v: "Hello" } as any] },
      { id: 2, content: [{ t: "t", v: "MIDDLE" } as any] },
      { id: 3, content: [{ t: "t", v: "World" } as any] }
    ])
    const text = extractTextFromCrossBlockSegments(segments)
    // first: from offset 2 → "llo"; middle full; last to offset 3 → "Wor"
    expect(text).toBe("llo\nMIDDLE\nWor")
  })

  it("plans remove-read range keep windows", () => {
    expect(planRemoveReadRange(10, 2, 5)).toEqual({ keepBefore: 2, keepAfter: 4 })
  })
})

describe("resolvePreOrderChain / isAncestorOf（前序连续区间）", () => {
  // 树（模拟「父块 P + 子块 1/2/3」与嵌套分支）：
  //   10 (P)
  //     ├─ 11 (1) 叶子
  //     ├─ 12 (2) 叶子
  //     ├─ 13 (3) 叶子
  //     └─ 14（有子块）
  //          ├─ 141
  //          └─ 142
  //   20（另一棵树，与 P 不相连）
  //     └─ 21
  const tree: Record<number, { id: number; parent: number | null; children: number[] }> = {
    10: { id: 10, parent: null, children: [11, 12, 13, 14] },
    11: { id: 11, parent: 10, children: [] },
    12: { id: 12, parent: 10, children: [] },
    13: { id: 13, parent: 10, children: [] },
    14: { id: 14, parent: 10, children: [141, 142] },
    141: { id: 141, parent: 14, children: [] },
    142: { id: 142, parent: 14, children: [] },
    20: { id: 20, parent: null, children: [21] },
    21: { id: 21, parent: 20, children: [] }
  }
  const getBlock = (id: number) => tree[Number(id)] as unknown as Block

  it("祖先→后代：P 到子块 3 → [10,11,12,13]（用户场景）", () => {
    const res = resolvePreOrderChain(10, 13, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([10, 11, 12, 13])
  })

  it("祖先→后代：P 到子块 1 → [10,11]（拖到 child1 只有 P+1）", () => {
    const res = resolvePreOrderChain(10, 11, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([10, 11])
  })

  it("祖先→后代：P 到孙块 142 → [10,11,12,13,14,141,142]（含 14 分支全序）", () => {
    const res = resolvePreOrderChain(10, 142, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([10, 11, 12, 13, 14, 141, 142])
  })

  it("后代→祖先：142 → P 按阅读方向定向（向上拖选）", () => {
    // 阅读方向为 start→end：从深子块向上拖到 P，链从 142 开始到 10 结束
    const res = resolvePreOrderChain(142, 10, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([142, 141, 14, 13, 12, 11, 10])
  })

  it("兄弟退化：11→13 与 resolveSiblingBlockChain 闭区间一致", () => {
    const res = resolvePreOrderChain(11, 13, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.chain).toEqual([11, 12, 13])
      expect(res.chain).toEqual(resolveSiblingBlockChain(11, 13, [11, 12, 13, 14]))
    }
  })

  it("跨分支（前向）：11 → 14 含中间兄弟 12/13 整棵子树", () => {
    const res = resolvePreOrderChain(11, 14, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([11, 12, 13, 14])
  })

  it("跨分支（含端点子树）：141 → 13 反向定向为 [141,14,13]", () => {
    const res = resolvePreOrderChain(141, 13, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([141, 14, 13])
  })

  it("跨分支（前向深入）：13 → 141 为 [13,14,141]", () => {
    const res = resolvePreOrderChain(13, 141, getBlock)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.chain).toEqual([13, 14, 141])
  })

  it("断链：不同根 → non_sibling", () => {
    expect(resolvePreOrderChain(11, 21, getBlock)).toEqual({
      ok: false,
      reason: "non_sibling"
    })
  })

  it("路径中块缺失 → blocks_missing", () => {
    expect(resolvePreOrderChain(15, 13, getBlock)).toEqual({
      ok: false,
      reason: "blocks_missing"
    })
    const withBrokenParent: Record<
      number,
      { id: number; parent: number | null; children: number[] }
    > = { ...tree, 16: { id: 16, parent: 99, children: [] } }
    expect(
      resolvePreOrderChain(16, 13, (id) => withBrokenParent[Number(id)] as unknown as Block)
    ).toEqual({
      ok: false,
      reason: "blocks_missing"
    })
  })

  it("超限 → truncatedByStructure（链长 ≤ 上限）", () => {
    const big: Record<number, { id: number; parent: number | null; children: number[] }> = {
      100: { id: 100, parent: null, children: [] }
    }
    const ids: number[] = []
    for (let i = 1; i <= 250; i++) {
      const id = 100 + i
      ids.push(id)
      big[id] = { id, parent: 100, children: [] }
    }
    big[100].children = ids
    const res = resolvePreOrderChain(101, 350, (id) => big[Number(id)] as unknown as Block)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.truncatedByStructure).toBe(true)
      expect(res.chain.length).toBeLessThanOrEqual(200)
    }
  })

  it("isAncestorOf：祖先后代 true / 反向与兄弟 false / 缺块 false", () => {
    expect(isAncestorOf(10, 142, getBlock)).toBe(true)
    expect(isAncestorOf(10, 10, getBlock)).toBe(true)
    expect(isAncestorOf(142, 10, getBlock)).toBe(false)
    expect(isAncestorOf(11, 13, getBlock)).toBe(false)
    expect(isAncestorOf(10, 999, getBlock)).toBe(false)
  })
})
