import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import {
  buildQuickInteractUserPrompt,
  clipText,
  extractSelectedTextFromCursor,
  insertQuickResult,
  isStrictDescendantOf,
  keepSelectedQuickResultBlocks,
  QUICK_SELECTION_MAX,
  toggleQuickResultBlockSelection,
  AI_SOURCE_SUBTREE_MAX_BLOCKS,
  collectBoundedSubtreePlainText,
  createSubtreeCollectBudget
} from "./aiQuickInteract"
import {
  clearToolbarAIPromptCache,
  DEFAULT_TOOLBAR_AI_PROMPTS,
  getToolbarAIPrompts,
  hydrateToolbarAIPromptLibrary,
  normalizeToolbarAIPromptItems,
  parseResultTagsInput,
  PROMPT_LIBRARY_DATA_KEY,
  PROMPT_LIBRARY_LEGACY_KEY,
  PROMPT_LIBRARY_STORAGE_KEY,
  resetToolbarAIPromptsToDefault,
  saveToolbarAIPrompts
} from "./aiToolbarPromptStore"
import { clearAISettingsCache } from "./aiSettingsSchema"

const PLUGIN = "orca-srs"

function makeCursor(partial: {
  blockId: number
  anchorOffset: number
  focusOffset: number
  anchorIndex?: number
  focusIndex?: number
  focusBlockId?: number
  isForward?: boolean
}): CursorData {
  const anchorIndex = partial.anchorIndex ?? 0
  const focusIndex = partial.focusIndex ?? anchorIndex
  const focusBlockId = partial.focusBlockId ?? partial.blockId
  const isForward =
    partial.isForward ??
    (focusBlockId !== partial.blockId
      ? true
      : partial.focusOffset >= partial.anchorOffset)
  return {
    isForward,
    panelId: "p1",
    rootBlockId: partial.blockId,
    anchor: {
      blockId: partial.blockId,
      isInline: true,
      index: anchorIndex,
      offset: partial.anchorOffset
    },
    focus: {
      blockId: focusBlockId,
      isInline: true,
      index: focusIndex,
      offset: partial.focusOffset
    }
  }
}

