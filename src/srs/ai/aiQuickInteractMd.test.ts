import { describe, expect, it } from "vitest"
import {
  buildQuickResultInsertPlan,
  parseInlineMarkdownToFragments,
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
})
