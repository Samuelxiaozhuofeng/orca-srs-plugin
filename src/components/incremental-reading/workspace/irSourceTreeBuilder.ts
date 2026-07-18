/**
 * 渐进阅读资料库来源树构建与筛选、排序纯函数
 */

import type { DbId } from "../../../orca.d.ts"
import type { BookIRChapterOutcome } from "../../../importers/epub/types"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import {
  IR_WEB_SOURCE_ID,
  isIRWebSourceCard,
  matchesIRSourceFilter,
  type IRLibraryFilters
} from "./irLibraryFilters"
import { getIRDateGroup, type IRDateGroupKey } from "../../../srs/incrementalReadingManagerUtils"
import { priorityToTier } from "../../../srs/incremental-reading/irQueuePolicy"

export type IRTimeNavKey = "all" | "overdue" | "today" | "tomorrow" | "upcoming7" | "new" | "later"

export const IR_TIME_NAV_KEYS: IRTimeNavKey[] = [
  "all",
  "overdue",
  "today",
  "tomorrow",
  "upcoming7",
  "new",
  "later"
]

export const IR_TIME_NAV_LABELS: Record<IRTimeNavKey, string> = {
  all: "全部",
  overdue: "逾期",
  today: "今天",
  tomorrow: "明天",
  upcoming7: "未来 7 天",
  new: "新卡",
  later: "7 天后"
}

/** Sequential plan chapter display status (library outline only; not IR queue state). */
export type IRSequentialChapterStatus = "active" | "pending" | "completed" | "skipped"

/**
 * Plan-backed outline for sequential Book IR books.
 * Used only to render non-card placeholders; never invents IRCard / queue entries.
 */
export type SequentialBookTreeContext = {
  bookBlockId: DbId
  bookTitle?: string
  selectedChapterIds: DbId[]
  activeChapterId: DbId | null
  outcomes: Record<string, BookIRChapterOutcome>
  /** chapterId string → display title (manifest / block title) */
  chapterTitles?: Record<string, string>
}

export type IRExtractNode = {
  type: "extract"
  card: IRCard
  title: string
}

export type IRChapterNode = {
  type: "chapter"
  chapterId: string
  isFallback: boolean
  card: IRCard | null
  cardMatches: boolean
  title: string
  due: Date | null
  sortDue: Date | null
  stage: string
  priority: number
  extracts: IRExtractNode[]
  /**
   * Sequential Book IR outline status. Set for plan chapters (with or without a live card).
   * Null/undefined for non-sequential topics and fallback extract groups.
   */
  sequentialStatus?: IRSequentialChapterStatus | null
  /**
   * True when this node exists only as plan outline (no live Topic IR card).
   * Placeholders must not expose IR card actions or enter selection.
   */
  isSequentialPlaceholder?: boolean
  /** Index in plan.selectedChapterIds for stable sequential ordering. */
  sequentialOrder?: number
}

export type IRSourceType = "book" | "web" | "general" | "unassigned"

export type IRSourceStats = {
  totalChapterCount: number
  matchedChapterCount: number
  timeGroupCardCounts: Record<IRTimeNavKey, number>
  totalCardCount: number
  matchedCardCount: number
}

export type IRSourceNode = {
  type: "source"
  sourceType: IRSourceType
  sourceId: string
  title: string
  chapters: IRChapterNode[]
  stats: IRSourceStats
}

export type IRSourceTreeResult = {
  sources: IRSourceNode[]
  timeNavCounts: Record<IRTimeNavKey, number>
}

export function collectIRChapterMatchedCardIds(chapter: IRChapterNode): DbId[] {
  return [
    ...(chapter.card && chapter.cardMatches ? [chapter.card.id] : []),
    ...chapter.extracts.map(extract => extract.card.id)
  ]
}

export function collectIRSourceMatchedCardIds(source: IRSourceNode): DbId[] {
  return source.chapters.flatMap(collectIRChapterMatchedCardIds)
}

/**
 * 将卡片映射为互斥时间带 Key
 * 互斥规则与 getIRDateGroup 一致：新卡优先，其余由 diffDays 分组
 * 未来 7 天 (diffDays in 2..7) 绝不包含今天和明天
 */
