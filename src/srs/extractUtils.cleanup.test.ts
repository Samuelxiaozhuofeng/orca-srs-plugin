/**
 * A2：Extract 创建后标签 / IR 初始化失败时清理半成品子块
 */
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, CursorData, DbId } from "../orca.d.ts"

const mockBlocks: Record<number, Block> = {}

const mockOrca = {
  state: { blocks: mockBlocks },
  commands: {
    invokeEditorCommand: vi.fn()
  },
  notify: vi.fn(),
  invokeBackend: vi.fn(async () => undefined),
  plugins: {
    getData: vi.fn(async () => null)
  }
}

// @ts-ignore
globalThis.orca = mockOrca

vi.mock("./tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => {})
}))

vi.mock("./cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async () => [{ name: "type", value: "extracts" }])
}))

vi.mock("./tagUtils", () => ({
  isCardTag: (alias: unknown) => alias === "card"
}))

vi.mock("./deckUtils", () => ({
  extractCardType: () => null
}))

const ensureIRState = vi.fn(async () => ({}))
const updatePriority = vi.fn(async () => ({}))
const invalidateIrBlockCache = vi.fn()
const loadIRState = vi.fn(async () => ({
  priority: 50,
  due: new Date("2026-08-20T00:00:00")
}))

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: (...args: unknown[]) => ensureIRState(...args),
  invalidateIrBlockCache: (...args: unknown[]) => invalidateIrBlockCache(...args),
  loadIRState: (...args: unknown[]) => loadIRState(...args),
  updatePriority: (...args: unknown[]) => updatePriority(...args)
}))

vi.mock("./incremental-reading/irIndex", () => ({
  upsertIRIndexId: vi.fn()
}))

vi.mock("./incremental-reading/irSessionCompleteCopy", () => ({
  formatExtractCreatedScheduleMessage: () => "已创建摘录"
}))

import {
  cleanupIncompleteExtractBlock,
  createExtractFromSelectedText
} from "./extractUtils"

function makeBlock(id: DbId, text = "source"): Block {
  return {
    id,
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [],
    refs: [],
    backRefs: [],
    text,
    content: [{ t: "t", v: text }]
  } as Block
}

function cursorOn(blockId: DbId): CursorData {
  return {
    anchor: { blockId, offset: 0 },
    focus: { blockId, offset: 4 }
  } as CursorData
}

describe("cleanupIncompleteExtractBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach((k) => delete mockBlocks[k as any])
  })

  it("deletes the given block id", async () => {
    mockOrca.commands.invokeEditorCommand.mockResolvedValueOnce(undefined)
    const result = await cleanupIncompleteExtractBlock("orca-srs", 900 as DbId)
    expect(result).toEqual({ cleaned: true })
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteBlocks",
      null,
      [900]
    )
  })

  it("returns cleaned:false with error when delete fails", async () => {
    mockOrca.commands.invokeEditorCommand.mockRejectedValueOnce(new Error("delete denied"))
    const result = await cleanupIncompleteExtractBlock("orca-srs", 901 as DbId)
    expect(result.cleaned).toBe(false)
    if (!result.cleaned) {
      expect(result.error).toContain("delete denied")
    }
  })
})

describe("createExtractFromSelectedText failure compensation", () => {
  const parentId = 10 as DbId
  const extractId = 555 as DbId
  let parent: Block

  beforeEach(() => {
    vi.clearAllMocks()
    ensureIRState.mockResolvedValue({})
    updatePriority.mockResolvedValue({})
    Object.keys(mockBlocks).forEach((k) => delete mockBlocks[k as any])
    parent = makeBlock(parentId, "hello world")
    mockBlocks[parentId] = parent
  })

  it("tag step failure deletes the newly created extract block", async () => {
    mockBlocks[extractId] = makeBlock(extractId, "hello")
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.formatHighlightYellow") return undefined
      if (cmd === "core.editor.insertBlock") return extractId
      if (cmd === "core.editor.insertTag") throw new Error("tag failed")
      if (cmd === "core.editor.deleteBlocks") {
        delete mockBlocks[extractId as number]
        return undefined
      }
      return undefined
    })

    const result = await createExtractFromSelectedText({
      cursor: cursorOn(parentId),
      pluginName: "orca-srs",
      block: parent,
      blockId: parentId,
      selectedText: "hello"
    })

    expect(result).toBeNull()
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteBlocks",
      null,
      [extractId]
    )
    expect(mockOrca.notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("标签处理"),
      { title: "渐进阅读" }
    )
    const notifyMsg = String(mockOrca.notify.mock.calls.find((c) => c[0] === "error")?.[1] ?? "")
    expect(notifyMsg).not.toContain("已创建摘录")
  })

  it("IR init step failure deletes the newly created extract block", async () => {
    ensureIRState.mockRejectedValueOnce(new Error("ensure failed"))

    mockOrca.commands.invokeEditorCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.formatHighlightYellow") return undefined
      if (cmd === "core.editor.insertBlock") return extractId
      if (cmd === "core.editor.insertTag") return undefined
      if (cmd === "core.editor.deleteBlocks") return undefined
      return undefined
    })

    const result = await createExtractFromSelectedText({
      cursor: cursorOn(parentId),
      pluginName: "orca-srs",
      block: parent,
      blockId: parentId,
      selectedText: "hello"
    })

    expect(result).toBeNull()
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteBlocks",
      null,
      [extractId]
    )
    expect(mockOrca.notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("初始化渐进阅读状态失败"),
      { title: "渐进阅读" }
    )
  })

  it("when cleanup also fails, error notify includes residual blockId", async () => {
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.formatHighlightYellow") return undefined
      if (cmd === "core.editor.insertBlock") return extractId
      if (cmd === "core.editor.insertTag") throw new Error("tag failed")
      if (cmd === "core.editor.deleteBlocks") throw new Error("still locked")
      return undefined
    })

    const result = await createExtractFromSelectedText({
      cursor: cursorOn(parentId),
      pluginName: "orca-srs",
      block: parent,
      blockId: parentId,
      selectedText: "hello"
    })

    expect(result).toBeNull()
    const errorCall = mockOrca.notify.mock.calls.find((c) => c[0] === "error")
    expect(errorCall).toBeTruthy()
    const message = String(errorCall?.[1] ?? "")
    expect(message).toContain(String(extractId))
    expect(message).toMatch(/半成品|未能自动删除|手动清理/)
    expect(message).toContain("still locked")
  })
})
