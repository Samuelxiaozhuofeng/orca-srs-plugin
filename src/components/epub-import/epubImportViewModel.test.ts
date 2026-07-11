import { describe, expect, it } from "vitest"
import {
  canProceedFromChapters,
  canProceedFromTitle,
  defaultBookTitle,
  resultSummary,
  schedulePreviewText,
  selectAllChapterKeys,
  toggleChapterKey,
  accessibilityLabels
} from "./epubImportViewModel"
import type { ImportEpubResult } from "../../importers/epub/types"

describe("epubImportViewModel", () => {
  it("defaults title from metadata or filename", () => {
    expect(defaultBookTitle("My Book", "x.epub")).toBe("My Book")
    expect(defaultBookTitle("Unknown Title", "great-book.epub")).toBe("great-book")
  })

  it("toggles chapter keys", () => {
    expect(toggleChapterKey(["a"], "b")).toEqual(["a", "b"])
    expect(toggleChapterKey(["a", "b"], "a")).toEqual(["b"])
  })

  it("requires title and chapters", () => {
    expect(canProceedFromTitle("  ")).toBe(false)
    expect(canProceedFromTitle("Book")).toBe(true)
    expect(canProceedFromChapters([])).toBe(false)
    expect(canProceedFromChapters(["k"])).toBe(true)
  })

  it("select all", () => {
    expect(
      selectAllChapterKeys([
        { id: "1", title: "A", href: "a", key: "0:a", spineIndex: 0 },
        { id: "2", title: "B", href: "b", key: "1:b", spineIndex: 1 }
      ])
    ).toEqual(["0:a", "1:b"])
  })

  it("result summary for partial", () => {
    const result: ImportEpubResult = {
      kind: "created",
      bookBlockId: 1,
      bookTitle: "B",
      fingerprint: "f",
      status: "partial",
      manifest: {
        version: 1,
        fingerprint: "f",
        sourceFileName: "a.epub",
        sourceAssetPath: "p",
        status: "partial",
        bookBlockId: 1,
        chapters: []
      },
      importedChapterIds: [2],
      failedChapters: [
        {
          key: "1:x",
          spineIndex: 1,
          href: "x",
          title: "X",
          blockId: null,
          status: "failed",
          error: "e"
        }
      ],
      pendingChapters: []
    }
    const s = resultSummary(result)
    expect(s.canResume).toBe(true)
    expect(s.canCreateIR).toBe(true)
    expect(s.headline).toContain("未完成")
  })

  it("schedule preview differs by mode", () => {
    expect(schedulePreviewText("sequential", 5, 10)).toMatch(/顺序解锁/)
    expect(schedulePreviewText("distributed", 5, 10)).toMatch(/分散排期/)
  })

  it("exposes accessibility labels", () => {
    const labels = accessibilityLabels()
    expect(labels.fileInput).toBeTruthy()
    expect(labels.continueIR).toContain("渐进阅读")
  })
})