describe("extractSelectedTextFromCursor", () => {
  beforeEach(() => {
    ;(globalThis as any).orca = {
      state: {
        blocks: {
          10: {
            id: 10,
            parent: null,
            children: [1, 2, 3],
            text: "parent",
            content: [{ t: "t", v: "parent" }]
          },
          1: {
            id: 1,
            parent: 10,
            text: "Hello world example",
            content: [{ t: "t", v: "Hello world example" }]
          },
          2: {
            id: 2,
            parent: 10,
            text: "other",
            content: [{ t: "t", v: "other" }]
          },
          3: {
            id: 3,
            parent: 10,
            text: "third",
            content: [{ t: "t", v: "third" }]
          },
          99: {
            id: 99,
            parent: 999,
            text: "orphan",
            content: [{ t: "t", v: "orphan" }]
          }
        },
        plugins: { [PLUGIN]: { settings: {} } }
      }
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (globalThis as any).orca
  })

  it("extracts substring from single fragment selection", () => {
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 6,
      focusOffset: 11
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.blockId).toBe(1)
    expect(got!.selectedText).toBe("world")
    expect(got!.blockText).toBe("Hello world example")
    expect(got!.multiBlock).toBe(false)
    expect(got!.truncated).toBe(false)
    expect(got!.charTruncated).toBe(false)
    expect(got!.structureTruncated).toBe(false)
  })

  it("returns null when no real selection (collapsed)", () => {
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 3,
      focusOffset: 3
    })
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })

  it("extracts cross-block sibling selection and anchors on end block", () => {
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 2,
      anchorOffset: 6,
      focusOffset: 3
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.multiBlock).toBe(true)
    // first from offset 6 → "world example"; second to offset 3 → "oth"
    expect(got!.selectedText).toBe("world example\noth")
    expect(got!.blockId).toBe(2)
    expect(got!.blockText).toBe("")
  })

  it("joins whole-block multi-select when isInline is false", () => {
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 3,
      anchorOffset: 0,
      focusOffset: 0
    })
    cursor.anchor.isInline = false
    cursor.focus.isInline = false
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.selectedText).toBe("Hello world example\nother\nthird")
    expect(got!.blockId).toBe(3)
  })

  it("treats both-ends-at-block-start as whole-block range (isInline true)", () => {
    // Sol 复现：两端 offset=0 时行内切片会丢掉末块
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 3,
      anchorOffset: 0,
      focusOffset: 0,
      isForward: true
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.selectedText).toBe("Hello world example\nother\nthird")
    expect(got!.blockId).toBe(3)
    expect(got!.multiBlock).toBe(true)
  })

  it("keeps partial cross-block when start is mid-block and end offset is 0", () => {
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 2,
      anchorOffset: 6,
      focusOffset: 0,
      isForward: true
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    // first from 6 → "world example"; last empty → dropped
    expect(got!.selectedText).toBe("world example")
    expect(got!.blockId).toBe(2)
  })

  it("anchors on document-order end block when isForward is false", () => {
    const cursor = makeCursor({
      blockId: 2,
      focusBlockId: 1,
      anchorOffset: 3,
      focusOffset: 0,
      isForward: false
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    // reading order: block1 from 0 → full, block2 to offset 3 → "oth"
    expect(got!.selectedText).toBe("Hello world example\noth")
    expect(got!.blockId).toBe(2)
  })

  it("extracts ancestor→descendant drag P→child3 and anchors on P", () => {
    // 块 10 = P，子块 1/2/3；从 P 的 offset 4 拖到子块 3 的 offset 3
    const cursor = makeCursor({
      blockId: 10,
      focusBlockId: 3,
      anchorOffset: 4,
      focusOffset: 3
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.multiBlock).toBe(true)
    // P 从 offset 4 切片 → "nt"；中间块 1/2 全文；子块 3 到 offset 3 → "thi"
    expect(got!.selectedText).toBe("nt\nHello world example\nother\nthi")
    expect(got!.blockId).toBe(10)
  })

  it("anchors on ancestor P when dragging up from child to P", () => {
    const cursor = makeCursor({
      blockId: 3,
      focusBlockId: 10,
      anchorOffset: 3,
      focusOffset: 0,
      isForward: false
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.selectedText).toBe("parent\nHello world example\nother\nthi")
    expect(got!.blockId).toBe(10)
  })

  it("whole-block multi-select of P+child3 includes P subtree and anchors on P", () => {
    const cursor = makeCursor({
      blockId: 10,
      focusBlockId: 3,
      anchorOffset: 0,
      focusOffset: 0,
      isForward: true
    })
    cursor.anchor.isInline = false
    cursor.focus.isInline = false
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.multiBlock).toBe(true)
    // P 整棵子树（2 空格缩进），visited 去重避免子块重复
    expect(got!.selectedText).toBe(
      "parent\n  Hello world example\n  other\n  third"
    )
    expect(got!.blockId).toBe(10)
  })

  it("extracts cross-fragment selection within one block", () => {
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
      parent: 10,
      text: "aabb",
      content: [
        { t: "t", v: "aa" },
        { t: "t", v: "bb" }
      ]
    }
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 0,
      focusOffset: 1,
      anchorIndex: 0,
      focusIndex: 1
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.selectedText).toBe("aab")
    expect(got!.multiBlock).toBe(false)
  })

  it("returns null when blocks are not same-parent siblings", () => {
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 99,
      anchorOffset: 0,
      focusOffset: 2
    })
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })

  it("returns null for whitespace-only selection", () => {
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
      parent: 10,
      text: "a   b",
      content: [{ t: "t", v: "a   b" }]
    }
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 1,
      focusOffset: 4
    })
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })

  it("caps overlong selection without injecting truncated marker into source text", () => {
    const long = "x".repeat(QUICK_SELECTION_MAX + 50)
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
      parent: 10,
      text: long,
      content: [{ t: "t", v: long }]
    }
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 0,
      focusOffset: long.length
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.truncated).toBe(true)
    expect(got!.selectedText.length).toBe(QUICK_SELECTION_MAX)
    expect(got!.selectedText.includes("truncated")).toBe(false)
  })

  it("includes indented child subtrees for whole-block multi-select", () => {
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
      parent: 10,
      children: [11, 12],
      text: "父A",
      content: [{ t: "t", v: "父A" }]
    }
    ;(globalThis as any).orca.state.blocks[11] = {
      id: 11,
      parent: 1,
      children: [],
      text: "子A1",
      content: [{ t: "t", v: "子A1" }]
    }
    ;(globalThis as any).orca.state.blocks[12] = {
      id: 12,
      parent: 1,
      children: [],
      text: "子A2",
      content: [{ t: "t", v: "子A2" }]
    }
    ;(globalThis as any).orca.state.blocks[2] = {
      id: 2,
      parent: 10,
      children: [21],
      text: "父B",
      content: [{ t: "t", v: "父B" }]
    }
    ;(globalThis as any).orca.state.blocks[21] = {
      id: 21,
      parent: 2,
      children: [],
      text: "子B1",
      content: [{ t: "t", v: "子B1" }]
    }
    // #card 子块应跳过
    ;(globalThis as any).orca.state.blocks[2].children = [21, 22]
    ;(globalThis as any).orca.state.blocks[22] = {
      id: 22,
      parent: 2,
      children: [],
      text: "这是卡片",
      content: [{ t: "t", v: "这是卡片" }],
      refs: [{ type: 2, alias: "card" }]
    }

    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 2,
      anchorOffset: 0,
      focusOffset: 0,
      isForward: true
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.selectedText).toBe("父A\n  子A1\n  子A2\n父B\n  子B1")
    expect(got!.selectedText.includes("这是卡片")).toBe(false)
    expect(got!.blockId).toBe(2)
  })

  it("shares a global 80-block budget across sibling subtrees", () => {
    // 两个兄弟各带很多叶子；共享预算合计不超过 80
    const parent = 10
    const blocks: Record<number, any> = {
      [parent]: {
        id: parent,
        parent: null,
        children: [1, 2],
        text: "p",
        content: []
      },
      1: {
        id: 1,
        parent,
        children: [] as number[],
        text: "A",
        content: [{ t: "t", v: "A" }]
      },
      2: {
        id: 2,
        parent,
        children: [] as number[],
        text: "B",
        content: [{ t: "t", v: "B" }]
      }
    }
    for (let i = 0; i < 50; i++) {
      const id = 100 + i
      blocks[1].children.push(id)
      blocks[id] = {
        id,
        parent: 1,
        children: [],
        text: `a${i}`,
        content: [{ t: "t", v: `a${i}` }]
      }
    }
    for (let i = 0; i < 50; i++) {
      const id = 200 + i
      blocks[2].children.push(id)
      blocks[id] = {
        id,
        parent: 2,
        children: [],
        text: `b${i}`,
        content: [{ t: "t", v: `b${i}` }]
      }
    }
    ;(globalThis as any).orca.state.blocks = blocks

    const budget = createSubtreeCollectBudget()
    collectBoundedSubtreePlainText(1, { budget })
    collectBoundedSubtreePlainText(2, { budget })
    expect(budget.blocksUsed).toBeLessThanOrEqual(AI_SOURCE_SUBTREE_MAX_BLOCKS)
    expect(budget.truncatedByStructure).toBe(true)
  })

  it("extractSelectedTextFromCursor applies shared budget on whole multi-select", () => {
    // 公开入口：两棵各 50 叶的兄弟 → 合计触顶 structureTruncated，而非 100 块全进源文
    const parent = 10
    const blocks: Record<number, any> = {
      [parent]: {
        id: parent,
        parent: null,
        children: [1, 2],
        text: "p",
        content: []
      },
      1: {
        id: 1,
        parent,
        children: [] as number[],
        text: "RootA",
        content: [{ t: "t", v: "RootA" }]
      },
      2: {
        id: 2,
        parent,
        children: [] as number[],
        text: "RootB",
        content: [{ t: "t", v: "RootB" }]
      }
    }
    for (let i = 0; i < 50; i++) {
      const idA = 1000 + i
      const idB = 2000 + i
      blocks[1].children.push(idA)
      blocks[2].children.push(idB)
      blocks[idA] = {
        id: idA,
        parent: 1,
        children: [],
        text: `leafA${i}`,
        content: [{ t: "t", v: `leafA${i}` }]
      }
      blocks[idB] = {
        id: idB,
        parent: 2,
        children: [],
        text: `leafB${i}`,
        content: [{ t: "t", v: `leafB${i}` }]
      }
    }
    ;(globalThis as any).orca.state.blocks = blocks
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 2,
      anchorOffset: 0,
      focusOffset: 0,
      isForward: true
    })
    const got = extractSelectedTextFromCursor(cursor)
    expect(got).not.toBeNull()
    expect(got!.structureTruncated).toBe(true)
    expect(got!.truncated).toBe(true)
    // 若每棵树各 80，会看到更多 leafB；共享 80 后第二棵大量叶子进不来
    const leafBCount = (got!.selectedText.match(/leafB/g) ?? []).length
    expect(leafBCount).toBeLessThan(50)
  })

  it("rejects partial selection on a #card block", () => {
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
      parent: 10,
      text: "card body here",
      content: [{ t: "t", v: "card body here" }],
      refs: [{ type: 2, alias: "card" }]
    }
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 0,
      focusOffset: 4
    })
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })
})

