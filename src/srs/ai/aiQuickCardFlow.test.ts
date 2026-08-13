import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildQuickCardRootText,
  resolveQuickCardSource,
  startQuickCardJob
} from "./aiQuickCardFlow"
import type { CursorData } from "../../orca.d.ts"
import { clearAISettingsCache } from "./aiSettingsSchema"

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

  it("uses IR extract #card body as source when cursor has no selection", () => {
    // 摘录阅读正文根就是 #card type=extracts；不能当纯闪卡整棵跳过
    installBlocks({
      7: {
        id: 7,
        parent: 1,
        children: [],
        text: "摘录正文：使役形表示让某人做某事",
        content: [{ t: "t", v: "摘录正文：使役形表示让某人做某事" }],
        refs: [
          {
            type: 2,
            alias: "card",
            data: [{ name: "type", value: "extracts" }]
          }
        ]
      }
    })
    const source = resolveQuickCardSource(cursor(7))
    expect(source).toEqual({
      blockId: 7,
      text: "摘录正文：使役形表示让某人做某事",
      fromSelection: false,
      multiBlock: false,
      truncated: false,
      charTruncated: false,
      structureTruncated: false
    })
  })

  it("still skips pure SRS #card when cursor has no selection", () => {
    installBlocks({
      7: {
        id: 7,
        parent: 1,
        children: [],
        text: "已有问答卡题面",
        content: [{ t: "t", v: "已有问答卡题面" }],
        refs: [
          {
            type: 2,
            alias: "card",
            data: [{ name: "type", value: "basic" }]
          }
        ]
      }
    })
    expect(resolveQuickCardSource(cursor(7))).toBeNull()
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

  it("resolves cross-parent selection when both share a common root", () => {
    // 7 挂在 1 下、8 挂在 2 下，但 1/2 同属根 0 → 前序连续区间可解析。
    // 前序：0,1,7,2,8 → 7 到 8 的区间 = [7, 2, 8]，中间块 2 全文 + 子树
    installBlocks({
      0: { id: 0, parent: null, children: [1, 2], text: "root", content: [] },
      1: { id: 1, parent: 0, children: [7], text: "p1", content: [] },
      2: { id: 2, parent: 0, children: [8], text: "p2", content: [] },
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
    ).toEqual({
      blockId: 8,
      text: "第一块\np2\n  第二块\n第二",
      fromSelection: true,
      multiBlock: true,
      truncated: false,
      charTruncated: false,
      structureTruncated: false
    })
  })

  it("returns null when ancestors are missing (cannot build a connected chain)", () => {
    // 父块 1/2 不在 state → 无法连通 → null（不退回锚点全文）
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

  it("selects P+children for card source and anchors on P", () => {
    installBlocks({
      10: {
        id: 10,
        parent: null,
        children: [7, 8],
        text: "父句",
        content: [{ t: "t", v: "父句" }]
      },
      7: {
        id: 7,
        parent: 10,
        text: "第一块",
        content: [{ t: "t", v: "第一块" }]
      },
      8: {
        id: 8,
        parent: 10,
        text: "第二块",
        content: [{ t: "t", v: "第二块" }]
      }
    })
    // 从父块 10 拖到子块 8：源文 = 父句 + 第一块 + 第二（切片），锚点挂在 P=10
    expect(
      resolveQuickCardSource(cursor(10, { focusBlockId: 8, from: 0, to: 2 }))
    ).toEqual({
      blockId: 10,
      text: "父句\n第一块\n第二",
      fromSelection: true,
      multiBlock: true,
      truncated: false,
      charTruncated: false,
      structureTruncated: false
    })
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
    expect(buildQuickCardRootText(["basic"], 2)).toBe(
      "AI 快捷制卡 · 问答卡（2 张，待确认）"
    )
    expect(buildQuickCardRootText(["choice"], 1)).toContain("选择题")
  })

  it("uses a generic label for the auto multi-type command", () => {
    expect(buildQuickCardRootText(["basic", "cloze", "choice"], 3)).toBe(
      "AI 快捷制卡 · 闪卡（3 张，待确认）"
    )
  })
})

describe("startQuickCardJob missing configuration", () => {
  afterEach(() => {
    clearAISettingsCache()
    vi.doUnmock("./aiServiceSettingsState")
    delete (globalThis as any).orca
  })

  it("opens connection settings without creating a background job", async () => {
    const openAIServiceSettings = vi.fn(async () => undefined)
    vi.doMock("./aiServiceSettingsState", () => ({ openAIServiceSettings }))
    ;(globalThis as any).orca = {
      notify: vi.fn(),
      state: {
        blocks: {},
        plugins: { "orca-srs": { settings: { "ai.apiKey": "" } } }
      }
    }
    clearAISettingsCache()

    const result = await startQuickCardJob({
      pluginName: "orca-srs",
      cursor: cursor(7),
      cardTypes: ["basic"]
    })

    expect(result).toBeNull()
    expect(openAIServiceSettings).toHaveBeenCalledWith("orca-srs")
    expect((globalThis as any).orca.notify).not.toHaveBeenCalled()
  })
})
