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
    expect(presentation.isNonActionable).toBe(false)
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
    expect(presentation.isNonActionable).toBe(true)
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

  it("marks sequential placeholders as non-actionable with status labels", () => {
    const presentation = getIRChapterPresentation(makeChapter({
      chapterId: "2",
      card: null,
      cardMatches: false,
      title: "第二章",
      due: null,
      sortDue: null,
      stage: "",
      sequentialStatus: "pending",
      isSequentialPlaceholder: true
    }))

    expect(presentation.chapterCard).toBeNull()
    expect(presentation.isSequentialPlaceholder).toBe(true)
    expect(presentation.isNonActionable).toBe(true)
    expect(presentation.canExpand).toBe(false)
    expect(presentation.sequentialStatusLabel).toBe("未激活")
  })

  it("keeps active sequential chapter actions when live card matches", () => {
    const presentation = getIRChapterPresentation(makeChapter({
      sequentialStatus: "active",
      isSequentialPlaceholder: false
    }))

    expect(presentation.chapterCard?.id).toBe(10)
    expect(presentation.isSequentialPlaceholder).toBe(false)
    expect(presentation.isNonActionable).toBe(false)
    expect(presentation.sequentialStatusLabel).toBe("当前激活")
    expect(presentation.isCompletedContext).toBe(false)
  })

  it("marks sequential completed outline as non-actionable with 已完成 label", () => {
    const extract = { ...makeCard(40), cardType: "extracts" as const }
    const presentation = getIRChapterPresentation(makeChapter({
      chapterId: "3",
      card: null,
      cardMatches: false,
      title: "第三章",
      due: null,
      sortDue: null,
      stage: "",
      sequentialStatus: "completed",
      isSequentialPlaceholder: true,
      extracts: [{ type: "extract", card: extract, title: "遗留摘录" }]
    }))

    expect(presentation.chapterCard).toBeNull()
    expect(presentation.isContextOnly).toBe(true)
    expect(presentation.isCompletedContext).toBe(true)
    expect(presentation.isNonActionable).toBe(true)
    expect(presentation.canExpand).toBe(true)
    expect(presentation.sequentialStatus).toBe("completed")
    expect(presentation.sequentialStatusLabel).toBe("已完成")
    expect(presentation.extractCountLabel).toBe("1 个匹配摘录")
  })

  it("shows 已完成 for non-sequential completed context via isCompletedContext", () => {
    const extract = { ...makeCard(50), cardType: "extracts" as const }
    const presentation = getIRChapterPresentation(makeChapter({
      chapterId: "99",
      card: null,
      cardMatches: false,
      title: "已读完的主题",
      due: null,
      sortDue: null,
      stage: "",
      sequentialStatus: null,
      isCompletedContext: true,
      extracts: [{ type: "extract", card: extract, title: "摘录 A" }]
    }))

    expect(presentation.chapterCard).toBeNull()
    expect(presentation.isCompletedContext).toBe(true)
    expect(presentation.isNonActionable).toBe(true)
    expect(presentation.canExpand).toBe(true)
    expect(presentation.sequentialStatus).toBe("completed")
    expect(presentation.sequentialStatusLabel).toBe("已完成")
  })

  it("shows 已完成 when sequentialStatus completed without isCompletedContext flag", () => {
    const presentation = getIRChapterPresentation(makeChapter({
      card: null,
      cardMatches: false,
      sequentialStatus: "completed",
      isSequentialPlaceholder: false,
      extracts: []
    }))

    expect(presentation.isCompletedContext).toBe(true)
    expect(presentation.isNonActionable).toBe(true)
    expect(presentation.canExpand).toBe(false)
    expect(presentation.sequentialStatusLabel).toBe("已完成")
  })

  it("does not treat extract-only context as completed without status flags", () => {
    const extract = { ...makeCard(60), cardType: "extracts" as const }
    const presentation = getIRChapterPresentation(makeChapter({
      cardMatches: false,
      extracts: [{ type: "extract", card: extract, title: "命中摘录" }]
    }))

    expect(presentation.isNonActionable).toBe(true)
    expect(presentation.isCompletedContext).toBe(false)
    expect(presentation.sequentialStatusLabel).toBeNull()
    expect(presentation.canExpand).toBe(true)
  })
})