describe("getToolbarAIPrompts (prompt library store)", () => {
  afterEach(() => {
    clearToolbarAIPromptCache()
    delete (globalThis as any).orca
  })

  it("falls back to defaults when library never written", () => {
    ;(globalThis as any).orca = {
      state: { plugins: { [PLUGIN]: { settings: {} } } }
    }
    const list = getToolbarAIPrompts(PLUGIN)
    expect(list.length).toBe(DEFAULT_TOOLBAR_AI_PROMPTS.length)
    expect(list[0].label).toBe("举例说明")
    expect(list[0].id).toBe("0")
    expect(list[0].prompt.length).toBeGreaterThan(0)
    expect(list[0].insertBelowOnComplete).toBe(true)
  })

  it("parses valid custom array from settings fallback before hydrate", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                {
                  label: "  摘要  ",
                  prompt: "  请摘要  ",
                  includeBlockContext: false
                },
                { label: "空提示词", prompt: "   " },
                { label: "", prompt: "无效" },
                { notItem: true },
                { label: "翻译", prompt: "译成英文" }
              ]
            }
          }
        }
      }
    }
    const list = getToolbarAIPrompts(PLUGIN)
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({
      id: "0",
      label: "摘要",
      prompt: "请摘要",
      includeBlockContext: false,
      insertBelowOnComplete: false,
      directWriteBelow: false,
      resultTags: [],
      reuseSameResultBlock: false,
      model: ""
    })
    // 旧项无 includeBlockContext → true；无 insertBelowOnComplete / directWriteBelow → false；无 model → ""
    expect(list[1]).toEqual({
      id: "1",
      label: "翻译",
      prompt: "译成英文",
      includeBlockContext: true,
      insertBelowOnComplete: false,
      directWriteBelow: false,
      resultTags: [],
      reuseSameResultBlock: false,
      model: ""
    })
  })

  it("reads legacy settings key when new key absent", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_LEGACY_KEY]: [
                { label: "旧库", prompt: "旧提示" }
              ]
            }
          }
        }
      }
    }
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([
      {
        id: "0",
        label: "旧库",
        prompt: "旧提示",
        includeBlockContext: true,
        insertBelowOnComplete: false,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
  })

  it("prefers settings primary key over legacy", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                {
                  label: "新",
                  prompt: "新内容",
                  includeBlockContext: false,
                  insertBelowOnComplete: true
                }
              ],
              [PROMPT_LIBRARY_LEGACY_KEY]: [{ label: "旧", prompt: "旧内容" }]
            }
          }
        }
      }
    }
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([
      {
        id: "0",
        label: "新",
        prompt: "新内容",
        includeBlockContext: false,
        insertBelowOnComplete: true,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
  })

  it("preserves per-prompt model override and trims it", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                {
                  label: "金价查询",
                  prompt: "查今日金价",
                  includeBlockContext: false,
                  insertBelowOnComplete: true,
                  model: "  grok-4.5  "
                }
              ]
            }
          }
        }
      }
    }
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([
      {
        id: "0",
        label: "金价查询",
        prompt: "查今日金价",
        includeBlockContext: false,
        insertBelowOnComplete: true,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: "grok-4.5"
      }
    ])
  })

  it("parses directWriteBelow and prefers it over insertBelowOnComplete when both true", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                {
                  label: "查词",
                  prompt: "解释词义",
                  includeBlockContext: true,
                  insertBelowOnComplete: true,
                  directWriteBelow: true,
                  resultTags: [],
                  reuseSameResultBlock: false,
                }
              ]
            }
          }
        }
      }
    }
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([
      {
        id: "0",
        label: "查词",
        prompt: "解释词义",
        includeBlockContext: true,
        insertBelowOnComplete: false,
        directWriteBelow: true,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
  })

  it("returns empty list for explicit empty array (no default fallback)", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: []
            }
          }
        }
      }
    }
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([])
  })

  it("returns empty list when array exists but all items dirty/empty", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                { label: "", prompt: "" },
                { foo: 1 },
                "bad"
              ]
            }
          }
        }
      }
    }
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([])
  })
})

describe("parseResultTagsInput", () => {
  it("parses comma/space, strips #, dedupes case-insensitively", () => {
    expect(parseResultTagsInput("英语, #词汇  英语")).toEqual(["英语", "词汇"])
    expect(parseResultTagsInput(["#Foo", "foo", "Bar"])).toEqual(["Foo", "Bar"])
    expect(parseResultTagsInput("")).toEqual([])
    expect(parseResultTagsInput(null)).toEqual([])
    expect(parseResultTagsInput("tagA\ntagB")).toEqual(["tagA", "tagB"])
    expect(parseResultTagsInput("###")).toEqual([])
    expect(parseResultTagsInput([1, "ok", null] as unknown[])).toEqual(["ok"])
  })
})

