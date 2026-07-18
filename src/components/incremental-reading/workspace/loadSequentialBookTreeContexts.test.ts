import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IRCard } from "../../../srs/incrementalReadingCollector"

const mockOrca = {
  state: { blocks: {} as Record<number, unknown> },
  invokeBackend: vi.fn()
}

// @ts-expect-error test global
globalThis.orca = mockOrca

vi.mock("../../../srs/book-ir/bookIRPlanRepository", () => ({
  loadBookIRPlan: vi.fn()
}))

vi.mock("../../../importers/epub/epubManifestChapters", () => ({
  getImportedChaptersFromManifest: vi.fn()
}))

import { loadBookIRPlan } from "../../../srs/book-ir/bookIRPlanRepository"
import { getImportedChaptersFromManifest } from "../../../importers/epub/epubManifestChapters"
import { loadSequentialBookTreeContexts } from "./loadSequentialBookTreeContexts"

function makeCard(partial: Partial<IRCard> & { id: number }): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType ?? "topic",
    priority: partial.priority ?? 10,
    position: partial.position ?? null,
    due: partial.due ?? new Date(),
    intervalDays: partial.intervalDays ?? 5,
    postponeCount: partial.postponeCount ?? 0,
    stage: partial.stage ?? "topic.preview",
    lastAction: partial.lastAction ?? "init",
    lastRead: partial.lastRead ?? null,
    readCount: partial.readCount ?? 0,
    isNew: partial.isNew ?? false,
    resumeBlockId: partial.resumeBlockId ?? null,
    readingBreakpoint: partial.readingBreakpoint ?? null,
    sourceBookId: partial.sourceBookId ?? null,
    sourceBookTitle: partial.sourceBookTitle ?? null,
    sourceWebUrl: partial.sourceWebUrl ?? null,
    sourceWebSiteName: partial.sourceWebSiteName ?? null,
    batchId: partial.batchId ?? null,
    batchCreatedAt: partial.batchCreatedAt ?? null,
    sourceTopicId: partial.sourceTopicId ?? null
  }
}

describe("loadSequentialBookTreeContexts", () => {
  beforeEach(() => {
    vi.mocked(loadBookIRPlan).mockReset()
    vi.mocked(getImportedChaptersFromManifest).mockReset()
    mockOrca.state.blocks = {}
    mockOrca.invokeBackend.mockReset()
  })

  it("loads sequential plan + manifest titles for books present via IR cards", async () => {
    vi.mocked(loadBookIRPlan).mockResolvedValue({
      version: 1,
      bookBlockId: 10,
      mode: "sequential",
      priority: 50,
      totalDays: 0,
      selectedChapterIds: [1, 2, 3],
      activeChapterId: 2,
      outcomes: {
        "1": "completed",
        "2": "active",
        "3": "pending"
      },
      lastError: null
    })
    vi.mocked(getImportedChaptersFromManifest).mockResolvedValue({
      manifest: {} as any,
      chapters: [
        { blockId: 1, title: "第一章", key: "c1", spineIndex: 0 },
        { blockId: 2, title: "第二章", key: "c2", spineIndex: 1 },
        { blockId: 3, title: "第三章", key: "c3", spineIndex: 2 }
      ]
    })

    const cards = [
      makeCard({ id: 2, sourceBookId: 10, sourceBookTitle: "示例书" })
    ]
    const { contexts, warnings } = await loadSequentialBookTreeContexts(cards)

    expect(warnings).toEqual([])
    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toMatchObject({
      bookBlockId: 10,
      bookTitle: "示例书",
      selectedChapterIds: [1, 2, 3],
      activeChapterId: 2,
      chapterTitles: {
        "1": "第一章",
        "2": "第二章",
        "3": "第三章"
      }
    })
  })

  it("skips distributed books and surfaces plan/manifest errors", async () => {
    vi.mocked(loadBookIRPlan)
      .mockResolvedValueOnce({
        version: 1,
        bookBlockId: 20,
        mode: "distributed",
        priority: 50,
        totalDays: 30,
        selectedChapterIds: [5, 6],
        activeChapterId: null,
        outcomes: { "5": "active", "6": "active" }
      })
      .mockRejectedValueOnce(new Error("plan corrupt"))

    vi.mocked(getImportedChaptersFromManifest).mockRejectedValue(new Error("no manifest"))

    const cards = [
      makeCard({ id: 5, sourceBookId: 20, sourceBookTitle: "分布式书" }),
      makeCard({ id: 7, sourceBookId: 30, sourceBookTitle: "坏计划书" })
    ]
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { contexts, warnings } = await loadSequentialBookTreeContexts(cards)
    consoleSpy.mockRestore()

    expect(contexts).toEqual([])
    expect(warnings.some(w => w.includes("#30") && w.includes("ir.bookPlan"))).toBe(true)
  })

  it("keeps sequential context when manifest fails but plan loads", async () => {
    vi.mocked(loadBookIRPlan).mockResolvedValue({
      version: 1,
      bookBlockId: 40,
      mode: "sequential",
      priority: 40,
      totalDays: 0,
      selectedChapterIds: [8, 9],
      activeChapterId: 8,
      outcomes: { "8": "active", "9": "pending" }
    })
    vi.mocked(getImportedChaptersFromManifest).mockRejectedValue(new Error("manifest missing"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { contexts, warnings } = await loadSequentialBookTreeContexts([
      makeCard({ id: 8, sourceBookId: 40, sourceBookTitle: "无 manifest 书" })
    ])
    consoleSpy.mockRestore()

    expect(contexts).toHaveLength(1)
    expect(contexts[0].selectedChapterIds).toEqual([8, 9])
    expect(contexts[0].chapterTitles).toEqual({})
    expect(warnings.some(w => w.includes("epub.manifest"))).toBe(true)
  })

  it("uses the book block alias when the active chapter sourceBookTitle is null", async () => {
    vi.mocked(loadBookIRPlan).mockResolvedValue({
      version: 1,
      bookBlockId: 10,
      mode: "sequential",
      priority: 50,
      totalDays: 0,
      selectedChapterIds: [14, 52],
      activeChapterId: 52,
      outcomes: { "14": "completed", "52": "active" }
    })
    vi.mocked(getImportedChaptersFromManifest).mockResolvedValue({
      manifest: {} as any,
      chapters: [
        { blockId: 14, title: "第一章", key: "c1", spineIndex: 0 },
        { blockId: 52, title: "第二章", key: "c2", spineIndex: 1 }
      ]
    })
    mockOrca.invokeBackend.mockResolvedValue({
      id: 10,
      text: "书籍正文标题\n",
      aliases: ["真实书名"],
      properties: []
    })

    const { contexts, warnings } = await loadSequentialBookTreeContexts([
      makeCard({ id: 52, sourceBookId: 10, sourceBookTitle: null })
    ])

    expect(warnings).toEqual([])
    expect(contexts[0].bookTitle).toBe("真实书名")
    expect(mockOrca.invokeBackend).toHaveBeenCalledWith("get-block", 10)
  })
})
