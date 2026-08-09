// @ts-nocheck
/**
 * 制卡对称撤销：仅当本次新增标志为真时才 removeTag / cleanup
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../tagCleanup", () => ({
  cleanupSrsProperties: vi.fn(async () => undefined)
}))

vi.mock("../storage", () => ({
  deleteClozeCardSrsData: vi.fn(async () => undefined),
  deleteDirectionCardSrsData: vi.fn(async () => undefined),
  invalidateBlockCache: vi.fn()
}))

vi.mock("../incrementalReadingStorage", () => ({
  deleteIRState: vi.fn(async () => undefined)
}))

const invokeEditorCommand = vi.fn(async () => true)
const mockBlocks: Record<number, any> = {}

globalThis.orca = {
  state: { blocks: mockBlocks },
  commands: { invokeEditorCommand },
  notify: vi.fn()
}

import {
  undoBasicCardCreation,
  undoClozeCardCreation,
  undoDirectionCardCreation,
  undoListCardCreation,
  undoTopicCardCreation
} from "./cardCreationUndo"
import { cleanupSrsProperties } from "../tagCleanup"
import {
  deleteClozeCardSrsData,
  deleteDirectionCardSrsData
} from "../storage"
import { deleteIRState } from "../incrementalReadingStorage"

describe("undoBasicCardCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as any])
    mockBlocks[1] = { id: 1, _repr: { type: "srs.card" }, text: "q" }
  })

  it("addedCardTag/wroteInitialSrs 为真时才 cleanup 与 removeTag", async () => {
    await undoBasicCardCreation({
      blockId: 1,
      pluginName: "orca-srs",
      originalRepr: { type: "text" },
      originalText: "q",
      addedCardTag: true,
      wroteInitialSrs: true
    })

    expect(cleanupSrsProperties).toHaveBeenCalledWith(1, "orca-srs")
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      1,
      "card"
    )
    expect(mockBlocks[1]._repr).toEqual({ type: "text" })
  })

  it("标志为假时不 cleanup / removeTag", async () => {
    await undoBasicCardCreation({
      blockId: 1,
      pluginName: "orca-srs",
      originalRepr: { type: "text" },
      addedCardTag: false,
      wroteInitialSrs: false
    })

    expect(cleanupSrsProperties).not.toHaveBeenCalled()
    expect(invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      1,
      "card"
    )
  })

  it("addedChoiceTag 为真时额外 removeTag choice", async () => {
    await undoBasicCardCreation({
      blockId: 1,
      pluginName: "orca-srs",
      addedCardTag: true,
      wroteInitialSrs: true,
      addedChoiceTag: true,
      originalRepr: { type: "text" }
    })

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      1,
      "choice"
    )
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      1,
      "card"
    )
  })
})

describe("undoClozeCardCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as any])
    mockBlocks[2] = { id: 2, _repr: { type: "srs.cloze-card" } }
  })

  it("非首次 cloze 只删本次 srs.cN.*，不 removeTag", async () => {
    await undoClozeCardCreation({
      blockId: 2,
      clozeNumber: 2,
      pluginName: "orca-srs",
      addedCardTag: false,
      wroteInitialClozeSrs: true,
      isFirstClozeCard: false
    })

    expect(deleteClozeCardSrsData).toHaveBeenCalledWith(2, 2)
    expect(cleanupSrsProperties).not.toHaveBeenCalled()
    expect(invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      2,
      "card"
    )
    expect(mockBlocks[2]._repr).toEqual({ type: "srs.cloze-card" })
  })

  it("首次 cloze 清理编号 + 顶层 srs + removeTag + 删 _repr", async () => {
    await undoClozeCardCreation({
      blockId: 2,
      clozeNumber: 1,
      pluginName: "orca-srs",
      addedCardTag: true,
      wroteInitialClozeSrs: true,
      isFirstClozeCard: true
    })

    expect(deleteClozeCardSrsData).toHaveBeenCalledWith(2, 1)
    expect(cleanupSrsProperties).toHaveBeenCalledWith(2, "orca-srs")
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      2,
      "card"
    )
    expect(mockBlocks[2]._repr).toBeUndefined()
  })

  it("撤销 c1 时用 originalContent 还原正文（不含 .cloze fragment）", async () => {
    const originalContent = [{ t: "t", v: "remember this" }]
    await undoClozeCardCreation({
      blockId: 2,
      clozeNumber: 1,
      pluginName: "orca-srs",
      addedCardTag: true,
      wroteInitialClozeSrs: true,
      isFirstClozeCard: true,
      originalContent
    })

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      [{ id: 2, content: originalContent }],
      false
    )
    // 正文还原应在删 srs / 摘标签之前
    const setContentOrder = invokeEditorCommand.mock.calls.findIndex(
      c => c[0] === "core.editor.setBlocksContent"
    )
    const removeTagOrder = invokeEditorCommand.mock.calls.findIndex(
      c => c[0] === "core.editor.removeTag"
    )
    expect(setContentOrder).toBeGreaterThanOrEqual(0)
    expect(setContentOrder).toBeLessThan(removeTagOrder)
  })

  it("做 c1、c2 后只撤销 c2：还原到含 c1 的正文，不摘 #card", async () => {
    const contentWithC1Only = [
      { t: "orca-srs.cloze", v: "remember", clozeNumber: 1 },
      { t: "t", v: " this" }
    ]
    await undoClozeCardCreation({
      blockId: 2,
      clozeNumber: 2,
      pluginName: "orca-srs",
      addedCardTag: false,
      wroteInitialClozeSrs: true,
      isFirstClozeCard: false,
      originalContent: contentWithC1Only
    })

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      [{ id: 2, content: contentWithC1Only }],
      false
    )
    expect(deleteClozeCardSrsData).toHaveBeenCalledWith(2, 2)
    expect(cleanupSrsProperties).not.toHaveBeenCalled()
    expect(invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      2,
      "card"
    )
    expect(mockBlocks[2]._repr).toEqual({ type: "srs.cloze-card" })
  })

  it("无 originalContent 时跳过正文还原（兼容旧 undoArgs）", async () => {
    await undoClozeCardCreation({
      blockId: 2,
      clozeNumber: 1,
      pluginName: "orca-srs",
      isFirstClozeCard: true,
      wroteInitialClozeSrs: true
    })

    expect(invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      expect.anything(),
      false
    )
  })
})

describe("undoTopicCardCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as any])
    mockBlocks[3] = { id: 3, _repr: { type: "text" } }
  })

  it("createdFreshTopic 时 deleteIRState + removeTag", async () => {
    await undoTopicCardCreation({
      blockId: 3,
      pluginName: "orca-srs",
      createdFreshTopic: true,
      addedCardTag: true,
      wroteIRState: true
    })

    expect(deleteIRState).toHaveBeenCalledWith(3)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      3,
      "card"
    )
  })

  it("非 fresh 不做破坏性清理", async () => {
    await undoTopicCardCreation({
      blockId: 3,
      pluginName: "orca-srs",
      createdFreshTopic: false,
      addedCardTag: false,
      wroteIRState: true
    })

    expect(deleteIRState).not.toHaveBeenCalled()
    expect(invokeEditorCommand).not.toHaveBeenCalled()
  })
})

describe("undoListCardCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as any])
    mockBlocks[10] = { id: 10 }
  })

  it("清理本次初始化条目，并按标志 removeTag / 删根 isCard", async () => {
    await undoListCardCreation({
      blockId: 10,
      pluginName: "orca-srs",
      addedCardTag: true,
      wroteRootIsCard: true,
      initializedItemIds: [11, 12]
    })

    expect(cleanupSrsProperties).toHaveBeenCalledWith(11, "orca-srs")
    expect(cleanupSrsProperties).toHaveBeenCalledWith(12, "orca-srs")
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [10],
      ["srs.isCard"]
    )
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      10,
      "card"
    )
  })

  it("标志为假且无条目时不调用 cleanup / removeTag", async () => {
    await undoListCardCreation({
      blockId: 10,
      pluginName: "orca-srs",
      addedCardTag: false,
      wroteRootIsCard: false,
      initializedItemIds: []
    })

    expect(cleanupSrsProperties).not.toHaveBeenCalled()
    expect(invokeEditorCommand).not.toHaveBeenCalled()
  })
})

describe("undoDirectionCardCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as any])
    mockBlocks[20] = {
      id: 20,
      content: [{ t: "t", v: "left" }, { t: "orca-srs.direction", v: "→" }]
    }
  })

  it("本次新增时还原 content、删方向 SRS、srs.isCard 与 #card", async () => {
    const originalContent = [{ t: "t", v: "left right" }]
    await undoDirectionCardCreation({
      blockId: 20,
      pluginName: "orca-srs",
      originalContent,
      addedCardTag: true,
      wroteIsCard: true,
      initializedDirections: ["forward"]
    })

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      [{ id: 20, content: originalContent }],
      false
    )
    expect(deleteDirectionCardSrsData).toHaveBeenCalledWith(20, "forward")
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [20],
      ["srs.isCard"]
    )
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      20,
      "card"
    )
  })

  it("创建前已是卡时只还原 content 与本次方向 SRS，不摘 #card / isCard", async () => {
    const originalContent = [{ t: "t", v: "already a card" }]
    await undoDirectionCardCreation({
      blockId: 20,
      pluginName: "orca-srs",
      originalContent,
      addedCardTag: false,
      wroteIsCard: false,
      initializedDirections: ["backward"]
    })

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      [{ id: 20, content: originalContent }],
      false
    )
    expect(deleteDirectionCardSrsData).toHaveBeenCalledWith(20, "backward")
    expect(invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.removeTag",
      null,
      20,
      "card"
    )
    expect(invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [20],
      ["srs.isCard"]
    )
    expect(cleanupSrsProperties).not.toHaveBeenCalled()
  })

  it("撤销任一步失败时 notify 并 rethrow", async () => {
    invokeEditorCommand.mockRejectedValueOnce(new Error("set content failed"))
    await expect(
      undoDirectionCardCreation({
        blockId: 20,
        pluginName: "orca-srs",
        originalContent: [{ t: "t", v: "x" }],
        addedCardTag: true,
        wroteIsCard: true,
        initializedDirections: ["forward"]
      })
    ).rejects.toThrow("set content failed")
    expect(orca.notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("撤销方向卡失败"),
      expect.objectContaining({ title: "方向卡" })
    )
  })
})