describe("normalizeToolbarAIPromptItems / saveToolbarAIPrompts (setData)", () => {
  afterEach(() => {
    clearToolbarAIPromptCache()
    delete (globalThis as any).orca
    vi.restoreAllMocks()
  })

  it("normalize trims and drops empty/dirty items", () => {
    expect(
      normalizeToolbarAIPromptItems([
        {
          label: "  A  ",
          prompt: "  p  ",
          includeBlockContext: false,
          insertBelowOnComplete: true
        },
        { label: "", prompt: "x" },
        { label: "y", prompt: "  " },
        null,
        { label: "B", prompt: "q" },
        {
          label: "C",
          prompt: "direct",
          insertBelowOnComplete: true,
          directWriteBelow: true,
          resultTags: [],
          reuseSameResultBlock: false,
        }
      ])
    ).toEqual([
      {
        label: "A",
        prompt: "p",
        includeBlockContext: false,
        insertBelowOnComplete: true,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      },
      {
        label: "B",
        prompt: "q",
        includeBlockContext: true,
        insertBelowOnComplete: false,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      },
      {
        label: "C",
        prompt: "direct",
        includeBlockContext: true,
        insertBelowOnComplete: false,
        directWriteBelow: true,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
    expect(normalizeToolbarAIPromptItems(undefined)).toEqual([])
    expect(normalizeToolbarAIPromptItems("bad")).toEqual([])
  })

  it("saveToolbarAIPrompts uses setData and does not call setSettings", async () => {
    const dataStore: Record<string, string> = {}
    const setData = vi.fn(async (_name: string, key: string, value: string) => {
      dataStore[key] = value
    })
    const setSettings = vi.fn(async () => {
      throw new Error("setSettings must not be called for prompt library")
    })
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "keep-me",
              "ai.apiUrl": "https://example.com/v1/chat/completions",
              [PROMPT_LIBRARY_LEGACY_KEY]: [{ label: "旧", prompt: "旧内容" }]
            }
          }
        }
      },
      plugins: { setData, setSettings, getData: async (_n: string, key: string) => dataStore[key] ?? null }
    }

    const saved = await saveToolbarAIPrompts(PLUGIN, [
      {
        label: "  新  ",
        prompt: "  内容  ",
        includeBlockContext: false,
        insertBelowOnComplete: true,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      },
      {
        label: "",
        prompt: "丢弃",
        includeBlockContext: true,
        insertBelowOnComplete: false,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
    expect(setSettings).not.toHaveBeenCalled()
    expect(setData).toHaveBeenCalledWith(
      PLUGIN,
      PROMPT_LIBRARY_DATA_KEY,
      JSON.stringify([
        {
          label: "新",
          prompt: "内容",
          includeBlockContext: false,
          insertBelowOnComplete: true,
          directWriteBelow: false,
          resultTags: [],
          reuseSameResultBlock: false,
          model: ""
        }
      ])
    )
    expect(saved).toEqual([
      {
        id: "0",
        label: "新",
        prompt: "内容",
        includeBlockContext: false,
        insertBelowOnComplete: true,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
    // 原生 AI 设置保持不动
    expect(orca.state.plugins[PLUGIN]?.settings?.["ai.apiKey"]).toBe("keep-me")
    expect(orca.state.plugins[PLUGIN]?.settings?.["ai.apiUrl"]).toBe(
      "https://example.com/v1/chat/completions"
    )

    const empty = await saveToolbarAIPrompts(PLUGIN, [])
    expect(setData).toHaveBeenLastCalledWith(
      PLUGIN,
      PROMPT_LIBRARY_DATA_KEY,
      "[]"
    )
    expect(empty).toEqual([])
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([])
  })

  it("resetToolbarAIPromptsToDefault writes DEFAULT list via setData", async () => {
    const setData = vi.fn(async () => {})
    const setSettings = vi.fn()
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "secret",
              [PROMPT_LIBRARY_STORAGE_KEY]: []
            }
          }
        }
      },
      plugins: { setData, setSettings }
    }

    const list = await resetToolbarAIPromptsToDefault(PLUGIN)
    expect(list.length).toBe(DEFAULT_TOOLBAR_AI_PROMPTS.length)
    expect(list[0].label).toBe("举例说明")
    expect(list[0].includeBlockContext).toBe(true)
    expect(list[0].insertBelowOnComplete).toBe(true)
    expect(list[1].includeBlockContext).toBe(false)
    expect(list[1].insertBelowOnComplete).toBe(true)
    expect(setSettings).not.toHaveBeenCalled()
    expect(setData).toHaveBeenCalledWith(
      PLUGIN,
      PROMPT_LIBRARY_DATA_KEY,
      JSON.stringify(
        DEFAULT_TOOLBAR_AI_PROMPTS.map((p) => ({
          label: p.label.trim(),
          prompt: p.prompt.trim(),
          includeBlockContext: p.includeBlockContext,
          insertBelowOnComplete: p.insertBelowOnComplete,
          directWriteBelow: p.directWriteBelow,
          resultTags: p.resultTags,
          reuseSameResultBlock: p.reuseSameResultBlock,
          model: p.model
        }))
      )
    )
    expect(orca.state.plugins[PLUGIN]?.settings?.["ai.apiKey"]).toBe("secret")
  })

  it("saveToolbarAIPrompts propagates setData failure", async () => {
    const setData = vi.fn(async () => {
      throw new Error("disk full")
    })
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: { settings: { "ai.apiKey": "keep" } }
        }
      },
      plugins: { setData, setSettings: vi.fn() }
    }
    await expect(
      saveToolbarAIPrompts(PLUGIN, [
        {
          label: "A",
          prompt: "B",
          includeBlockContext: true,
          insertBelowOnComplete: false,
          directWriteBelow: false,
          resultTags: [],
          reuseSameResultBlock: false,
          model: ""
        }
      ])
    ).rejects.toThrow("disk full")
    expect(orca.state.plugins[PLUGIN]?.settings?.["ai.apiKey"]).toBe("keep")
  })

  it("hydrate prefers setData over settings and migrates settings → setData", async () => {
    const dataStore: Record<string, string | null> = {}
    const setData = vi.fn(async (_n: string, key: string, value: string) => {
      dataStore[key] = value
    })
    const getData = vi.fn(async (_n: string, key: string) => dataStore[key] ?? null)
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "keep-me",
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                { label: "从设置迁移", prompt: "p", includeBlockContext: true }
              ]
            }
          }
        }
      },
      plugins: { getData, setData, setSettings: vi.fn() }
    }

    const list = await hydrateToolbarAIPromptLibrary(PLUGIN)
    expect(list).toEqual([
      {
        id: "0",
        label: "从设置迁移",
        prompt: "p",
        includeBlockContext: true,
        insertBelowOnComplete: false,
        directWriteBelow: false,
        resultTags: [],
        reuseSameResultBlock: false,
        model: ""
      }
    ])
    expect(setData).toHaveBeenCalled()
    expect(orca.state.plugins[PLUGIN]?.settings?.["ai.apiKey"]).toBe("keep-me")
    expect(getToolbarAIPrompts(PLUGIN)[0].label).toBe("从设置迁移")
  })

  it("hydrate reads setData JSON and ignores settings", async () => {
    const getData = vi.fn(async () =>
      JSON.stringify([
        {
          label: "data层",
          prompt: "来自 data",
          includeBlockContext: false,
          insertBelowOnComplete: true
        }
      ])
    )
    const setData = vi.fn()
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                { label: "settings层", prompt: "应被忽略" }
              ]
            }
          }
        }
      },
      plugins: { getData, setData, setSettings: vi.fn() }
    }

    const list = await hydrateToolbarAIPromptLibrary(PLUGIN)
    expect(list[0].label).toBe("data层")
    expect(setData).not.toHaveBeenCalled()
  })
})

