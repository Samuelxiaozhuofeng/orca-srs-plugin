import { describe, expect, it, vi, beforeEach } from "vitest"
import type { Block } from "../../orca.d.ts"
import { loadSequentialSessionMeta } from "./irSequentialSessionMeta"

vi.mock("./irBlockCache", () => ({
  getBlockCached: vi.fn()
}))

vi.mock("../book-ir/bookIRPlanRepository", () => ({
  loadBookIRPlan: vi.fn()
}))

import { getBlockCached } from "./irBlockCache"
import { loadBookIRPlan } from "../book-ir/bookIRPlanRepository"

function blockWithBook(sourceBookId: number): Block {
  return {
    id: 10,
    content: [],
    text: "",
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [{ name: "ir.sourceBookId", type: 1, value: sourceBookId }],
    refs: [],
    backRefs: []
  } as Block
}

describe("loadSequentialSessionMeta", () => {
  beforeEach(() => {
    vi.mocked(getBlockCached).mockReset()
    vi.mocked(loadBookIRPlan).mockReset()
  })

  it("returns inactive when no source book", async () => {
    const block = blockWithBook(100)
    block.properties = []
    const meta = await loadSequentialSessionMeta(10, block)
    expect(meta).toEqual({ isActive: false, hasNextChapter: false })
    expect(loadBookIRPlan).not.toHaveBeenCalled()
  })

  it("detects active chapter with a pending next", async () => {
    vi.mocked(loadBookIRPlan).mockResolvedValue({
      version: 1,
      bookBlockId: 100,
      mode: "sequential",
      priority: 50,
      totalDays: 30,
      selectedChapterIds: [10, 11, 12],
      activeChapterId: 10,
      outcomes: { "10": "active", "11": "pending", "12": "pending" },
      lastError: null
    })
    const meta = await loadSequentialSessionMeta(10, blockWithBook(100))
    expect(meta).toEqual({ isActive: true, hasNextChapter: true })
  })

  it("detects last active chapter without next", async () => {
    vi.mocked(loadBookIRPlan).mockResolvedValue({
      version: 1,
      bookBlockId: 100,
      mode: "sequential",
      priority: 50,
      totalDays: 30,
      selectedChapterIds: [9, 10],
      activeChapterId: 10,
      outcomes: { "9": "completed", "10": "active" },
      lastError: null
    })
    const meta = await loadSequentialSessionMeta(10, blockWithBook(100))
    expect(meta).toEqual({ isActive: true, hasNextChapter: false })
  })

  it("is inactive when block is not the active chapter", async () => {
    vi.mocked(loadBookIRPlan).mockResolvedValue({
      version: 1,
      bookBlockId: 100,
      mode: "sequential",
      priority: 50,
      totalDays: 30,
      selectedChapterIds: [10, 11],
      activeChapterId: 11,
      outcomes: { "10": "pending", "11": "active" },
      lastError: null
    })
    const meta = await loadSequentialSessionMeta(10, blockWithBook(100))
    expect(meta).toEqual({ isActive: false, hasNextChapter: false })
  })
})
