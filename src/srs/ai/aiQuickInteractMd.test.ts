import { describe, expect, it } from "vitest"
import {
  buildQuickResultInsertPlan,
  parseInlineMarkdownToFragments,
  sanitizeAiTextForOrcaInsert,
  splitMarkdownIntoStructuralBlocks,
  structuralBlockToFragments
} from "./aiQuickInteractMd"

describe("parseInlineMarkdownToFragments", () => {
  it("parses bold with **", () => {
    expect(parseInlineMarkdownToFragments("有**重点**词")).toEqual([
      { t: "t", v: "有" },
      { t: "t", v: "重点", f: "b" },
      { t: "t", v: "词" }
    ])
  })

  it("parses italic with *", () => {
    expect(parseInlineMarkdownToFragments("是*斜体*啊")).toEqual([
      { t: "t", v: "是" },
      { t: "t", v: "斜体", f: "i" },
      { t: "t", v: "啊" }
    ])
  })

  it("strips inline code backticks as plain text", () => {
    expect(parseInlineMarkdownToFragments("用`foo`代码")).toEqual([
      { t: "t", v: "用" },
      { t: "t", v: "foo" },
      { t: "t", v: "代码" }
    ])
  })
})

describe("splitMarkdownIntoStructuralBlocks", () => {
  it("splits list items into separate blocks", () => {
    const blocks = splitMarkdownIntoStructuralBlocks(
      "导语一段。\n\n- 第一点 **粗**\n- 第二点\n\n结尾。"
    )
    expect(blocks).toEqual([
      { kind: "paragraph", text: "导语一段。" },
      { kind: "list_item", text: "第一点 **粗**" },
      { kind: "list_item", text: "第二点" },
      { kind: "paragraph", text: "结尾。" }
    ])
  })

  it("supports numbered lists and headings", () => {
    const blocks = splitMarkdownIntoStructuralBlocks(
      "## 标题\n\n1. 一项\n2. 二项"
    )
    expect(blocks).toEqual([
      { kind: "heading", text: "标题", level: 2 },
      { kind: "list_item", text: "一项" },
      { kind: "list_item", text: "二项" }
    ])
  })
})

describe("structuralBlockToFragments + buildQuickResultInsertPlan", () => {
  it("does not prefix list items with bullet character", () => {
    expect(
      structuralBlockToFragments({ kind: "list_item", text: "hello **x**" })
    ).toEqual([
      { t: "t", v: "hello " },
      { t: "t", v: "x", f: "b" }
    ])
  })

  it("builds title + indented children plan", () => {
    const plan = buildQuickResultInsertPlan(
      "举例说明",
      "先看 **重点**。\n\n- 条目甲\n- 条目乙"
    )
    expect(plan.title).toEqual([
      { t: "t", v: "AI · " },
      { t: "t", v: "举例说明", f: "b" }
    ])
    expect(plan.children).toHaveLength(3)
    expect(plan.children[0]).toEqual([
      { t: "t", v: "先看 " },
      { t: "t", v: "重点", f: "b" },
      { t: "t", v: "。" }
    ])
    expect(plan.children[1]).toEqual([{ t: "t", v: "条目甲" }])
    expect(plan.children[2]).toEqual([{ t: "t", v: "条目乙" }])
    expect(plan.bodyMarkdown).toContain("- 条目甲")
  })

  it("sanitizes web-search numeric footnotes that Orca would treat as block refs", () => {
    // 与 repo 6emicuv1sv76k block 4457 同形
    const raw =
      "金价网约 887.10 元/克1(https://www.jinjia.com.cn/au9999/)\n" +
      "东方财富2(https://quote.eastmoney.com/globalfuture/AU9999.html)\n" +
      "另见 [3](https://cn.tradingview.com/symbols/XAUUSD/) 与 [[4]]"
    const cleaned = sanitizeAiTextForOrcaInsert(raw)
    expect(cleaned).toContain(
      "[源1](https://www.jinjia.com.cn/au9999/)"
    )
    expect(cleaned).toContain(
      "[源2](https://quote.eastmoney.com/globalfuture/AU9999.html)"
    )
    expect(cleaned).toContain(
      "[源3](https://cn.tradingview.com/symbols/XAUUSD/)"
    )
    expect(cleaned).toContain("〔4〕")
    expect(cleaned).not.toMatch(/(^|[^\]\w])1\(/)
    expect(cleaned).not.toContain("[[4]]")

    const plan = buildQuickResultInsertPlan("今日金价", raw)
    expect(plan.bodyMarkdown).toContain("[源1](https://www.jinjia.com.cn/au9999/)")
  })
})