describe("insertQuickResult positions", () => {
  afterEach(() => {
    delete (globalThis as any).orca
    vi.restoreAllMocks()
  })

  function setupInsertMock(opts?: { batchFail?: boolean; propFail?: boolean }) {
    let nextId = 100
    const blocks: Record<number, any> = {
      10: {
        id: 10,
        text: "query",
        content: [{ t: "t", v: "query" }],
        children: [] as number[],
        refs: [] as any[],
        properties: [] as any[]
      }
    }
    const invokeEditorCommand = vi.fn(async (cmd: string, _c: unknown, ...args: any[]) => {
      if (cmd === "core.editor.insertBlock") {
        const ref = args[0]
        const position = args[1]
        const content = args[2]
        const id = nextId++
        blocks[id] = {
          id,
          text: Array.isArray(content)
            ? content.map((f: any) => f.v).join("")
            : "",
          content,
          children: [] as number[],
          refs: [] as any[],
          properties: [] as any[],
          parent: position === "lastChild" ? ref?.id : ref?.parent,
          left: ref?.id
        }
        if (position === "lastChild" && ref?.id != null && blocks[ref.id]) {
          blocks[ref.id].children = [...(blocks[ref.id].children ?? []), id]
        }
        // keep orca.state.blocks in sync for resolveBlockById
        ;(globalThis as any).orca.state.blocks = blocks
        return id
      }
      if (cmd === "core.editor.batchInsertText") {
        if (opts?.batchFail) throw new Error("batch fail")
        return undefined
      }
      if (cmd === "core.editor.setProperties") {
        if (opts?.propFail) throw new Error("setProperties denied")
        const targetIds = args[0] as number[]
        const props = args[1]
        for (const tid of targetIds) {
          if (!blocks[tid]) continue
          // 测试侧用 object 字典存属性，便于断言；读取侧 getBlockPropertyValue 同时支持 array/object
          const asObj: Record<string, unknown> = {
            ...(blocks[tid].properties &&
            !Array.isArray(blocks[tid].properties)
              ? blocks[tid].properties
              : Array.isArray(blocks[tid].properties)
                ? Object.fromEntries(
                    blocks[tid].properties.map((p: any) => [p.name, p.value])
                  )
                : {})
          }
          if (Array.isArray(props)) {
            for (const p of props) {
              asObj[p.name] = p.value
            }
          } else if (props && typeof props === "object") {
            Object.assign(asObj, props)
          }
          blocks[tid].properties = asObj
        }
        ;(globalThis as any).orca.state.blocks = blocks
        return undefined
      }
      if (cmd === "core.editor.insertTag") {
        const blockId = args[0] as number
        const alias = args[1] as string
        if (!blocks[blockId]) throw new Error("insertTag missing block")
        blocks[blockId].refs = [
          ...(blocks[blockId].refs ?? []),
          { id: nextId++, from: blockId, to: 1, type: 2, alias }
        ]
        ;(globalThis as any).orca.state.blocks = blocks
        return 1
      }
      throw new Error(`unexpected command ${cmd}`)
    })
    const invokeGroup = vi.fn(async (fn: () => Promise<void>) => {
      await fn()
    })
    ;(globalThis as any).orca = {
      state: { blocks },
      commands: { invokeEditorCommand, invokeGroup },
      invokeBackend: vi.fn(async () => null)
    }
    return { invokeEditorCommand, blocks }
  }

  it("inserts title as lastChild when position is lastChild and sets srs.ai.quickResult property with preview status", async () => {
    const { invokeEditorCommand, blocks } = setupInsertMock()
    const result = await insertQuickResult(10, "hello **world**", "举例说明", "lastChild", "工作记忆")
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.blockId).toBe(100)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [100],
      expect.arrayContaining([
        expect.objectContaining({
          name: "srs.ai.quickResult",
          value: true,
          type: 4
        }),
        expect.objectContaining({
          name: "srs.ai.status",
          value: "preview",
          type: 1
        }),
        expect.objectContaining({
          name: "srs.ai.promptLabel",
          value: "举例说明",
          type: 1
        }),
        expect.objectContaining({
          name: "srs.ai.selectedText",
          value: "工作记忆",
          type: 1
        })
      ])
    )
    expect(blocks[100].properties["srs.ai.quickResult"]).toBe(true)
    expect(blocks[100].properties["srs.ai.status"]).toBe("preview")
  })

  it("inserts with kept status when options.status is kept (direct write)", async () => {
    const { blocks } = setupInsertMock()
    const result = await insertQuickResult(
      10,
      "词义解释",
      "查词",
      "lastChild",
      "apple",
      { status: "kept" }
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(blocks[result.blockId].properties["srs.ai.status"]).toBe("kept")
  })

  it("returns failure when setProperties throws (no silent success)", async () => {
    setupInsertMock({ propFail: true })
    const result = await insertQuickResult(
      10,
      "词义解释",
      "查词",
      "lastChild",
      "apple",
      { status: "kept" }
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("设置 AI 结果属性失败")
    expect(result.error).toContain("setProperties denied")
  })

  it("applies result tags via insertTag on the result root", async () => {
    const { invokeEditorCommand, blocks } = setupInsertMock()
    const result = await insertQuickResult(
      10,
      "释义正文",
      "英语闪卡",
      "lastChild",
      "trade-offs",
      { status: "kept", tags: ["英语", "词汇"] }
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      result.blockId,
      "英语"
    )
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      result.blockId,
      "词汇"
    )
    const aliases = (blocks[result.blockId].refs ?? []).map((r: any) => r.alias)
    expect(aliases).toEqual(expect.arrayContaining(["英语", "词汇"]))
  })

  it("returns failure when insertTag throws", async () => {
    const { invokeEditorCommand } = setupInsertMock()
    invokeEditorCommand.mockImplementation(async (cmd: string, ...args: any[]) => {
      if (cmd === "core.editor.insertTag") {
        throw new Error("tag denied")
      }
      // fall through to original mock behavior by re-calling default path is hard;
      // reinstall minimal handling:
      if (cmd === "core.editor.insertBlock") {
        const ref = args[1]
        const position = args[2]
        const content = args[3]
        const id = 200
        const blocks = (globalThis as any).orca.state.blocks
        blocks[id] = {
          id,
          text: Array.isArray(content) ? content.map((f: any) => f.v).join("") : "",
          content,
          children: [],
          refs: [],
          properties: {},
          parent: position === "lastChild" ? ref?.id : ref?.parent
        }
        if (position === "lastChild" && ref?.id != null && blocks[ref.id]) {
          blocks[ref.id].children = [...(blocks[ref.id].children ?? []), id]
        }
        return id
      }
      if (cmd === "core.editor.setProperties") {
        const targetIds = args[1] as number[]
        const props = args[2]
        const blocks = (globalThis as any).orca.state.blocks
        for (const tid of targetIds) {
          if (!blocks[tid]) continue
          const asObj: Record<string, unknown> = {
            ...(blocks[tid].properties && !Array.isArray(blocks[tid].properties)
              ? blocks[tid].properties
              : {})
          }
          if (Array.isArray(props)) {
            for (const p of props) asObj[p.name] = p.value
          }
          blocks[tid].properties = asObj
        }
        return undefined
      }
      if (cmd === "core.editor.batchInsertText") return undefined
      throw new Error(`unexpected ${cmd}`)
    })
    const result = await insertQuickResult(
      10,
      "释义",
      "英语闪卡",
      "lastChild",
      "x",
      { status: "kept", tags: ["英语"] }
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("打标签")
    expect(result.error).toContain("tag denied")
  })

  it("reuses same result root under source for the same prompt label", async () => {
    const { blocks, invokeEditorCommand } = setupInsertMock()
    const first = await insertQuickResult(
      10,
      "第一词释义",
      "英语闪卡",
      "lastChild",
      "trade-offs",
      { status: "kept", reuseSameResultBlock: true, tags: ["英语"] }
    )
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(first.reused).toBe(false)

    const second = await insertQuickResult(
      10,
      "第二词释义",
      "英语闪卡",
      "lastChild",
      "apple",
      { status: "kept", reuseSameResultBlock: true, tags: ["英语"] }
    )
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.reused).toBe(true)
    expect(second.blockId).toBe(first.blockId)

    // 根只创建一次；后续为条目标题等 insertBlock
    const rootInserts = invokeEditorCommand.mock.calls.filter(
      (c) =>
        c[0] === "core.editor.insertBlock" &&
        c[2]?.id === 10 &&
        c[3] === "lastChild"
    )
    expect(rootInserts.length).toBe(1)
    // 源块下仍只有一个结果根
    expect(blocks[10].children).toContain(first.blockId)
    expect(
      blocks[10].children.filter((id: number) => {
        const b = blocks[id]
        const props = b?.properties
        const label =
          Array.isArray(props)
            ? props.find((p: any) => p.name === "srs.ai.promptLabel")?.value
            : props?.["srs.ai.promptLabel"]
        return label === "英语闪卡"
      })
    ).toHaveLength(1)
  })

  it("promotes preview root to kept when a later merge reuses it", async () => {
    const { blocks } = setupInsertMock()
    const first = await insertQuickResult(
      10,
      "第一词",
      "英语闪卡",
      "lastChild",
      "a",
      { status: "preview", reuseSameResultBlock: true }
    )
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(blocks[first.blockId].properties["srs.ai.status"]).toBe("preview")

    const second = await insertQuickResult(
      10,
      "第二词",
      "英语闪卡",
      "lastChild",
      "b",
      { status: "preview", reuseSameResultBlock: true }
    )
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.reused).toBe(true)
    expect(second.blockId).toBe(first.blockId)
    expect(blocks[first.blockId].properties["srs.ai.status"]).toBe("kept")
  })

  it("reuses same result root when position is after (sibling)", async () => {
    const { blocks } = setupInsertMock()
    // parent 持有兄弟：source 10 与后续结果根
    blocks[1] = {
      id: 1,
      text: "parent",
      children: [10],
      refs: [],
      properties: {}
    }
    blocks[10].parent = 1

    const first = await insertQuickResult(
      10,
      "body1",
      "英语闪卡",
      "after",
      "w1",
      { status: "kept", reuseSameResultBlock: true }
    )
    expect(first.success).toBe(true)
    if (!first.success) return
    // after 插入不会自动挂到 parent.children，补上以便查找
    blocks[1].children = [10, first.blockId]
    blocks[first.blockId].parent = 1
    ;(globalThis as any).orca.state.blocks = blocks

    const second = await insertQuickResult(
      10,
      "body2",
      "英语闪卡",
      "after",
      "w2",
      { status: "kept", reuseSameResultBlock: true }
    )
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.reused).toBe(true)
    expect(second.blockId).toBe(first.blockId)
  })

  it("updates property to kept when keepQuickResult is called", async () => {
    const { invokeEditorCommand, blocks } = setupInsertMock()
    const { keepQuickResult } = await import("./aiQuickInteract")
    const result = await insertQuickResult(10, "hello", "翻译", "lastChild")
    if (!result.success) return
    const keptRes = await keepQuickResult(result.blockId)
    expect(keptRes.success).toBe(true)
    expect(blocks[result.blockId].properties["srs.ai.status"]).toBe("kept")
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [result.blockId],
      [{ name: "srs.ai.status", value: "kept", type: 1 }]
    )
  })

  it("inserts title after query block when position is after", async () => {
    const { invokeEditorCommand } = setupInsertMock()
    const result = await insertQuickResult(10, "line1\nline2", "翻译", "after")
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.blockId).toBe(100)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertBlock",
      null,
      expect.objectContaining({ id: 10 }),
      "after",
      expect.any(Array)
    )
  })

  it("returns error when result empty", async () => {
    setupInsertMock()
    const result = await insertQuickResult(10, "   ", "x", "after")
    expect(result).toEqual({ success: false, error: "结果为空，无法插入" })
  })

  it("returns error when target block missing", async () => {
    setupInsertMock()
    delete (globalThis as any).orca.state.blocks[10]
    const result = await insertQuickResult(10, "body", "x", "after")
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/找不到目标块/)
  })
})