export function getCardTimeNavKey(card: IRCard, now: Date = new Date()): IRTimeNavKey {
  const group = getIRDateGroup(card, now)
  switch (group) {
    case "已逾期":
      return "overdue"
    case "今天":
      return "today"
    case "明天":
      return "tomorrow"
    case "未来7天":
      return "upcoming7"
    case "新卡":
      return "new"
    case "7天后":
    default:
      return "later"
  }
}

/**
 * 获取卡片的来源分类及 ID
 */
export function getCardSourceInfo(
  card: IRCard,
  topicsById: Map<string, IRCard> = new Map(),
  titleMap?: Record<string, string>
): {
  sourceType: IRSourceType
  sourceId: string
  sourceTitle: string
} {
  if (card.sourceBookId != null && String(card.sourceBookId).trim() !== "") {
    const idStr = String(card.sourceBookId).trim()
    return {
      sourceType: "book",
      sourceId: idStr,
      sourceTitle: card.sourceBookTitle?.trim() || `书籍 #${idStr}`
    }
  }

  const parentTopic = card.cardType === "extracts" && card.sourceTopicId != null
    ? topicsById.get(String(card.sourceTopicId))
    : null
  if (parentTopic?.sourceBookId != null) {
    const idStr = String(parentTopic.sourceBookId)
    return {
      sourceType: "book",
      sourceId: idStr,
      sourceTitle: parentTopic.sourceBookTitle?.trim() || `书籍 #${idStr}`
    }
  }

  if (isIRWebSourceCard(card, topicsById)) {
    return {
      sourceType: "web",
      sourceId: IR_WEB_SOURCE_ID,
      sourceTitle: "网页"
    }
  }

  const sourceTopic = card.cardType === "topic" ? card : parentTopic
  if (sourceTopic) {
    const topicId = String(sourceTopic.id)
    return {
      sourceType: "general",
      sourceId: `topic:${topicId}`,
      sourceTitle: getCardTitle(sourceTopic.id, titleMap)
    }
  }

  return {
    sourceType: "unassigned",
    sourceId: "unassigned",
    sourceTitle: "未归入来源"
  }
}

/**
 * 校验单卡是否通过高级筛选（除时间区间过滤外）
 */
function matchesNonTimeFilters(
  card: IRCard,
  filters: IRLibraryFilters,
  topicsById: Map<string, IRCard>,
  titleMap?: Record<string, string>
): boolean {
  const query = filters.query.trim().toLowerCase()
  if (query) {
    const title = (titleMap?.[String(card.id)] ?? "").toLowerCase()
    const parentTopic = card.cardType === "extracts" && card.sourceTopicId != null
      ? topicsById.get(String(card.sourceTopicId))
      : null
    const book = (card.sourceBookTitle ?? parentTopic?.sourceBookTitle ?? "").toLowerCase()
    const webSite = (card.sourceWebSiteName ?? parentTopic?.sourceWebSiteName ?? "").toLowerCase()
    const webUrl = (card.sourceWebUrl ?? parentTopic?.sourceWebUrl ?? "").toLowerCase()
    const stage = (card.stage ?? "").toLowerCase()
    const type = card.cardType.toLowerCase()
    const batch = (card.batchId ?? "").toLowerCase()
    const idStr = String(card.id)
    if (
      !title.includes(query) &&
      !book.includes(query) &&
      !webSite.includes(query) &&
      !webUrl.includes(query) &&
      !(isIRWebSourceCard(card, topicsById) && "网页".includes(query)) &&
      !stage.includes(query) &&
      !type.includes(query) &&
      !batch.includes(query) &&
      !idStr.includes(query)
    ) {
      return false
    }
  }

  if (filters.cardType !== "all" && card.cardType !== filters.cardType) {
    return false
  }

  if (!matchesIRSourceFilter(card, filters.sourceBook, topicsById)) {
    return false
  }

  if (filters.stage !== "all" && card.stage !== filters.stage) {
    return false
  }

  if (filters.importance !== "all" && priorityToTier(card.priority) !== filters.importance) {
    return false
  }

  return true
}

/**
 * 判断单卡是否同时通过时间导航条件和原有 dueStatus 筛选
 */
function matchesTimeFilter(card: IRCard, timeNavKey: IRTimeNavKey, now: Date): boolean {
  if (timeNavKey !== "all") {
    const cardKey = getCardTimeNavKey(card, now)
    if (cardKey !== timeNavKey) return false
  }
  return true
}

