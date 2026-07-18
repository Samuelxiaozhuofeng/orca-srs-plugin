/**
 * performArchive / sequential advance wiring:
 * - sequential active chapter passes nextChapterSchedule explicitly
 * - cancel is UI-only (not tested here): service is only called after user choice
 * - plain cards keep completeIRCard path
 * - failures surface (no silent plain-complete after sequential start)
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../../orca.d.ts"

const completeIRCard = vi.fn(async (_blockId?: unknown, _pluginName?: unknown) => undefined)
const advanceSequentialBook = vi.fn()
const loadBookIRPlan = vi.fn()

vi.mock("../irSessionActions", () => ({
  completeIRCard: (blockId: unknown, pluginName?: unknown) => completeIRCard(blockId, pluginName)
}))

vi.mock("../book-ir/bookIRProgression", () => ({
  advanceSequentialBook: (request: unknown) => advanceSequentialBook(request)
}))

vi.mock("../book-ir/bookIRPlanRepository", () => ({
  loadBookIRPlan: (bookBlockId: unknown) => loadBookIRPlan(bookBlockId)
}))

vi.mock("./irSchedulingHelpers", async () => {
  const actual = await vi.importActual<typeof import("./irSchedulingHelpers")>("./irSchedulingHelpers")
  return {
    ...actual,
    isSequentialActiveChapter: vi.fn(async () => false)
  }
})

const blockProps = new Map<DbId, Array<{ name: string; value: unknown }>>()

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, id: DbId) => {
    if (command === "get-block") {
      return { properties: blockProps.get(id) ?? [] }
    }
    return undefined
  }),
  notify: vi.fn(),
  state: { blocks: {} as Record<number, unknown> }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import { performArchive, performSkipChapter } from "./irSessionService"

beforeEach(() => {
  vi.clearAllMocks()
  blockProps.clear()
  mockOrca.state.blocks = {}
})

function seedSequentialActive(chapterId: DbId, bookId: DbId) {
  blockProps.set(chapterId, [{ name: "ir.sourceBookId", value: bookId }])
  loadBookIRPlan.mockResolvedValue({
    version: 1,
    bookBlockId: bookId,
    mode: "sequential",
    priority: 50,
    totalDays: 5,
    selectedChapterIds: [chapterId, chapterId + 1],
    activeChapterId: chapterId,
    outcomes: { [String(chapterId)]: "active", [String(chapterId + 1)]: "pending" },
    lastError: null
  })
}

describe("performArchive sequential schedule", () => {
  it("passes nextChapterSchedule=today to advanceSequentialBook and does not plain-complete", async () => {
    seedSequentialActive(10, 100)
    advanceSequentialBook.mockResolvedValue({
      kind: "advanced",
      bookBlockId: 100,
      plan: null,
      success: [10, 11],
      failed: [],
      message: "已完成本章，已解锁 #11"
    })

    const result = await performArchive(10, "orca-srs", { nextChapterSchedule: "today" })

    expect(result).toEqual({ state: null, leftCard: true })
    expect(advanceSequentialBook).toHaveBeenCalledWith({
      bookBlockId: 100,
      chapterId: 10,
      outcome: "completed",
      pluginName: "orca-srs",
      nextChapterSchedule: "today"
    })
    expect(completeIRCard).not.toHaveBeenCalled()
  })

  it("passes nextChapterSchedule=tomorrow explicitly", async () => {
    seedSequentialActive(10, 100)
    advanceSequentialBook.mockResolvedValue({
      kind: "advanced",
      bookBlockId: 100,
      plan: null,
      success: [10, 11],
      failed: [],
      message: "ok"
    })

    await performArchive(10, "orca-srs", { nextChapterSchedule: "tomorrow" })

    expect(advanceSequentialBook).toHaveBeenCalledWith(
      expect.objectContaining({
        nextChapterSchedule: "tomorrow",
        outcome: "completed"
      })
    )
    expect(completeIRCard).not.toHaveBeenCalled()
  })

  it("plain card archives via completeIRCard without sequential advance", async () => {
    blockProps.set(5, []) // no sourceBookId

    await performArchive(5, "orca-srs")

    expect(advanceSequentialBook).not.toHaveBeenCalled()
    expect(completeIRCard).toHaveBeenCalledWith(5, "orca-srs")
  })

  it("distributed book card (non-sequential plan) uses plain complete", async () => {
    blockProps.set(10, [{ name: "ir.sourceBookId", value: 100 }])
    loadBookIRPlan.mockResolvedValue({
      version: 1,
      bookBlockId: 100,
      mode: "distributed",
      priority: 50,
      totalDays: 10,
      selectedChapterIds: [10, 11],
      activeChapterId: 10,
      outcomes: { "10": "active", "11": "active" },
      lastError: null
    })

    await performArchive(10, "orca-srs", { nextChapterSchedule: "today" })

    expect(advanceSequentialBook).not.toHaveBeenCalled()
    expect(completeIRCard).toHaveBeenCalledWith(10, "orca-srs")
  })

  it("surfaces sequential advance errors and does not plain-complete", async () => {
    seedSequentialActive(10, 100)
    advanceSequentialBook.mockRejectedValue(new Error("An object could not be cloned."))

    await expect(
      performArchive(10, "orca-srs", { nextChapterSchedule: "today" })
    ).rejects.toThrow(/could not be cloned/i)

    expect(completeIRCard).not.toHaveBeenCalled()
  })

  it("surfaces malformed plan errors instead of plain-complete", async () => {
    blockProps.set(10, [{ name: "ir.sourceBookId", value: 100 }])
    loadBookIRPlan.mockRejectedValue(new Error("Malformed ir.bookPlan JSON"))

    await expect(performArchive(10, "orca-srs")).rejects.toThrow(/Malformed ir.bookPlan/)
    expect(completeIRCard).not.toHaveBeenCalled()
    expect(advanceSequentialBook).not.toHaveBeenCalled()
  })

  it("coerces string ir.sourceBookId so sequential advance is not skipped", async () => {
    // Orca PropType.Number may surface as string in some state paths
    blockProps.set(10, [{ name: "ir.sourceBookId", value: "100" }])
    loadBookIRPlan.mockResolvedValue({
      version: 1,
      bookBlockId: 100,
      mode: "sequential",
      priority: 50,
      totalDays: 5,
      selectedChapterIds: [10, 11],
      activeChapterId: 10,
      outcomes: { "10": "active", "11": "pending" },
      lastError: null
    })
    advanceSequentialBook.mockResolvedValue({
      kind: "advanced",
      bookBlockId: 100,
      plan: null,
      success: [10, 11],
      failed: [],
      message: "ok"
    })

    await performArchive(10, "orca-srs", { nextChapterSchedule: "today" })

    expect(loadBookIRPlan).toHaveBeenCalledWith(100)
    expect(advanceSequentialBook).toHaveBeenCalledWith(
      expect.objectContaining({
        bookBlockId: 100,
        chapterId: 10,
        nextChapterSchedule: "today"
      })
    )
    expect(completeIRCard).not.toHaveBeenCalled()
  })

  it("propagates next-init failure without plain-complete (no silent book exit)", async () => {
    seedSequentialActive(10, 100)
    advanceSequentialBook.mockRejectedValue(
      new Error("激活下一章 #11 失败，当前章未完成清理: 未找到章节块 #11")
    )

    await expect(
      performArchive(10, "orca-srs", { nextChapterSchedule: "today" })
    ).rejects.toThrow(/激活下一章/)

    expect(completeIRCard).not.toHaveBeenCalled()
  })
})

describe("performSkipChapter", () => {
  it("requires sequential active chapter", async () => {
    blockProps.set(5, [])
    await expect(performSkipChapter(5)).rejects.toThrow(/不是顺序解锁/)
  })

  it("advances with skipped outcome (default schedule path)", async () => {
    seedSequentialActive(10, 100)
    advanceSequentialBook.mockResolvedValue({
      kind: "advanced",
      bookBlockId: 100,
      plan: null,
      success: [10, 11],
      failed: []
    })

    await performSkipChapter(10, "orca-srs")

    expect(advanceSequentialBook).toHaveBeenCalledWith({
      bookBlockId: 100,
      chapterId: 10,
      outcome: "skipped",
      pluginName: "orca-srs",
      nextChapterSchedule: undefined
    })
  })
})