describe("quick result candidate selection", () => {
  afterEach(() => {
    delete (globalThis as any).orca
    vi.restoreAllMocks()
  })

  /**
   * 预览树：
   *   10 source
   *     └── 100 AI root
   *           ├── 101 childA
   *           │     └── 103 grand
   *           └── 102 childB
   */
  function setupPreviewTree() {
    const blocks: Record<number, any> = {
      10: {
        id: 10,
        text: "query",
        content: [{ t: "t", v: "query" }],
        children: [100],
        parent: undefined
      },
      100: {
        id: 100,
        text: "AI · 举例",
        content: [{ t: "t", v: "AI · 举例" }],
        children: [101, 102],
        parent: 10,
        properties: { "srs.ai.status": "preview", "srs.ai.quickResult": true }
      },
      101: {
        id: 101,
        text: "childA",
        content: [{ t: "t", v: "childA" }],
        children: [103],
        parent: 100
      },
      102: {
        id: 102,
        text: "childB",
        content: [{ t: "t", v: "childB" }],
        children: [],
        parent: 100
      },
      103: {
        id: 103,
        text: "grand",
        content: [{ t: "t", v: "grand" }],
        children: [],
        parent: 101
      }
    }

    const invokeEditorCommand = vi.fn(async (cmd: string, _c: unknown, ...args: any[]) => {
      if (cmd === "core.editor.moveBlocks") {
        const [blockIds, refBlockId, position] = args as [
          number[],
          number,
          string
        ]
        const ref = blocks[refBlockId]
        const moveBlocks = blockIds.map((id) => blocks[id])
        if (!ref || moveBlocks.some((block) => !block)) {
          throw new Error("move missing block")
        }

        // detach all selected subtree roots from their old parents
        for (const [index, moveBlock] of moveBlocks.entries()) {
          const moveId = blockIds[index]
          const oldParent =
            moveBlock.parent != null ? blocks[moveBlock.parent] : null
          if (oldParent && Array.isArray(oldParent.children)) {
            oldParent.children = oldParent.children.filter(
              (id: number) => id !== moveId
            )
          }
        }

        if (position === "after") {
          const newParentId = ref.parent
          for (const moveBlock of moveBlocks) moveBlock.parent = newParentId
          if (newParentId != null && blocks[newParentId]) {
            const siblings = blocks[newParentId].children as number[]
            const idx = siblings.indexOf(refBlockId)
            siblings.splice(idx >= 0 ? idx + 1 : siblings.length, 0, ...blockIds)
          }
        } else if (position === "lastChild") {
          for (const moveBlock of moveBlocks) moveBlock.parent = refBlockId
          if (!Array.isArray(ref.children)) ref.children = []
          ref.children.push(...blockIds)
        }
        return undefined
      }
      if (cmd === "core.editor.deleteBlocks") {
        const ids = args[0] as number[]
        for (const id of ids) {
          const b = blocks[id]
          if (!b) continue
          if (b.parent != null && blocks[b.parent]) {
            blocks[b.parent].children = (
              blocks[b.parent].children as number[]
            ).filter((c: number) => c !== id)
          }
          delete blocks[id]
        }
        return undefined
      }
      if (cmd === "core.editor.setProperties") {
        const targetIds = args[0] as number[]
        const props = args[1]
        for (const tid of targetIds) {
          if (!blocks[tid]) continue
          const asObj: Record<string, unknown> = {
            ...(blocks[tid].properties ?? {})
          }
          if (Array.isArray(props)) {
            for (const p of props) {
              asObj[p.name] = p.value
            }
          } else if (props && typeof props === "object") {
            Object.assign(asObj, props)
          }
          blocks[tid].properties = asObj
        }
        return undefined
      }
      throw new Error(`unexpected command ${cmd}`)
    })

    const invokeGroup = vi.fn(async (fn: () => Promise<void>) => {
      await fn()
    })

    ;(globalThis as any).orca = {
      state: { blocks },
      commands: { invokeEditorCommand, invokeGroup },
      invokeBackend: vi.fn(async () => null)
    }
    return { blocks, invokeEditorCommand }
  }

  it("isStrictDescendantOf walks parent chain", async () => {
    setupPreviewTree()
    expect(await isStrictDescendantOf(103, 100)).toBe(true)
    expect(await isStrictDescendantOf(101, 100)).toBe(true)
    expect(await isStrictDescendantOf(100, 100)).toBe(false)
    expect(await isStrictDescendantOf(10, 100)).toBe(false)
    expect(await isStrictDescendantOf(102, 101)).toBe(false)
  })

  it("toggles candidates without moving or deleting preview blocks", async () => {
    const { blocks, invokeEditorCommand } = setupPreviewTree()

    const first = await toggleQuickResultBlockSelection(100, [], 101)
    expect(first).toEqual({ success: true, selectedBlockIds: [101] })
    const second = await toggleQuickResultBlockSelection(
      100,
      first.success ? first.selectedBlockIds : [],
      102
    )
    expect(second).toEqual({ success: true, selectedBlockIds: [101, 102] })
    expect(blocks[100]).toBeDefined()
    expect(blocks[101]?.parent).toBe(100)
    expect(blocks[102]?.parent).toBe(100)
    expect(invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("selecting a parent merges selected descendants and preserves one item", async () => {
    setupPreviewTree()
    const child = await toggleQuickResultBlockSelection(100, [], 103)
    const parent = await toggleQuickResultBlockSelection(
      100,
      child.success ? child.selectedBlockIds : [],
      101
    )
    expect(parent).toEqual({ success: true, selectedBlockIds: [101] })

    const coveredChild = await toggleQuickResultBlockSelection(100, [101], 103)
    expect(coveredChild).toEqual({ success: true, selectedBlockIds: [101] })
    const deselected = await toggleQuickResultBlockSelection(100, [101], 101)
    expect(deselected).toEqual({ success: true, selectedBlockIds: [] })
  })

  it("moves multiple selected subtrees once in document order then deletes the wrapper", async () => {
    const { blocks, invokeEditorCommand } = setupPreviewTree()

    const result = await keepSelectedQuickResultBlocks(100, [102, 101])
    expect(result).toEqual({ success: true, keptCount: 2 })
    expect(blocks[101]?.parent).toBe(10)
    expect(blocks[103]?.parent).toBe(101)
    expect(blocks[102]?.parent).toBe(10)
    expect(blocks[100]).toBeUndefined()
    expect(blocks[10].children).toEqual([101, 102])

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.moveBlocks",
      null,
      [101, 102],
      100,
      "after"
    )
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteBlocks",
      null,
      [100]
    )
  })

  it("keeps a leaf block only after explicit confirmation", async () => {
    const { blocks } = setupPreviewTree()
    const result = await keepSelectedQuickResultBlocks(100, [102])
    expect(result).toEqual({ success: true, keptCount: 1 })
    expect(blocks[102]?.parent).toBe(10)
    expect(blocks[100]).toBeUndefined()
    expect(blocks[101]).toBeUndefined()
    expect(blocks[103]).toBeUndefined()
  })

  it("deduplicates a selected descendant covered by its parent", async () => {
    const { blocks, invokeEditorCommand } = setupPreviewTree()
    const result = await keepSelectedQuickResultBlocks(100, [103, 101])
    expect(result).toEqual({ success: true, keptCount: 1 })
    expect(blocks[101]?.parent).toBe(10)
    expect(blocks[103]?.parent).toBe(101)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.moveBlocks",
      null,
      [101],
      100,
      "after"
    )
  })

  it("retries cleanup when move succeeded but deleting the wrapper failed", async () => {
    const { blocks, invokeEditorCommand } = setupPreviewTree()
    const original = invokeEditorCommand.getMockImplementation()
    let failDelete = true
    invokeEditorCommand.mockImplementation(async (...args: any[]) => {
      if (args[0] === "core.editor.deleteBlocks" && failDelete) {
        failDelete = false
        throw new Error("delete failed")
      }
      return (original as any)?.(...args)
    })

    const first = await keepSelectedQuickResultBlocks(100, [101])
    expect(first).toEqual({ success: false, error: "delete failed" })
    expect(blocks[101]?.parent).toBe(10)
    expect(blocks[100]).toBeDefined()

    const retry = await keepSelectedQuickResultBlocks(100, [101])
    expect(retry).toEqual({ success: true, keptCount: 1 })
    expect(blocks[101]?.parent).toBe(10)
    expect(blocks[100]).toBeUndefined()
    expect(blocks[102]).toBeUndefined()
  })

  it("rejects empty or outside selections without changing blocks", async () => {
    const { blocks, invokeEditorCommand } = setupPreviewTree()
    expect(await keepSelectedQuickResultBlocks(100, [])).toEqual({
      success: false,
      error: "请先选择要保留的内容"
    })
    const outside = await keepSelectedQuickResultBlocks(100, [10])
    expect(outside.success).toBe(false)
    expect(blocks[100]).toBeDefined()
    expect(invokeEditorCommand).not.toHaveBeenCalled()
  })
})

