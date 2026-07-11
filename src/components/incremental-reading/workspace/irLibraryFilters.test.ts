import { describe, expect, it } from "vitest"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { getIRDateGroup } from "../../../srs/incrementalReadingManagerUtils"
import {
  collectIRSourceBookOptions,
  createDefaultIRLibraryFilters,
  filterAndSortIRCards,
  formatIRCardTypeLabel,
  formatIRDueDate,
  formatIRDueStatus,
  formatIRStageLabel,
  getIRDueTone,
  groupSortedIRLibraryCards,
  hasActiveIRLibraryFilters,
  summarizeIRLibrary
} from "./irLibraryFilters"

function createCard(partial: Partial<IRCard> & { id: number }): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType ?? "extracts",
    priority: partial.priority ?? 50,
    position: partial.position ?? null,
    due: partial.due ?? new Date("2026-01-19T08:00:00"),
    intervalDays: partial.intervalDays ?? 2,
    postponeCount: partial.postponeCount ?? 0,
    stage: partial.stage ?? "extract.raw",
    lastAction: partial.lastAction ?? "init",
    lastRead: partial.lastRead ?? null,
    readCount: partial.readCount ?? 0,
    isNew: partial.isNew ?? false,
    resumeBlockId: partial.resumeBlockId ?? null,
    sourceBookId: partial.sourceBookId ?? null,
    sourceBookTitle: partial.sourceBookTitle ?? null,
    batchId: partial.batchId ?? null,
    batchCreatedAt: partial.batchCreatedAt ?? null
  }
}

