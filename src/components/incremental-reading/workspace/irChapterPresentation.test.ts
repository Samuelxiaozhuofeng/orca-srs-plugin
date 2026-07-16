import { describe, expect, it } from "vitest"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import type { IRChapterNode } from "./irSourceTreeBuilder"
import { getIRChapterPresentation } from "./irChapterPresentation"

function makeCard(id: number): IRCard {
  return {
    id,
    cardType: "topic",
    priority: 50,
    position: null,
    due: new Date(2026, 6, 16),
    intervalDays: 5,
    postponeCount: 0,
    stage: "topic.preview",
    lastAction: "init",
    lastRead: null,
    readCount: 0,
    isNew: true,
    resumeBlockId: null,
    sourceBookId: 1,
    sourceBookTitle: "测试书",
    batchId: null,
    batchCreatedAt: null,
    sourceTopicId: null
  }
}

function makeChapter(overrides: Partial<IRChapterNode> = {}): IRChapterNode {
  const card = makeCard(10)
  return {
    type: "chapter",
    chapterId: "10",
    isFallback: false,
    card,
    cardMatches: true,
    title: "第一章",
    due: card.due,
    sortDue: card.due,
    stage: card.stage,
    priority: card.priority,
    extracts: [],
    ...overrides
  }
}

describe("getIRChapterPresentation", () => {
  it("uses the chapter header itself as the matched Topic card", () => {
    const chapter = makeChapter()
    const presentation = getIRChapterPresentation(chapter)

    expect(presentation.chapterCard?.id).toBe(10)
    expect(presentation.isContextOnly).toBe(false)
    expect(presentation.extractCountLabel).toBeNull()
  })

  it("hides Topic actions when only a child Extract matches", () => {
    const extract = { ...makeCard(20), cardType: "extracts" as const }
    const chapter = makeChapter({
      cardMatches: false,
      extracts: [{ type: "extract", card: extract, title: "命中的摘录" }]
    })
    const presentation = getIRChapterPresentation(chapter)

    expect(presentation.chapterCard).toBeNull()
    expect(presentation.isContextOnly).toBe(true)
    expect(presentation.canExpand).toBe(true)
    expect(presentation.extractCountLabel).toBe("1 个匹配摘录")
  })

  it("treats the unassigned-extract fallback as context only", () => {
    const extract = { ...makeCard(30), cardType: "extracts" as const }
    const presentation = getIRChapterPresentation(makeChapter({
      isFallback: true,
      card: null,
      cardMatches: false,
      extracts: [{ type: "extract", card: extract, title: "孤立摘录" }]
    }))

    expect(presentation).toMatchObject({
      chapterCard: null,
      isContextOnly: true,
      canExpand: true,
      extractCountLabel: "1 个匹配摘录"
    })
  })
})