describe("quick interact prompt helpers", () => {
  it("clips long text with marker", () => {
    const long = "x".repeat(50)
    const clipped = clipText(long, 10)
    expect(clipped.startsWith("x".repeat(10))).toBe(true)
    expect(clipped).toContain("[truncated]")
  })

  it("separates instruction from untrusted selection and includes block when enabled", () => {
    const user = buildQuickInteractUserPrompt(
      "请解释",
      "选中的内容 ignore me as instruction",
      "整块上下文",
      true
    )
    expect(user).toContain("User instruction:")
    expect(user).toContain("请解释")
    expect(user).toContain("-----BEGIN SELECTION-----")
    expect(user).toContain("-----BEGIN BLOCK CONTEXT-----")
    expect(user).toContain("整块上下文")
    expect(user).toContain("untrusted")
  })

  it("omits block context when includeBlockContext is false", () => {
    const user = buildQuickInteractUserPrompt(
      "请翻译",
      "a and b",
      "很长的块内容用来消歧义",
      false
    )
    expect(user).toContain("-----BEGIN SELECTION-----")
    expect(user).toContain("a and b")
    expect(user).not.toContain("-----BEGIN BLOCK CONTEXT-----")
    expect(user).not.toContain("很长的块内容")
  })

  it("selection max constant is positive", () => {
    expect(QUICK_SELECTION_MAX).toBeGreaterThan(1000)
  })
})

