import { describe, it, expect } from "vitest"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { createDefaultIRLibraryFilters } from "./irLibraryFilters"
import {
  buildIRSourceTree,
  collectIRChapterMatchedCardIds,
  collectIRSourceMatchedCardIds,
  getCardTimeNavKey,
  type IRTimeNavKey
} from "./irSourceTreeBuilder"

function makeCard(partial: Partial<IRCard> & { id: number; cardType: "topic" | "extracts" }): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType,
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

describe("irSourceTreeBuilder", () => {
  const now = new Date(2026, 6, 11, 12, 0, 0) // 2026-07-11 12:00:00

  it("1. 同一本书的多个章节被归入同一来源", () => {
    const cards = [
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "计算机网络" }),
      makeCard({ id: 102, cardType: "topic", sourceBookId: 1, sourceBookTitle: "计算机网络" })
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].sourceId).toBe("1")
    expect(result.sources[0].title).toBe("计算机网络")
    expect(result.sources[0].chapters).toHaveLength(2)
  })

  it("2. 摘录通过真实关联字段归入正确章节", () => {
    const cards = [
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "计算机网络" }),
      makeCard({ id: 201, cardType: "extracts", sourceBookId: 1, sourceBookTitle: "计算机网络", sourceTopicId: 101 }),
      makeCard({ id: 202, cardType: "extracts", sourceBookId: 1, sourceBookTitle: "计算机网络", sourceTopicId: 101 })
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    expect(result.sources[0].chapters).toHaveLength(1)
    const chapter = result.sources[0].chapters[0]
    expect(chapter.chapterId).toBe("101")
    expect(chapter.extracts).toHaveLength(2)
    expect(chapter.extracts.map(e => e.card.id)).toEqual([201, 202])
  })

  it("3. 无法匹配章节的摘录进入兜底分支且不会消失", () => {
    const cards = [
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "计算机网络" }),
      // sourceTopicId 为 999（列表中不存在的主题）
      makeCard({ id: 301, cardType: "extracts", sourceBookId: 1, sourceBookTitle: "计算机网络", sourceTopicId: 999 }),
      // sourceTopicId 为 null
      makeCard({ id: 302, cardType: "extracts", sourceBookId: 1, sourceBookTitle: "计算机网络", sourceTopicId: null })
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    expect(result.sources[0].chapters).toHaveLength(2)
    const fallbackChapter = result.sources[0].chapters.find(c => c.isFallback)
    expect(fallbackChapter).toBeDefined()
    expect(fallbackChapter?.title).toBe("未关联章节的摘录")
    expect(fallbackChapter?.extracts).toHaveLength(2)
    expect(fallbackChapter?.extracts.map(e => e.card.id)).toEqual([301, 302])
  })

  it("4. 无来源卡片进入「未归入来源」", () => {
    const cards = [
      makeCard({ id: 401, cardType: "extracts", sourceTopicId: null })
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].sourceId).toBe("unassigned")
    expect(result.sources[0].title).toBe("未归入来源")
  })

  it("5. 各时间区间边界互斥，特别是今天、明天、未来 7 天", () => {
    const overdueCard = makeCard({ id: 1, cardType: "topic", due: new Date(2026, 6, 10, 23, 59, 59) }) // 昨天
    const todayCard = makeCard({ id: 2, cardType: "topic", due: new Date(2026, 6, 11, 23, 59, 59) }) // 今天
    const tomorrowCard = makeCard({ id: 3, cardType: "topic", due: new Date(2026, 6, 12, 10, 0, 0) }) // 明天 (diffDays = 1)
    const upcomingDay2Card = makeCard({ id: 4, cardType: "topic", due: new Date(2026, 6, 13, 10, 0, 0) }) // 后天 (diffDays = 2)
    const upcomingDay7Card = makeCard({ id: 5, cardType: "topic", due: new Date(2026, 6, 18, 10, 0, 0) }) // 未来第7天 (diffDays = 7)
    const laterCard = makeCard({ id: 6, cardType: "topic", due: new Date(2026, 6, 19, 10, 0, 0) }) // 8天后 (diffDays = 8)
    const newCard = makeCard({ id: 7, cardType: "topic", due: new Date(2026, 6, 11), isNew: true }) // 新卡

    expect(getCardTimeNavKey(overdueCard, now)).toBe("overdue")
    expect(getCardTimeNavKey(todayCard, now)).toBe("today")
    expect(getCardTimeNavKey(tomorrowCard, now)).toBe("tomorrow")
    expect(getCardTimeNavKey(upcomingDay2Card, now)).toBe("upcoming7")
    expect(getCardTimeNavKey(upcomingDay7Card, now)).toBe("upcoming7")
    expect(getCardTimeNavKey(laterCard, now)).toBe("later")
    expect(getCardTimeNavKey(newCard, now)).toBe("new")
  })

  it("6. 点击时间区间后正确裁剪来源与章节", () => {
    const cards = [
      // 书籍 A：有一个今天的主题，和一个明天的主题
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "书籍 A", due: new Date(2026, 6, 11, 14, 0) }),
      makeCard({ id: 102, cardType: "topic", sourceBookId: 1, sourceBookTitle: "书籍 A", due: new Date(2026, 6, 12, 14, 0) }),
      // 书籍 B：只有未来的主题
      makeCard({ id: 201, cardType: "topic", sourceBookId: 2, sourceBookTitle: "书籍 B", due: new Date(2026, 6, 15, 14, 0) })
    ]
    const filters = createDefaultIRLibraryFilters()

    // 筛选 today
    const todayResult = buildIRSourceTree(cards, filters, "today", { now })
    expect(todayResult.sources).toHaveLength(1)
    expect(todayResult.sources[0].sourceId).toBe("1")
    expect(todayResult.sources[0].chapters).toHaveLength(1)
    expect(todayResult.sources[0].chapters[0].chapterId).toBe("101")

    // 筛选 all
    const allResult = buildIRSourceTree(cards, filters, "all", { now })
    expect(allResult.sources).toHaveLength(2)
  })

  it("7. 搜索和高级筛选后保留正确祖先节点（即便章节未命中但摘录命中）", () => {
    const cards = [
      // 章节主题卡为“未指定阶段”，但其下的摘录卡符合重要性 priority = 80（high tier）
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "书籍 A", priority: 50 }), // medium
      makeCard({ id: 201, cardType: "extracts", sourceBookId: 1, sourceBookTitle: "书籍 A", sourceTopicId: 101, priority: 80 }) // high
    ]
    const filters = createDefaultIRLibraryFilters()
    filters.importance = "high" // 仅筛选高重要度

    const result = buildIRSourceTree(cards, filters, "all", { now })
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].chapters).toHaveLength(1)
    expect(result.sources[0].chapters[0].chapterId).toBe("101")
    expect(result.sources[0].chapters[0].cardMatches).toBe(false)
    expect(result.sources[0].chapters[0].extracts).toHaveLength(1)
    expect(result.sources[0].chapters[0].extracts[0].card.id).toBe(201)
  })

  it("8. 来源排序符合逾期、今天、最近到期、名称的顺序", () => {
    const cards = [
      makeCard({ id: 3, cardType: "topic", sourceBookId: 3, sourceBookTitle: "Z最近到期书", due: new Date(2026, 6, 12) }),
      makeCard({ id: 1, cardType: "topic", sourceBookId: 1, sourceBookTitle: "A今天到期书", due: new Date(2026, 6, 11) }),
      makeCard({ id: 2, cardType: "topic", sourceBookId: 2, sourceBookTitle: "B逾期到期书", due: new Date(2026, 6, 10) }),
      makeCard({ id: 4, cardType: "topic", sourceBookId: 4, sourceBookTitle: "A最近到期同日书", due: new Date(2026, 6, 12) })
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    const titles = result.sources.map(s => s.title)
    expect(titles).toEqual([
      "B逾期到期书",       // 含有逾期
      "A今天到期书",       // 含有今天
      "A最近到期同日书",   // 最近到期日 (12号) 中，中文名 a.localeCompare(b, "zh") 较早
      "Z最近到期书"        // 同样 12号到期，中文名排后
    ])
  })

  it("9. 章节按到期时间稳定排序", () => {
    const cards = [
      makeCard({ id: 102, cardType: "topic", sourceBookId: 1, sourceBookTitle: "一本书", due: new Date(2026, 6, 15) }),
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "一本书", due: new Date(2026, 6, 13) })
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    const chapterIds = result.sources[0].chapters.map(c => c.chapterId)
    expect(chapterIds).toEqual(["101", "102"])
  })

  it("11. 顶部计数与实际筛选结果一致", () => {
    const cards = [
      makeCard({ id: 1, cardType: "topic", sourceBookId: 1, due: new Date(2026, 6, 10) }), // overdue
      makeCard({ id: 2, cardType: "topic", sourceBookId: 1, due: new Date(2026, 6, 11) }), // today
      makeCard({ id: 3, cardType: "extracts", sourceBookId: 1, sourceTopicId: 2, due: new Date(2026, 6, 11) }) // today
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    expect(result.timeNavCounts.all).toBe(3)
    expect(result.timeNavCounts.overdue).toBe(1)
    expect(result.timeNavCounts.today).toBe(2)
  })

  it("10. 来源和章节数据完备，支持来源行和统计等 UI 展示数据提取", () => {
    const cards = [
      makeCard({ id: 101, cardType: "topic", sourceBookId: 1, sourceBookTitle: "测试书", due: new Date(2026, 6, 10) }), // overdue
      makeCard({ id: 201, cardType: "extracts", sourceBookId: 1, sourceBookTitle: "测试书", sourceTopicId: 101, due: new Date(2026, 6, 11) }) // today
    ]
    const filters = createDefaultIRLibraryFilters()
    const result = buildIRSourceTree(cards, filters, "all", { now })

    const source = result.sources[0]
    expect(source.stats.totalChapterCount).toBe(1)
    expect(source.stats.matchedChapterCount).toBe(1)
    expect(source.stats.totalCardCount).toBe(2)
    expect(source.stats.timeGroupCardCounts.overdue).toBe(1)
    expect(source.stats.timeGroupCardCounts.today).toBe(1)
  })

  it("12. 来源与章节数据结构支持选择与关键行操作", () => {
    const cards = [
      makeCard({ id: 501, cardType: "topic", sourceBookId: 10, sourceBookTitle: "多选测试书" }),
      makeCard({ id: 601, cardType: "extracts", sourceBookId: 10, sourceBookTitle: "多选测试书", sourceTopicId: 501 }),
      makeCard({ id: 602, cardType: "extracts", sourceBookId: 10, sourceBookTitle: "多选测试书", sourceTopicId: 501 })
    ]
    const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "all", { now })
    const chapter = result.sources[0].chapters[0]

    expect(collectIRChapterMatchedCardIds(chapter)).toEqual([501, 601, 602])
    expect(collectIRSourceMatchedCardIds(result.sources[0])).toEqual([501, 601, 602])
  })

  it("13. 非书籍主题形成独立来源并接纳关联摘录", () => {
    const cards = [
      makeCard({ id: 701, cardType: "topic" }),
      makeCard({ id: 702, cardType: "extracts", sourceTopicId: 701 })
    ]
    const result = buildIRSourceTree(
      cards,
      createDefaultIRLibraryFilters(),
      "all",
      { now, titleMap: { "701": "一篇长网页", "702": "网页摘录" } }
    )

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      sourceType: "general",
      sourceId: "topic:701",
      title: "一篇长网页"
    })
    expect(result.sources[0].chapters[0].extracts[0].card.id).toBe(702)
  })

  it("14. 时间筛选仅将父章节作为结构上下文保留", () => {
    const cards = [
      makeCard({
        id: 801,
        cardType: "topic",
        sourceBookId: 8,
        due: new Date(2026, 6, 12)
      }),
      makeCard({
        id: 802,
        cardType: "extracts",
        sourceBookId: 8,
        sourceTopicId: 801,
        due: new Date(2026, 6, 11)
      })
    ]
    const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "today", { now })
    const chapter = result.sources[0].chapters[0]

    expect(chapter.card?.id).toBe(801)
    expect(chapter.cardMatches).toBe(false)
    expect(chapter.due).toEqual(new Date(2026, 6, 12))
    expect(chapter.sortDue).toEqual(new Date(2026, 6, 11))
    expect(chapter.extracts.map(node => node.card.id)).toEqual([802])
    expect(result.sources[0].stats.matchedCardCount).toBe(1)
    expect(collectIRSourceMatchedCardIds(result.sources[0])).toEqual([802])
  })

  it("15. Web Import Topic 和其 Extract 聚合到统一网页来源", () => {
    const cards = [
      makeCard({
        id: 901,
        cardType: "topic",
        sourceWebUrl: "https://example.com/one",
        sourceWebSiteName: "Example"
      }),
      makeCard({
        id: 902,
        cardType: "topic",
        sourceWebUrl: "https://news.example.org/two",
        sourceWebSiteName: "Example News"
      }),
      makeCard({
        id: 903,
        cardType: "extracts",
        sourceTopicId: 901
      })
    ]
    const result = buildIRSourceTree(
      cards,
      createDefaultIRLibraryFilters(),
      "all",
      {
        now,
        titleMap: {
          "901": "网页文章一",
          "902": "网页文章二",
          "903": "文章一的摘录"
        }
      }
    )

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      sourceType: "web",
      sourceId: "web",
      title: "网页"
    })
    expect(result.sources[0].chapters).toHaveLength(2)
    const firstArticle = result.sources[0].chapters.find(chapter => chapter.chapterId === "901")
    expect(firstArticle?.extracts.map(node => node.card.id)).toEqual([903])
    expect(result.sources[0].stats).toMatchObject({
      totalChapterCount: 2,
      totalCardCount: 3,
      matchedCardCount: 3
    })
  })

  it("16. 网页来源筛选保留文章和通过父 Topic 继承来源的 Extract", () => {
    const cards = [
      makeCard({
        id: 911,
        cardType: "topic",
        sourceWebUrl: "https://example.com/article"
      }),
      makeCard({ id: 912, cardType: "extracts", sourceTopicId: 911 }),
      makeCard({ id: 913, cardType: "topic" })
    ]
    const filters = createDefaultIRLibraryFilters()
    filters.sourceBook = "web"

    const result = buildIRSourceTree(cards, filters, "all", {
      now,
      titleMap: { "911": "网页文章", "912": "网页摘录", "913": "普通主题" }
    })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].sourceType).toBe("web")
    expect(collectIRSourceMatchedCardIds(result.sources[0])).toEqual([911, 912])
  })

  describe("顺序解锁 Book IR 大纲占位", () => {
    const sequentialPlan = {
      bookBlockId: 1 as const,
      bookTitle: "顺序阅读示例",
      selectedChapterIds: [1, 2, 3] as number[],
      activeChapterId: 1 as number | null,
      outcomes: {
        "1": "active" as const,
        "2": "pending" as const,
        "3": "pending" as const
      },
      chapterTitles: {
        "1": "第一章",
        "2": "第二章",
        "3": "第三章"
      }
    }

    it("17. 仅有第 1 章真实卡片时树仍含 3 个章节且状态正确、顺序稳定", () => {
      const cards = [
        makeCard({
          id: 1,
          cardType: "topic",
          sourceBookId: 1,
          sourceBookTitle: "顺序阅读示例",
          due: new Date(2026, 6, 11)
        })
      ]
      const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "all", {
        now,
        sequentialBooks: [sequentialPlan],
        titleMap: { "1": "第一章" }
      })

      expect(result.sources).toHaveLength(1)
      expect(result.sources[0].chapters).toHaveLength(3)
      expect(result.sources[0].chapters.map(c => c.chapterId)).toEqual(["1", "2", "3"])
      expect(result.sources[0].chapters.map(c => c.sequentialStatus)).toEqual([
        "active",
        "pending",
        "pending"
      ])
      expect(result.sources[0].chapters[0].card?.id).toBe(1)
      expect(result.sources[0].chapters[0].isSequentialPlaceholder).toBe(false)
      expect(result.sources[0].chapters[1].card).toBeNull()
      expect(result.sources[0].chapters[1].isSequentialPlaceholder).toBe(true)
      expect(result.sources[0].chapters[1].title).toBe("第二章")
      expect(result.sources[0].chapters[2].isSequentialPlaceholder).toBe(true)
      expect(result.sources[0].stats.totalChapterCount).toBe(3)
    })

    it("18. 完成第一章后仅有第 2 章卡片时，默认视图不空且含 completed/active/pending", () => {
      const cards = [
        makeCard({
          id: 2,
          cardType: "topic",
          sourceBookId: 1,
          sourceBookTitle: "顺序阅读示例",
          due: new Date(2026, 6, 12)
        })
      ]
      const planAfterCh1 = {
        ...sequentialPlan,
        activeChapterId: 2,
        outcomes: {
          "1": "completed" as const,
          "2": "active" as const,
          "3": "pending" as const
        }
      }
      const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "all", {
        now,
        sequentialBooks: [planAfterCh1],
        titleMap: { "2": "第二章" }
      })

      expect(result.sources).toHaveLength(1)
      expect(result.sources[0].chapters).toHaveLength(3)
      expect(result.sources[0].chapters.map(c => c.sequentialStatus)).toEqual([
        "completed",
        "active",
        "pending"
      ])
      expect(result.sources[0].chapters[0].isSequentialPlaceholder).toBe(true)
      expect(result.sources[0].chapters[0].card).toBeNull()
      expect(result.sources[0].chapters[1].card?.id).toBe(2)
      expect(result.sources[0].chapters[1].cardMatches).toBe(true)
      expect(result.sources[0].chapters[2].isSequentialPlaceholder).toBe(true)
    })

    it("19. 占位章节不出现在可选择 card id 集合中", () => {
      const cards = [
        makeCard({
          id: 2,
          cardType: "topic",
          sourceBookId: 1,
          sourceBookTitle: "顺序阅读示例",
          due: new Date(2026, 6, 12)
        })
      ]
      const planAfterCh1 = {
        ...sequentialPlan,
        activeChapterId: 2,
        outcomes: {
          "1": "completed" as const,
          "2": "active" as const,
          "3": "pending" as const
        }
      }
      const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "all", {
        now,
        sequentialBooks: [planAfterCh1]
      })
      const source = result.sources[0]
      const placeholder = source.chapters.find(c => c.chapterId === "1")!
      const active = source.chapters.find(c => c.chapterId === "2")!
      const pending = source.chapters.find(c => c.chapterId === "3")!

      expect(collectIRChapterMatchedCardIds(placeholder)).toEqual([])
      expect(collectIRChapterMatchedCardIds(pending)).toEqual([])
      expect(collectIRChapterMatchedCardIds(active)).toEqual([2])
      expect(collectIRSourceMatchedCardIds(source)).toEqual([2])
    })

    it("20. 跳过章节显示 skipped；普通 Topic / distributed 不受影响", () => {
      const cards = [
        makeCard({
          id: 3,
          cardType: "topic",
          sourceBookId: 1,
          sourceBookTitle: "顺序阅读示例"
        }),
        makeCard({
          id: 50,
          cardType: "topic",
          sourceBookId: null,
          sourceBookTitle: null
        })
      ]
      const plan = {
        ...sequentialPlan,
        activeChapterId: 3,
        outcomes: {
          "1": "completed" as const,
          "2": "skipped" as const,
          "3": "active" as const
        }
      }
      const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "all", {
        now,
        sequentialBooks: [plan],
        titleMap: { "3": "第三章", "50": "独立主题" }
      })

      const book = result.sources.find(s => s.sourceId === "1")!
      expect(book.chapters.map(c => c.sequentialStatus)).toEqual([
        "completed",
        "skipped",
        "active"
      ])

      const topicSource = result.sources.find(s => s.sourceId === "topic:50")
      expect(topicSource).toBeDefined()
      expect(topicSource!.chapters).toHaveLength(1)
      expect(topicSource!.chapters[0].sequentialStatus ?? null).toBeNull()
      expect(topicSource!.chapters[0].isSequentialPlaceholder).toBeFalsy()
    })

    it("21. 时间导航 today 不把纯占位章节算进匹配，但激活章仍可见", () => {
      const cards = [
        makeCard({
          id: 2,
          cardType: "topic",
          sourceBookId: 1,
          sourceBookTitle: "顺序阅读示例",
          due: new Date(2026, 6, 11, 9, 0, 0),
          isNew: false
        })
      ]
      const planAfterCh1 = {
        ...sequentialPlan,
        activeChapterId: 2,
        outcomes: {
          "1": "completed" as const,
          "2": "active" as const,
          "3": "pending" as const
        }
      }
      const result = buildIRSourceTree(cards, createDefaultIRLibraryFilters(), "today", {
        now,
        sequentialBooks: [planAfterCh1]
      })

      expect(result.sources).toHaveLength(1)
      // only the active live card chapter survives time prune
      expect(result.sources[0].chapters).toHaveLength(1)
      expect(result.sources[0].chapters[0].chapterId).toBe("2")
      expect(result.sources[0].chapters[0].sequentialStatus).toBe("active")
    })
  })
})