describe("irLibraryFilters", () => {
  const now = new Date("2026-01-19T14:30:00")

  const cards: IRCard[] = [
    createCard({
      id: 1,
      cardType: "topic",
      due: new Date("2026-01-18T08:00:00"),
      priority: 80,
      stage: "topic.work",
      sourceBookId: 10,
      sourceBookTitle: "Book A",
      readCount: 3
    }),
    createCard({
      id: 2,
      cardType: "extracts",
      due: new Date("2026-01-19T08:00:00"),
      priority: 20,
      stage: "extract.raw",
      sourceBookId: 10,
      sourceBookTitle: "Book A",
      readCount: 1
    }),
    createCard({
      id: 3,
      cardType: "extracts",
      due: new Date("2026-01-25T08:00:00"),
      priority: 50,
      stage: "extract.refined",
      isNew: true,
      sourceBookId: 20,
      sourceBookTitle: "Book B",
      readCount: 0
    }),
    createCard({
      id: 4,
      cardType: "topic",
      due: new Date("2026-02-01T08:00:00"),
      priority: 50,
      stage: "topic.preview",
      readCount: 2
    })
  ]

  it("detects active filters", () => {
    expect(hasActiveIRLibraryFilters(createDefaultIRLibraryFilters())).toBe(false)
    expect(hasActiveIRLibraryFilters({
      ...createDefaultIRLibraryFilters(),
      query: "book"
    })).toBe(true)
  })

  it("filters by card type, due status and importance", () => {
    const filters = {
      ...createDefaultIRLibraryFilters(),
      cardType: "topic" as const,
      dueStatus: "overdue" as const,
      importance: "high" as const
    }
    const result = filterAndSortIRCards(cards, filters, { now })
    expect(result.map(c => c.id)).toEqual([1])
  })

  it("filters by source book and stage", () => {
    const filters = {
      ...createDefaultIRLibraryFilters(),
      sourceBook: "20",
      stage: "extract.refined"
    }
    const result = filterAndSortIRCards(cards, filters, { now })
    expect(result.map(c => c.id)).toEqual([3])
  })

  it("filters by text query against title map and book", () => {
    const filters = {
      ...createDefaultIRLibraryFilters(),
      query: "intro"
    }
    const result = filterAndSortIRCards(cards, filters, {
      now,
      titleMap: { "1": "Intro chapter", "2": "Other" }
    })
    expect(result.map(c => c.id)).toEqual([1])

    const byBook = filterAndSortIRCards(cards, {
      ...createDefaultIRLibraryFilters(),
      query: "book b"
    }, { now })
    expect(byBook.map(c => c.id)).toEqual([3])
  })

  it("sorts by priority descending", () => {
    const filters = {
      ...createDefaultIRLibraryFilters(),
      sortBy: "priority" as const,
      sortDir: "desc" as const
    }
    const result = filterAndSortIRCards(cards, filters, { now })
    // 优先级 80 → 50/50 → 20；同分时 id 也随 sortDir 降序
    expect(result.map(c => c.id)).toEqual([1, 4, 3, 2])
  })

  it("preserves the selected sort order inside date groups", () => {
    const sameDayCards = [
      createCard({ id: 10, due: new Date("2026-01-19T08:00:00"), priority: 20 }),
      createCard({ id: 11, due: new Date("2026-01-19T09:00:00"), priority: 90 })
    ]
    const sorted = filterAndSortIRCards(sameDayCards, {
      ...createDefaultIRLibraryFilters(),
      sortBy: "priority",
      sortDir: "desc"
    }, { now })

    const groups = groupSortedIRLibraryCards(sorted, now)
    expect(groups[0].cards.map(card => card.id)).toEqual([11, 10])
  })

  it("collects source book options", () => {
    const options = collectIRSourceBookOptions(cards)
    expect(options).toEqual([
      { id: "10", title: "Book A", count: 2 },
      { id: "20", title: "Book B", count: 1 }
    ])
  })

  it("summarizes library totals", () => {
    const filtered = filterAndSortIRCards(cards, {
      ...createDefaultIRLibraryFilters(),
      cardType: "topic"
    }, { now })
    const summary = summarizeIRLibrary(cards, filtered, now)
    expect(summary.total).toBe(4)
    expect(summary.filtered).toBe(2)
    expect(summary.overdue).toBe(1)
    expect(summary.today).toBe(1)
    expect(summary.newCount).toBe(1)
    expect(summary.topics).toBe(2)
    expect(summary.extracts).toBe(2)
  })

  it("formats internal card metadata for the library UI", () => {
    expect(formatIRCardTypeLabel("topic")).toBe("主题")
    expect(formatIRCardTypeLabel("extracts")).toBe("摘录")
    expect(formatIRStageLabel("topic.preview")).toBe("预览")
    expect(formatIRStageLabel("custom.stage")).toBe("custom.stage")
  })

  it("maps due groups to stable visual tones", () => {
    expect(getIRDueTone(cards[0], now)).toBe("overdue")
    expect(getIRDueTone(cards[1], now)).toBe("today")
    expect(getIRDueTone(cards[2], now)).toBe("new")
    expect(getIRDueTone(cards[3], now)).toBe("upcoming")
  })

  describe("due date vs due status formatting", () => {
    const newCardA = createCard({
      id: 101,
      due: new Date("2026-02-10T08:00:00"),
      isNew: true
    })
    const newCardB = createCard({
      id: 102,
      due: new Date("2026-03-15T08:00:00"),
      isNew: true
    })

    it("formats new cards as concrete dates, not the new-card label", () => {
      expect(formatIRDueDate(newCardA.due)).toBe("2026/2/10")
      expect(formatIRDueDate(newCardA.due)).not.toBe("新卡")
    })

    it("formats different due dates for new cards distinctly", () => {
      expect(formatIRDueDate(newCardA.due)).not.toBe(formatIRDueDate(newCardB.due))
      expect(formatIRDueDate(newCardA.due)).toBe("2026/2/10")
      expect(formatIRDueDate(newCardB.due)).toBe("2026/3/15")
    })

    it("keeps new cards in the new-card group", () => {
      expect(getIRDateGroup(newCardA, now)).toBe("新卡")
      expect(getIRDateGroup(newCardB, now)).toBe("新卡")
      const groups = groupSortedIRLibraryCards([newCardA, newCardB], now)
      expect(groups).toHaveLength(1)
      expect(groups[0].key).toBe("新卡")
      expect(groups[0].cards.map(card => card.id)).toEqual([101, 102])
    })

    it("keeps new-card visual tone", () => {
      expect(getIRDueTone(newCardA, now)).toBe("new")
      expect(getIRDueTone(newCardB, now)).toBe("new")
    })

    it("preserves due status labels for today, overdue, and future dates", () => {
      expect(formatIRDueStatus(cards[0], now)).toBe("已逾期")
      expect(formatIRDueStatus(cards[1], now)).toBe("今天")
      expect(formatIRDueStatus(cards[3], now)).toBe("7天后")
      expect(formatIRDueStatus(newCardA, now)).toBe("新卡")
    })
  })
})