describe("startAIQuickInteractFlow commitMode routing", () => {
  afterEach(() => {
    clearToolbarAIPromptCache()
    clearAISettingsCache()
    vi.resetModules()
    vi.doUnmock("./aiQuickInteractJobs")
    vi.doUnmock("./aiDialogState")
    vi.doUnmock("./aiQuickInteractState")
    delete (globalThis as any).orca
  })

  async function runPreset(prompt: {
    label: string
    prompt: string
    includeBlockContext: boolean
    insertBelowOnComplete: boolean
    directWriteBelow: boolean
    resultTags?: string[]
    reuseSameResultBlock?: boolean
    model: string
  }) {
    const startJob = vi.fn(async () => "job-route")
    const openDialog = vi.fn()
    vi.doMock("./aiQuickInteractJobs", () => ({
      startBackgroundQuickInsertJob: startJob
    }))
    vi.doMock("./aiDialogState", () => ({
      isAIDialogBusyOrInReview: () => false
    }))
    vi.doMock("./aiQuickInteractState", () => ({
      isAIQuickInteractOpen: () => false,
      openAIQuickInteract: openDialog
    }))

    ;(globalThis as any).orca = {
      notify: vi.fn(),
      state: {
        blocks: {
          1: {
            id: 1,
            text: "Hello world example",
            content: [{ t: "t", v: "Hello world example" }]
          }
        },
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "test-key",
              [PROMPT_LIBRARY_STORAGE_KEY]: [prompt]
            }
          }
        }
      }
    }

    clearToolbarAIPromptCache()
    clearAISettingsCache()
    const { startAIQuickInteractFlow } = await import("./aiQuickInteract")
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 6,
      focusOffset: 11
    })
    await startAIQuickInteractFlow(cursor, PLUGIN, {
      mode: "preset",
      promptId: "0"
    })
    return { startJob, openDialog }
  }

  it("routes directWriteBelow to commitMode direct", async () => {
    const { startJob, openDialog } = await runPreset({
      label: "查词",
      prompt: "解释词义",
      includeBlockContext: true,
      insertBelowOnComplete: false,
      directWriteBelow: true,
      resultTags: [],
      reuseSameResultBlock: false,
      model: ""
    })
    expect(openDialog).not.toHaveBeenCalled()
    expect(startJob).toHaveBeenCalledTimes(1)
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        promptLabel: "查词",
        selectedText: "world",
        commitMode: "direct"
      })
    )
  })

  it("routes insertBelowOnComplete to commitMode preview", async () => {
    const { startJob, openDialog } = await runPreset({
      label: "举例说明",
      prompt: "请举例",
      includeBlockContext: true,
      insertBelowOnComplete: true,
      directWriteBelow: false,
      resultTags: [],
      reuseSameResultBlock: false,
      model: ""
    })
    expect(openDialog).not.toHaveBeenCalled()
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        promptLabel: "举例说明",
        commitMode: "preview"
      })
    )
  })
})