function getCardTitle(cardId: DbId, titleMap?: Record<string, string>): string {
  if (titleMap && titleMap[String(cardId)]) {
    return titleMap[String(cardId)]
  }
  return `(#${cardId})`
}

/**
 * Resolve sequential outline status for a plan chapter.
 * activeChapterId wins over stale outcomes when they disagree.
 */
export function resolveSequentialChapterStatus(
  chapterId: DbId,
  plan: Pick<SequentialBookTreeContext, "activeChapterId" | "outcomes">
): IRSequentialChapterStatus | null {
  const key = String(chapterId)
  const outcome = plan.outcomes[key]
  if (outcome === "removed") return null
  if (plan.activeChapterId != null && String(plan.activeChapterId) === key) {
    return "active"
  }
  if (outcome === "completed") return "completed"
  if (outcome === "skipped") return "skipped"
  if (outcome === "active") return "active"
  // pending or missing outcome in selected plan
  return "pending"
}

/**
 * Whether a pure sequential placeholder (no live topic card) should survive prune.
 * Default "全部" view keeps the full outline; advanced time/type/stage filters only
 * keep placeholders that still have matched extracts or a matching title query.
 */
function shouldKeepSequentialPlaceholder(
  chapter: IRChapterNode,
  filters: IRLibraryFilters,
  timeNavKey: IRTimeNavKey,
  sourceId: string,
  sourceType: IRSourceType
): boolean {
  if (!chapter.isSequentialPlaceholder || !chapter.sequentialStatus) return false

  // Time nav other than "all" is about real due cards — hide pure placeholders.
  if (timeNavKey !== "all") return false

  // Respect source filter (placeholders have no IRCard to pass matchesIRSourceFilter).
  if (filters.sourceBook !== "all") {
    if (filters.sourceBook === IR_WEB_SOURCE_ID) return false
    if (filters.sourceBook === "none") return false
    if (sourceType !== "book" || sourceId !== filters.sourceBook) return false
  }

  // Attribute filters apply only to live cards.
  if (filters.cardType !== "all") return false
  if (filters.stage !== "all") return false
  if (filters.importance !== "all") return false
  // dueStatus is not used by the tree time path; timeNavKey covers it.

  const query = filters.query.trim().toLowerCase()
  if (query) {
    return chapter.title.toLowerCase().includes(query) || chapter.chapterId.includes(query)
  }

  return true
}

function resolveChapterTitle(
  chapterId: string,
  titleMap: Record<string, string> | undefined,
  sequentialTitles: Record<string, string> | undefined
): string {
  if (titleMap?.[chapterId]) return titleMap[chapterId]
  if (sequentialTitles?.[chapterId]) return sequentialTitles[chapterId]
  return `(#${chapterId})`
}

/**
 * 构建完整的稳定来源树并实施自下而上的剪枝及排序
 */
