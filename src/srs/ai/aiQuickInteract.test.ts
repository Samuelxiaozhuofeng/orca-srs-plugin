import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import {
  buildQuickInteractUserPrompt,
  clipText,
  extractSelectedTextFromCursor,
  QUICK_SELECTION_MAX
} from "./aiQuickInteract"
import {
  DEFAULT_TOOLBAR_AI_PROMPTS,
  getToolbarAIPrompts,
  normalizeToolbarAIPromptItems,
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
  })

  it("parses valid custom array from new storage key", () => {
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
      includeBlockContext: false
    })
    // 旧项无字段 → 默认 true
    expect(list[1]).toEqual({
      id: "1",
      label: "翻译",
      prompt: "译成英文",
      includeBlockContext: true
    })
  })

  it("reads legacy key when new key absent", () => {
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
        includeBlockContext: true
      }
    ])
  })

  it("prefers new key over legacy", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              [PROMPT_LIBRARY_STORAGE_KEY]: [
                {
                  label: "新",
                  prompt: "新内容",
                  includeBlockContext: false
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
        includeBlockContext: false
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

describe("normalizeToolbarAIPromptItems / saveToolbarAIPrompts", () => {
  afterEach(() => {
    delete (globalThis as any).orca
    vi.restoreAllMocks()
  })

  it("normalize trims and drops empty/dirty items", () => {
    expect(
      normalizeToolbarAIPromptItems([
        { label: "  A  ", prompt: "  p  ", includeBlockContext: false },
        { label: "", prompt: "x" },
        { label: "y", prompt: "  " },
        null,
        { label: "B", prompt: "q" }
      ])
    ).toEqual([
      { label: "A", prompt: "p", includeBlockContext: false },
      { label: "B", prompt: "q", includeBlockContext: true }
    ])
    expect(normalizeToolbarAIPromptItems(undefined)).toEqual([])
    expect(normalizeToolbarAIPromptItems("bad")).toEqual([])
  })

  it("saveToolbarAIPrompts writes new library key and clears legacy", async () => {
    const setSettings = vi.fn(async (_to: string, _name: string, patch: Record<string, unknown>) => {
      const prev = (orca.state.plugins[PLUGIN]?.settings ?? {}) as Record<string, unknown>
      const next = { ...prev, ...patch }
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) delete next[k]
      }
      ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings = next
    })
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "keep-me",
              [PROMPT_LIBRARY_LEGACY_KEY]: [{ label: "旧", prompt: "旧内容" }]
            }
          }
        }
      },
      plugins: { setSettings }
    }

    const saved = await saveToolbarAIPrompts(PLUGIN, [
      {
        label: "  新  ",
        prompt: "  内容  ",
        includeBlockContext: false
      },
      { label: "", prompt: "丢弃", includeBlockContext: true }
    ])
    expect(setSettings).toHaveBeenCalledWith("app", PLUGIN, {
      [PROMPT_LIBRARY_STORAGE_KEY]: [
        { label: "新", prompt: "内容", includeBlockContext: false }
      ],
      [PROMPT_LIBRARY_LEGACY_KEY]: null
    })
    expect(saved).toEqual([
      {
        id: "0",
        label: "新",
        prompt: "内容",
        includeBlockContext: false
      }
    ])
    expect(orca.state.plugins[PLUGIN]?.settings?.["ai.apiKey"]).toBe("keep-me")
    expect(orca.state.plugins[PLUGIN]?.settings?.[PROMPT_LIBRARY_LEGACY_KEY]).toBeUndefined()

    const empty = await saveToolbarAIPrompts(PLUGIN, [])
    expect(setSettings).toHaveBeenLastCalledWith("app", PLUGIN, {
      [PROMPT_LIBRARY_STORAGE_KEY]: [],
      [PROMPT_LIBRARY_LEGACY_KEY]: null
    })
    expect(empty).toEqual([])
    expect(getToolbarAIPrompts(PLUGIN)).toEqual([])
  })

  it("resetToolbarAIPromptsToDefault writes DEFAULT list to library key", async () => {
    const setSettings = vi.fn(async (_to: string, _name: string, patch: Record<string, unknown>) => {
      const prev = (orca.state.plugins[PLUGIN]?.settings ?? {}) as Record<string, unknown>
      const next = { ...prev, ...patch }
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) delete next[k]
      }
      ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings = next
    })
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: { [PROMPT_LIBRARY_STORAGE_KEY]: [] }
          }
        }
      },
      plugins: { setSettings }
    }

    const list = await resetToolbarAIPromptsToDefault(PLUGIN)
    expect(list.length).toBe(DEFAULT_TOOLBAR_AI_PROMPTS.length)
    expect(list[0].label).toBe("举例说明")
    expect(list[0].includeBlockContext).toBe(true)
    expect(list[1].includeBlockContext).toBe(false)
    expect(setSettings).toHaveBeenCalledWith("app", PLUGIN, {
      [PROMPT_LIBRARY_STORAGE_KEY]: DEFAULT_TOOLBAR_AI_PROMPTS.map((p) => ({
        label: p.label.trim(),
        prompt: p.prompt.trim(),
        includeBlockContext: p.includeBlockContext
      })),
      [PROMPT_LIBRARY_LEGACY_KEY]: null
    })
  })

  it("saveToolbarAIPrompts propagates setSettings failure", async () => {
    const setSettings = vi.fn(async () => {
      throw new Error("disk full")
    })
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: { settings: {} }
        }
      },
      plugins: { setSettings }
    }
    await expect(
      saveToolbarAIPrompts(PLUGIN, [
        { label: "A", prompt: "B", includeBlockContext: true }
      ])
    ).rejects.toThrow("disk full")
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
