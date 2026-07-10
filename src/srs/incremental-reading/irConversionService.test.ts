import { describe, expect, it, vi } from "vitest"
import {
  convertExtractToItem,
  isCollectableClozeBlock,
  shouldPreserveExtractOnFailure,
  type ConversionDeps
} from "./irConversionService"
import type { CursorData } from "../../orca.d.ts"
import type { IRState } from "../incrementalReadingStorage"

const cursor: CursorData = {
  panelId: "p1",
  rootBlockId: 10,
  anchor: { blockId: 10, isInline: true, index: 0, offset: 0 },
  focus: { blockId: 10, isInline: true, index: 0, offset: 4 },
  isForward: true
}

function baseState(overrides: Partial<IRState> = {}): IRState {
  return {
    priority: 50,
    lastRead: null,
    readCount: 0,
    due: new Date("2026-01-01"),
    intervalDays: 2,
    postponeCount: 0,
    stage: "extract.raw",
    lastAction: "init",
    position: null,
    resumeBlockId: null,
    readingBreakpoint: null,
    autoPostponeBatchId: null,
    ...overrides
  }
}

function makeDeps(overrides: Partial<ConversionDeps> = {}): ConversionDeps {
  const state = baseState()
  const content = {
    content: [{ t: "t", v: "test text" }] as any,
    text: "test text",
    cardType: "extracts",
    properties: [{ name: "srs.isCard", value: true, type: 4 }]
  }
  return {
    loadState: vi.fn(async () => ({ ...state })),
    ensureState: vi.fn(async () => ({ ...state })),
    saveState: vi.fn(async () => undefined),
    deleteIrOnly: vi.fn(async () => undefined),
    snapshotBlock: vi.fn(async () => ({ ...content })),
    restoreBlock: vi.fn(async () => undefined),
    createClozeOnBlock: vi.fn(async () => ({ blockId: 10, clozeNumber: 1 })),
    initSrs: vi.fn(async () => undefined),
    deleteIncompleteItem: vi.fn(async () => undefined),
    getCardType: vi.fn(async () => "extracts"),
    readSelectedText: vi.fn(() => "test"),
    findTopicId: vi.fn(async () => 1 as any),
    readBookMeta: vi.fn(async () => ({ sourceBookId: 99, sourceBookTitle: "Book" })),
    verifyItemCollectable: vi.fn(async () => true),
    writeSourceMeta: vi.fn(async () => undefined),
    ...overrides
  }
}

describe("convertExtractToItem", () => {
  it("succeeds, writes source meta, and finishes extract IR", async () => {
    const deps = makeDeps()
    const result = await convertExtractToItem({
      extractId: 10,
      cursor,
      pluginName: "orca-srs",
      deps
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.itemId).toBe(10)
      expect(result.clozeNumber).toBe(1)
      expect(result.source.topicId).toBe(1)
      expect(result.completedExtract).toBe(true)
    }
    expect(deps.deleteIrOnly).toHaveBeenCalledWith(10)
  })

  it("restores content and IR when SRS init fails on same block", async () => {
    const snapshot = baseState({ intervalDays: 7, priority: 80 })
    const deps = makeDeps({
      loadState: vi.fn(async () => ({ ...snapshot })),
      createClozeOnBlock: vi.fn(async () => ({ blockId: 10, clozeNumber: 1 })),
      initSrs: vi.fn(async () => {
        throw new Error("srs init boom")
      })
    })

    const result = await convertExtractToItem({
      extractId: 10,
      cursor,
      pluginName: "orca-srs",
      deps
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe("init_srs")
      expect(result.extractPreserved).toBe(true)
    }
    expect(shouldPreserveExtractOnFailure(result)).toBe(true)
    expect(deps.restoreBlock).toHaveBeenCalled()
    expect(deps.saveState).toHaveBeenCalledWith(10, expect.objectContaining({
      intervalDays: 7,
      priority: 80
    }))
    expect(deps.deleteIrOnly).not.toHaveBeenCalled()
  })

  it("restores the same block when Cloze reports failure after a partial mutation", async () => {
    const deps = makeDeps({ createClozeOnBlock: vi.fn(async () => null) })
    const result = await convertExtractToItem({
      extractId: 10,
      cursor,
      pluginName: "orca-srs",
      deps
    })
    expect(result.ok).toBe(false)
    expect(deps.restoreBlock).toHaveBeenCalledWith(10, expect.objectContaining({
      cardType: "extracts"
    }))
    expect(deps.saveState).toHaveBeenCalled()
  })

  it("deletes incomplete separate item and restores extract when verify fails", async () => {
    const deps = makeDeps({
      createClozeOnBlock: vi.fn(async () => ({ blockId: 888, clozeNumber: 1 })),
      verifyItemCollectable: vi.fn(async () => false)
    })
    const result = await convertExtractToItem({
      extractId: 10,
      cursor,
      pluginName: "orca-srs",
      deps
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.step).toBe("verify_collectable")
    expect(deps.deleteIncompleteItem).toHaveBeenCalledWith(888)
    expect(deps.deleteIrOnly).not.toHaveBeenCalled()
  })

  it("does not claim the Extract was preserved when rollback fails", async () => {
    const deps = makeDeps({
      initSrs: vi.fn(async () => { throw new Error("init failed") }),
      restoreBlock: vi.fn(async () => { throw new Error("restore failed") })
    })
    const result = await convertExtractToItem({
      extractId: 10,
      cursor,
      pluginName: "orca-srs",
      deps
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.extractPreserved).toBe(false)
      expect(result.error).toContain("回滚未完整完成")
    }
  })

  it("fails validation for non-extract cards without side effects", async () => {
    const deps = makeDeps({
      getCardType: vi.fn(async () => "topic")
    })
    const result = await convertExtractToItem({
      extractId: 10,
      cursor,
      pluginName: "orca-srs",
      deps
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.step).toBe("validate")
    expect(deps.createClozeOnBlock).not.toHaveBeenCalled()
  })

  it("requires a cloze tag type and the matching cloze SRS state", () => {
    const base = {
      refs: [{ type: 2, alias: "card", data: [{ name: "type", value: "cloze" }] }],
      properties: [{ name: "srs.c1.due", value: new Date(), type: 5 }]
    }
    expect(isCollectableClozeBlock(base, 1)).toBe(true)
    expect(isCollectableClozeBlock({
      ...base,
      refs: [{ type: 2, alias: "card", data: [{ name: "type", value: "extracts" }] }]
    }, 1)).toBe(false)
    expect(isCollectableClozeBlock({ ...base, properties: [{ name: "srs.isCard", value: true }] }, 1)).toBe(false)
  })
})
