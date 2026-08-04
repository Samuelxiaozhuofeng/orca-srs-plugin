import { describe, expect, it, vi } from "vitest"
import {
  buildQuickCardRootText,
  resolveQuickCardSource
} from "./aiQuickCardFlow"
import type { CursorData } from "../../orca.d.ts"

function installBlocks(blocks: Record<number, unknown>) {
  ;(globalThis as any).orca = { state: { blocks } }
}

function cursor(
  anchorBlockId: number,
  opts: Partial<{ focusBlockId: number; index: number; from: number; to: number }> = {}
): CursorData {
  const focusBlockId = opts.focusBlockId ?? anchorBlockId
  const index = opts.index ?? 0
  return {
    anchor: { blockId: anchorBlockId, isInline: true, index, offset: opts.from ?? 0 },
    focus: { blockId: focusBlockId, isInline: true, index, offset: opts.to ?? 0 },
    isForward: true,
    panelId: "p1",
    rootBlockId: 1
  } as unknown as CursorData
}

describe("resolveQuickCardSource", () => {
  it("prefers the selection when there is one", () => {
    installBlocks({
      7: {
        id: 7,
        parent: 1,
        text: "使役形表示让某人做某事",
        content: [{ t: "t", v: "使役形表示让某人做某事" }]
      }
    })
    const source = resolveQuickCardSource(cursor(7, { from: 0, to: 3 }))
    expect(source).toEqual({
      blockId: 7,
      text: "使役形",
      fromSelection: true,
      multiBlock: false,
      truncated: false,
      charTruncated: false,
      structureTruncated: false
    })
  })

  it("falls back to the whole block when nothing is selected", () => {
    // 「光标停在块里直接按快捷键」是最顺手的用法，不该报错
    installBlocks({
      7: {
        id: 7,
        parent: 1,
        children: [8],
        text: "整块正文",
        content: [{ t: "t", v: "整块正文" }]
      },
      8: {
        id: 8,
        parent: 7,
        children: [],
        text: "子点",
        content: [{ t: "t", v: "子点" }]
      }
    })
    const source = resolveQuickCardSource(cursor(7))
    expect(source).toEqual({
      blockId: 7,
      text: "整块正文\n  子点",
      fromSelection: false,
      multiBlock: false,
      truncated: false,
      charTruncated: false,
      structureTruncated: false
    })
  })

  it("returns null for an empty block", () => {
    installBlocks({ 7: { id: 7, text: "   ", content: [] } })
    expect(resolveQuickCardSource(cursor(7))).toBeNull()
  })

  it("returns null when the block is unknown", () => {
    installBlocks({})
    expect(resolveQuickCardSource(cursor(99))).toBeNull()
  })

  it("uses joined cross-block selection and anchors on the end block", () => {
    installBlocks({
      1: { id: 1, parent: null, children: [7, 8], text: "p", content: [] },
      7: {
        id: 7,
        parent: 1,
        text: "第一块",
        content: [{ t: "t", v: "第一块" }]
      },
      8: {
        id: 8,
        parent: 1,
        text: "第二块",
        content: [{ t: "t", v: "第二块" }]
      }
    })
    const source = resolveQuickCardSource(
      cursor(7, { focusBlockId: 8, from: 0, to: 2 })
    )
    expect(source).toEqual({
      blockId: 8,
      text: "第一块\n第二",
      fromSelection: true,
      multiBlock: true,
      truncated: false,
      charTruncated: false,
      structureTruncated: false
    })
  })

  it("returns null for cross-parent multi-block selection", () => {
    installBlocks({
      7: {
        id: 7,
        parent: 1,
        text: "第一块",
        content: [{ t: "t", v: "第一块" }]
      },
      8: {
        id: 8,
        parent: 2,
        text: "第二块",
        content: [{ t: "t", v: "第二块" }]
      }
    })
    expect(
      resolveQuickCardSource(cursor(7, { focusBlockId: 8, from: 0, to: 2 }))
    ).toBeNull()
  })

  it("does not fall back to anchor text on multi-block empty_selection", () => {
    // content 空 → 跨块解析 empty；block.text 仍有值，旧逻辑会误用锚点全文
    installBlocks({
      1: { id: 1, parent: null, children: [7, 8], text: "p", content: [] },
      7: { id: 7, parent: 1, text: "KEEP_ME_ANCHOR", content: [] },
      8: { id: 8, parent: 1, text: "OTHER", content: [] }
    })
    expect(
      resolveQuickCardSource(cursor(7, { focusBlockId: 8, from: 0, to: 1 }))
    ).toBeNull()
  })
})

describe("buildQuickCardRootText", () => {
  it("names the card type and count so the preview is self-explanatory", () => {
    expect(buildQuickCardRootText("basic", 2)).toBe(
      "AI 快捷制卡 · 问答卡（2 张，待确认）"
    )
    expect(buildQuickCardRootText("choice", 1)).toContain("选择题")
  })
})
