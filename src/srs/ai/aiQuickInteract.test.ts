import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import {
  buildQuickInteractUserPrompt,
  clipText,
  extractSelectedTextFromCursor,
  insertQuickResult,
  QUICK_SELECTION_MAX
} from "./aiQuickInteract"
import {
  clearToolbarAIPromptCache,
  DEFAULT_TOOLBAR_AI_PROMPTS,
  getToolbarAIPrompts,
  hydrateToolbarAIPromptLibrary,
  normalizeToolbarAIPromptItems,
  PROMPT_LIBRARY_DATA_KEY,
  PROMPT_LIBRARY_LEGACY_KEY,
  PROMPT_LIBRARY_STORAGE_KEY,
  resetToolbarAIPromptsToDefault,
  saveToolbarAIPrompts
} from "./aiToolbarPromptStore"

const PLUGIN = "orca-srs"

function makeCursor(partial: {
  blockId: number
  anchorOffset: number
  focusOffset: number
  anchorIndex?: number
  focusIndex?: number
  focusBlockId?: number
}): CursorData {
  const anchorIndex = partial.anchorIndex ?? 0
  const focusIndex = partial.focusIndex ?? anchorIndex
  return {
    isForward: partial.focusOffset >= partial.anchorOffset,
    panelId: "p1",
    rootBlockId: partial.blockId,
    anchor: {
      blockId: partial.blockId,
      isInline: true,
      index: anchorIndex,
      offset: partial.anchorOffset
    },
    focus: {
      blockId: partial.focusBlockId ?? partial.blockId,
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
          1: {
            id: 1,
            text: "Hello world example",
            content: [{ t: "t", v: "Hello world example" }]
          },
          2: {
            id: 2,
            text: "other",
            content: [{ t: "t", v: "other" }]
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
  })

  it("returns null when no real selection (collapsed)", () => {
    const cursor = makeCursor({
      blockId: 1,
      anchorOffset: 3,
      focusOffset: 3
    })
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })

  it("returns null when selection spans blocks", () => {
    const cursor = makeCursor({
      blockId: 1,
      focusBlockId: 2,
      anchorOffset: 0,
      focusOffset: 2
    })
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })

  it("returns null when selection spans fragments", () => {
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
      text: "ab",
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
    expect(extractSelectedTextFromCursor(cursor)).toBeNull()
  })

  it("returns null for whitespace-only selection", () => {
    ;(globalThis as any).orca.state.blocks[1] = {
      id: 1,
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
      insertBelowOnComplete: false
    })
    // 旧项无 includeBlockContext → true；无 insertBelowOnComplete → false
    expect(list[1]).toEqual({
      id: "1",
      label: "翻译",
      prompt: "译成英文",
      includeBlockContext: true,
      insertBelowOnComplete: false
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
        insertBelowOnComplete: false
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
        insertBelowOnComplete: true
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
        { label: "B", prompt: "q" }
      ])
    ).toEqual([
      {
        label: "A",
        prompt: "p",
        includeBlockContext: false,
        insertBelowOnComplete: true
      },
      {
        label: "B",
        prompt: "q",
        includeBlockContext: true,
        insertBelowOnComplete: false
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
        insertBelowOnComplete: true
      },
      {
        label: "",
        prompt: "丢弃",
        includeBlockContext: true,
        insertBelowOnComplete: false
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
          insertBelowOnComplete: true
        }
      ])
    )
    expect(saved).toEqual([
      {
        id: "0",
        label: "新",
        prompt: "内容",
        includeBlockContext: false,
        insertBelowOnComplete: true
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
          insertBelowOnComplete: p.insertBelowOnComplete
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
          insertBelowOnComplete: false
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
        insertBelowOnComplete: false
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

  function setupInsertMock(opts?: { batchFail?: boolean }) {
    let nextId = 100
    const blocks: Record<number, any> = {
      10: {
        id: 10,
        text: "query",
        content: [{ t: "t", v: "query" }],
        children: []
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
          children: [],
          parent: position === "lastChild" ? ref?.id : ref?.parent,
          left: ref?.id
        }
        return id
      }
      if (cmd === "core.editor.batchInsertText") {
        if (opts?.batchFail) throw new Error("batch fail")
        return undefined
      }
      if (cmd === "core.editor.setProperties") {
        const targetIds = args[0] as number[]
        const props = args[1]
        for (const tid of targetIds) {
          if (blocks[tid]) {
            blocks[tid].properties = { ...blocks[tid].properties, ...props }
          }
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
      expect.objectContaining({
        "srs.ai.quickResult": true,
        "srs.ai.status": "preview",
        "srs.ai.promptLabel": "举例说明",
        "srs.ai.selectedText": "工作记忆"
      })
    )
    expect(blocks[100].properties["srs.ai.quickResult"]).toBe(true)
    expect(blocks[100].properties["srs.ai.status"]).toBe("preview")
  })

  it("updates property to kept when keepQuickResult is called", async () => {
    const { blocks } = setupInsertMock()
    const { keepQuickResult } = await import("./aiQuickInteract")
    const result = await insertQuickResult(10, "hello", "翻译", "lastChild")
    if (!result.success) return
    const keptRes = await keepQuickResult(result.blockId)
    expect(keptRes.success).toBe(true)
    expect(blocks[result.blockId].properties["srs.ai.status"]).toBe("kept")
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