export function buildIRSourceTree(
  cards: IRCard[],
  filters: IRLibraryFilters,
  timeNavKey: IRTimeNavKey = "all",
  options: {
    now?: Date
    titleMap?: Record<string, string>
    sequentialBooks?: SequentialBookTreeContext[]
  } = {}
): IRSourceTreeResult {
  const now = options.now ?? new Date()
  const titleMap = options.titleMap
  const sequentialByBookId = new Map(
    (options.sequentialBooks ?? []).map(ctx => [String(ctx.bookBlockId), ctx] as const)
  )
  const topicsById = new Map(
    cards
      .filter(card => card.cardType === "topic")
      .map(card => [String(card.id), card] as const)
  )

  // 1) 先根据卡片来源归组（不提前基于 advanced filter 丢弃章节卡，以保障摘录能够找到并挂载到正确父章节）
  const sourceGroupMap = new Map<string, {
    sourceType: IRSourceType
    sourceId: string
    sourceTitle: string
    topics: IRCard[]
    extracts: IRCard[]
  }>()

  for (const card of cards) {
    const { sourceType, sourceId, sourceTitle } = getCardSourceInfo(card, topicsById, titleMap)
    let group = sourceGroupMap.get(sourceId)
    if (!group) {
      group = { sourceType, sourceId, sourceTitle, topics: [], extracts: [] }
      sourceGroupMap.set(sourceId, group)
    } else if (group.sourceTitle.startsWith("书籍 #") && !sourceTitle.startsWith("书籍 #")) {
      group.sourceTitle = sourceTitle
    }
    if (card.cardType === "topic") {
      group.topics.push(card)
    } else {
      group.extracts.push(card)
    }
  }

  // Sequential outline: create source groups even when the book has zero live IR cards
  // (completed / paused / recovery). Placeholders remain UI-only (card: null).
  // Upgrade book titles from plan context when cards only have "书籍 #id".
  for (const [bookId, seqCtx] of sequentialByBookId) {
    let group = sourceGroupMap.get(bookId)
    if (!group) {
      group = {
        sourceType: "book",
        sourceId: bookId,
        sourceTitle: seqCtx.bookTitle?.trim() || `书籍 #${bookId}`,
        topics: [],
        extracts: []
      }
      sourceGroupMap.set(bookId, group)
      continue
    }
    if (seqCtx.bookTitle?.trim() && group.sourceTitle.startsWith("书籍 #")) {
      group.sourceTitle = seqCtx.bookTitle.trim()
    }
  }

  // 2) 统计在通过非时间过滤的候选卡片中的时间带分布数量
  const timeNavCounts: Record<IRTimeNavKey, number> = {
    all: 0,
    overdue: 0,
    today: 0,
    tomorrow: 0,
    upcoming7: 0,
    new: 0,
    later: 0
  }

  for (const card of cards) {
    if (matchesNonTimeFilters(card, filters, topicsById, titleMap)) {
      timeNavCounts.all += 1
      const key = getCardTimeNavKey(card, now)
      timeNavCounts[key] = (timeNavCounts[key] ?? 0) + 1
    }
  }

  const sources: IRSourceNode[] = []

  // 3) 为每个来源构建完整树并进行自下而上的裁剪 (Bottom-up Pruning)
  for (const group of sourceGroupMap.values()) {
    const chapterMap = new Map<string, IRChapterNode>()
    const sequentialCtx =
      group.sourceType === "book" ? sequentialByBookId.get(group.sourceId) : undefined
    const sequentialOrder = new Map<string, number>()
    if (sequentialCtx) {
      sequentialCtx.selectedChapterIds.forEach((id, index) => {
        sequentialOrder.set(String(id), index)
      })
    }

    // 创建普通真实主题卡章节
    for (const topicCard of group.topics) {
      const chapterId = String(topicCard.id)
      const sequentialStatus = sequentialCtx
        ? resolveSequentialChapterStatus(topicCard.id, sequentialCtx)
        : null
      chapterMap.set(chapterId, {
        type: "chapter",
        chapterId,
        isFallback: false,
        card: topicCard,
        cardMatches: false,
        title: getCardTitle(topicCard.id, titleMap),
        due: topicCard.due,
        sortDue: topicCard.due,
        stage: topicCard.stage || "topic.preview",
        priority: topicCard.priority,
        extracts: [],
        sequentialStatus,
        isSequentialPlaceholder: false,
        sequentialOrder: sequentialOrder.get(chapterId)
      })
    }

    // 顺序计划占位：为 selectedChapterIds 中尚无真实 Topic IR 的章节创建大纲节点
    if (sequentialCtx) {
      for (const chapterDbId of sequentialCtx.selectedChapterIds) {
        const chapterId = String(chapterDbId)
        const sequentialStatus = resolveSequentialChapterStatus(chapterDbId, sequentialCtx)
        if (sequentialStatus == null) continue // removed

        const existing = chapterMap.get(chapterId)
        if (existing) {
          // Live card already present — annotate plan status only
          existing.sequentialStatus = sequentialStatus
          existing.sequentialOrder = sequentialOrder.get(chapterId)
          if (!titleMap?.[chapterId] && sequentialCtx.chapterTitles?.[chapterId]) {
            existing.title = sequentialCtx.chapterTitles[chapterId]
          }
          continue
        }

        chapterMap.set(chapterId, {
          type: "chapter",
          chapterId,
          isFallback: false,
          card: null,
          cardMatches: false,
          title: resolveChapterTitle(chapterId, titleMap, sequentialCtx.chapterTitles),
          due: null,
          sortDue: null,
          stage: "",
          priority: 0,
          extracts: [],
          sequentialStatus,
          isSequentialPlaceholder: true,
          sequentialOrder: sequentialOrder.get(chapterId)
        })
      }
    }

    const unassignedExtracts: IRCard[] = []

    // 摘录归入真实章节或记录到孤立列表（含顺序占位章节：完成后若仍有摘录可挂回）
    for (const extractCard of group.extracts) {
      const parentTopicId = extractCard.sourceTopicId != null ? String(extractCard.sourceTopicId) : null
      if (parentTopicId && chapterMap.has(parentTopicId)) {
        const parentChapter = chapterMap.get(parentTopicId)!
        parentChapter.extracts.push({
          type: "extract",
          card: extractCard,
          title: getCardTitle(extractCard.id, titleMap)
        })
      } else {
        unassignedExtracts.push(extractCard)
      }
    }

    // 若存在未能归到具体章节的摘录，创建该来源下的稳定兜底章节
    if (unassignedExtracts.length > 0) {
      const fallbackId = `unassigned-extracts-${group.sourceId}`
      const minDue = unassignedExtracts.reduce<Date | null>((acc, cur) => {
        if (!acc) return cur.due
        return cur.due.getTime() < acc.getTime() ? cur.due : acc
      }, null)
      const maxPriority = unassignedExtracts.reduce<number>((acc, cur) => {
        return Math.max(acc, cur.priority)
      }, 0)

      chapterMap.set(fallbackId, {
        type: "chapter",
        chapterId: fallbackId,
        isFallback: true,
        card: null,
        cardMatches: false,
        title: "未关联章节的摘录",
        due: minDue,
        sortDue: minDue,
        stage: "extract.raw",
        priority: maxPriority,
        extracts: unassignedExtracts.map(card => ({
          type: "extract",
          card,
          title: getCardTitle(card.id, titleMap)
        }))
      })
    }

    // 4) 实施自下而上的所有筛选条件裁剪 (Pruning)
    const allChapters = Array.from(chapterMap.values())
    const prunedChapters: IRChapterNode[] = []
    const sourceTimeGroupCounts: Record<IRTimeNavKey, number> = {
      all: 0,
      overdue: 0,
      today: 0,
      tomorrow: 0,
      upcoming7: 0,
      new: 0,
      later: 0
    }

    let totalCardCountInSource = 0
    let matchedCardCountInSource = 0

    // 计算该来源在所有真实卡片上的统计（基于满足 matchesNonTimeFilters 的卡片算作该来源时间负载统计）
    // 顺序占位章节不计入卡片/时间统计
    for (const chapter of allChapters) {
      if (!chapter.isFallback && chapter.card) {
        totalCardCountInSource += 1
        if (matchesNonTimeFilters(chapter.card, filters, topicsById, titleMap)) {
          sourceTimeGroupCounts.all += 1
          const k = getCardTimeNavKey(chapter.card, now)
          sourceTimeGroupCounts[k] = (sourceTimeGroupCounts[k] ?? 0) + 1
        }
      }
      for (const extractNode of chapter.extracts) {
        totalCardCountInSource += 1
        if (matchesNonTimeFilters(extractNode.card, filters, topicsById, titleMap)) {
          sourceTimeGroupCounts.all += 1
          const k = getCardTimeNavKey(extractNode.card, now)
          sourceTimeGroupCounts[k] = (sourceTimeGroupCounts[k] ?? 0) + 1
        }
      }
    }

    // 自底向上判断保留条件
    for (const chapter of allChapters) {
      const chapterCardMatches = !chapter.isFallback && chapter.card
        ? matchesNonTimeFilters(chapter.card, filters, topicsById, titleMap) && matchesTimeFilter(chapter.card, timeNavKey, now)
        : false

      const matchedExtracts: IRExtractNode[] = []
      for (const extractNode of chapter.extracts) {
        if (
          matchesNonTimeFilters(extractNode.card, filters, topicsById, titleMap) &&
          matchesTimeFilter(extractNode.card, timeNavKey, now)
        ) {
          matchedExtracts.push(extractNode)
        }
      }

      const keepPlaceholder =
        !chapterCardMatches &&
        matchedExtracts.length === 0 &&
        shouldKeepSequentialPlaceholder(
          chapter,
          filters,
          timeNavKey,
          group.sourceId,
          group.sourceType
        )

      // 章节自身命中、摘录命中、或默认视图下的顺序占位 → 保留
      if (chapterCardMatches || matchedExtracts.length > 0 || keepPlaceholder) {
        matchedExtracts.sort((a, b) => {
          const diff = a.card.due.getTime() - b.card.due.getTime()
          if (diff !== 0) return diff
          return Number(a.card.id) - Number(b.card.id)
        })

        if (chapterCardMatches && chapter.card) {
          matchedCardCountInSource += 1
        }
        matchedCardCountInSource += matchedExtracts.length

        // 如果章节有保留卡片，将其到期日等特征调整为当前最迫切保留项的特征
        const earliestExtractDue = matchedExtracts[0]?.card?.due
        const sortDue = chapterCardMatches
          ? (chapter.card?.due && earliestExtractDue
              ? (chapter.card.due.getTime() < earliestExtractDue.getTime() ? chapter.card.due : earliestExtractDue)
              : chapter.card?.due ?? earliestExtractDue ?? null)
          : (earliestExtractDue ?? chapter.due)

        prunedChapters.push({
          ...chapter,
          cardMatches: Boolean(chapterCardMatches),
          sortDue,
          extracts: matchedExtracts,
          // 占位节点在仅靠 outline 保留时仍标记为占位
          isSequentialPlaceholder: chapter.isSequentialPlaceholder === true && !chapter.card
        })
      }
    }

    if (prunedChapters.length > 0) {
      if (sequentialCtx) {
        // 顺序书：按 plan.selectedChapterIds 稳定排序；兜底摘录章放末尾
        prunedChapters.sort((a, b) => {
          if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1
          const orderA = a.sequentialOrder ?? Number.MAX_SAFE_INTEGER
          const orderB = b.sequentialOrder ?? Number.MAX_SAFE_INTEGER
          if (orderA !== orderB) return orderA - orderB
          return a.chapterId.localeCompare(b.chapterId)
        })
      } else {
        prunedChapters.sort((a, b) => {
          const timeA = a.sortDue ? a.sortDue.getTime() : Number.MAX_SAFE_INTEGER
          const timeB = b.sortDue ? b.sortDue.getTime() : Number.MAX_SAFE_INTEGER
          const diff = timeA - timeB
          if (diff !== 0) return diff

          const titleDiff = a.title.localeCompare(b.title, "zh")
          if (titleDiff !== 0) return titleDiff

          return a.chapterId.localeCompare(b.chapterId)
        })
      }

      const plannedChapterCount = sequentialCtx
        ? sequentialCtx.selectedChapterIds.filter(
            id => resolveSequentialChapterStatus(id, sequentialCtx) != null
          ).length
        : group.topics.length

      sources.push({
        type: "source",
        sourceType: group.sourceType,
        sourceId: group.sourceId,
        title: group.sourceTitle,
        chapters: prunedChapters,
        stats: {
          totalChapterCount: plannedChapterCount,
          matchedChapterCount: prunedChapters.filter(chapter => !chapter.isFallback).length,
          timeGroupCardCounts: sourceTimeGroupCounts,
          totalCardCount: totalCardCountInSource,
          matchedCardCount: matchedCardCountInSource
        }
      })
    }
  }

  // 5) 来源固定排序规则：
  // 逾期优先 -> 今天优先 -> 其余按最近到期时间 -> 名称字典序
  sources.sort((a, b) => {
    const hasOverdueA = (a.stats.timeGroupCardCounts.overdue ?? 0) > 0
    const hasOverdueB = (b.stats.timeGroupCardCounts.overdue ?? 0) > 0
    if (hasOverdueA && !hasOverdueB) return -1
    if (!hasOverdueA && hasOverdueB) return 1

    const hasTodayA = (a.stats.timeGroupCardCounts.today ?? 0) > 0
    const hasTodayB = (b.stats.timeGroupCardCounts.today ?? 0) > 0
    if (hasTodayA && !hasTodayB) return -1
    if (!hasTodayA && hasTodayB) return 1

    const minDueA = a.chapters[0]?.sortDue?.getTime() ?? Number.MAX_SAFE_INTEGER
    const minDueB = b.chapters[0]?.sortDue?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (minDueA !== minDueB) {
      return minDueA - minDueB
    }

    const titleDiff = a.title.localeCompare(b.title, "zh")
    if (titleDiff !== 0) return titleDiff

    return a.sourceId.localeCompare(b.sourceId)
  })

  return {
    sources,
    timeNavCounts
  }
}
