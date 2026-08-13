import { afterEach, describe, expect, it } from "vitest"
import {
  collectExistingCardExclusionSummaries,
  EXISTING_CARD_DEDUPE_MAX_BLOCKS,
  EXISTING_CARD_DEDUPE_MAX_DEPTH
} from "./aiQuickCardDedupe"

function installBlocks(blocks: Record<number, unknown>) {
  ;(globalThis as any).orca = { state: { blocks } }
}

function cardRef(type: string) {
  return [{ type: 2, alias: "card", data: [{ name: "type", value: type }] }]
}

afterEach(() => {
  delete (globalThis as any).orca
})

describe("collectExistingCardExclusionSummaries", () => {
  it("collects basic card questions from the source subtree", () => {
    installBlocks({
      1: {
        id: 1,
        parent: null,
        text: "源块",
        content: [],
        children: [7]
      },
      7: {
        id: 7,
        parent: 1,
        text: "使役形是什么？",
        content: [{ t: "t", v: "使役形是什么？" }],
        children: [8],
        refs: cardRef("basic")
      },
      8: {
        id: 8,
        parent: 7,
        text: "让某人做某事的形态",
        content: [{ t: "t", v: "让某人做某事的形态" }],
        children: []
      }
    })

    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([
      "使役形是什么？"
    ])
  })

  it("collects choice card questions", () => {
    installBlocks({
      1: {
        id: 1,
        parent: null,
        text: "源块",
        content: [],
        children: [7]
      },
      7: {
        id: 7,
        parent: 1,
        text: "下列哪个是使役形？",
        content: [{ t: "t", v: "下列哪个是使役形？" }],
        children: [],
        refs: cardRef("choice")
      }
    })

    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([
      "下列哪个是使役形？"
    ])
  })

  it("collects cloze target plus context for cloze cards", () => {
    installBlocks({
      1: {
        id: 1,
        parent: null,
        text: "源块",
        content: [],
        children: [7]
      },
      7: {
        id: 7,
        parent: 1,
        text: "使役形表示让某人做某事",
        content: [
          { t: "t", v: "使役形表示" },
          { t: "orca-srs.cloze", v: "让某人做某事", clozeNumber: 1 },
          { t: "t", v: "" }
        ],
        children: [],
        refs: cardRef("cloze")
      }
    })

    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([
      "让某人做某事（出自：使役形表示让某人做某事）"
    ])
  })

  it("skips non-card blocks and non-AI card types", () => {
    installBlocks({
      1: {
        id: 1,
        parent: null,
        text: "源块",
        content: [],
        children: [7, 8, 9]
      },
      7: {
        id: 7,
        parent: 1,
        text: "普通块",
        content: [{ t: "t", v: "普通块" }],
        children: []
      },
      8: {
        id: 8,
        parent: 1,
        text: "方向卡题面",
        content: [{ t: "t", v: "方向卡题面" }],
        children: [],
        refs: cardRef("direction")
      },
      9: {
        id: 9,
        parent: 1,
        text: "列表卡",
        content: [{ t: "t", v: "列表卡" }],
        children: [],
        refs: cardRef("list")
      }
    })

    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([])
  })

  it("does not descend into card blocks", () => {
    // 答案子块不应被当成独立卡片；但更深处的普通块子树仍会扫到
    installBlocks({
      1: {
        id: 1,
        parent: null,
        text: "源块",
        content: [],
        children: [7]
      },
      7: {
        id: 7,
        parent: 1,
        text: "使役形是什么？",
        content: [{ t: "t", v: "使役形是什么？" }],
        children: [8],
        refs: cardRef("basic")
      },
      8: {
        id: 8,
        parent: 7,
        text: "答案",
        content: [{ t: "t", v: "答案" }],
        children: [9],
        refs: cardRef("basic") // 被 #card 标记的答案子块也不该进入
      },
      9: {
        id: 9,
        parent: 8,
        text: "孙块",
        content: [{ t: "t", v: "孙块" }],
        children: []
      }
    })

    // 只收集到 7，8/9 因 7 是卡片而不下钻
    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([
      "使役形是什么？"
    ])
  })

  it("deduplicates identical summaries", () => {
    installBlocks({
      1: {
        id: 1,
        parent: null,
        text: "源块",
        content: [],
        children: [7, 8]
      },
      7: {
        id: 7,
        parent: 1,
        text: "使役形是什么？",
        content: [{ t: "t", v: "使役形是什么？" }],
        children: [],
        refs: cardRef("basic")
      },
      8: {
        id: 8,
        parent: 1,
        text: "使役形是什么？",
        content: [{ t: "t", v: "使役形是什么？" }],
        children: [],
        refs: cardRef("basic")
      }
    })

    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([
      "使役形是什么？"
    ])
  })

  it("returns empty for unknown or empty source blocks", () => {
    installBlocks({})
    expect(collectExistingCardExclusionSummaries(99, "orca-srs")).toEqual([])

    installBlocks({
      1: { id: 1, parent: null, text: "", content: [], children: [] }
    })
    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([])
  })

  it("respects depth and block budgets", () => {
    // 根(1) → 7 → 8 → 9 深度链，卡片在 9；默认 maxDepth=4 时应能扫到
    const deep = {
      1: {
        id: 1,
        parent: null,
        text: "根",
        content: [],
        children: [7]
      },
      7: {
        id: 7,
        parent: 1,
        text: "中间1",
        content: [],
        children: [8]
      },
      8: {
        id: 8,
        parent: 7,
        text: "中间2",
        content: [],
        children: [9]
      },
      9: {
        id: 9,
        parent: 8,
        text: "深处的卡",
        content: [{ t: "t", v: "深处的卡" }],
        children: [],
        refs: cardRef("basic")
      }
    }
    installBlocks(deep)
    expect(collectExistingCardExclusionSummaries(1, "orca-srs")).toEqual([
      "深处的卡"
    ])

    // 收紧深度到 2：9 在深度 3，扫不到
    expect(
      collectExistingCardExclusionSummaries(1, "orca-srs", { maxDepth: 2 })
    ).toEqual([])

    // 收紧块数到 2：只扫根 + 7，卡在 9 扫不到
    expect(
      collectExistingCardExclusionSummaries(1, "orca-srs", { maxBlocks: 2 })
    ).toEqual([])

    expect(EXISTING_CARD_DEDUPE_MAX_BLOCKS).toBeGreaterThan(0)
    expect(EXISTING_CARD_DEDUPE_MAX_DEPTH).toBeGreaterThan(0)
  })

  it("stops after the summary cap", () => {
    const children: Record<number, unknown> = {}
    const childIds: number[] = []
    for (let i = 0; i < 5; i++) {
      const id = 10 + i
      childIds.push(id)
      children[id] = {
        id,
        parent: 1,
        text: `卡 ${i}`,
        content: [{ t: "t", v: `卡 ${i}` }],
        children: [],
        refs: cardRef("basic")
      }
    }
    children[1] = {
      id: 1,
      parent: null,
      text: "根",
      content: [],
      children: childIds
    }
    installBlocks(children)

    const result = collectExistingCardExclusionSummaries(1, "orca-srs", {
      maxSummaries: 2
    })
    expect(result).toEqual(["卡 0", "卡 1"])
  })
})
