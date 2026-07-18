/**
 * 资料库数据、筛选、选择与标题加载
 */

import type { Block, DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import {
  buildIRQueue,
  collectAllIRCards,
  deferIROverflow
} from "../../../srs/incrementalReadingCollector"
import { completeIRCard } from "../../../srs/irSessionActions"
import {
  collectIRSourceOptions,
  collectIRStageOptions,
  createDefaultIRLibraryFilters,
  filterAndSortIRCards,
  hasActiveIRLibraryFilters,
  summarizeIRLibrary,
  summarizeTodayReadableIRCards,
  type IRLibraryFilters
} from "./irLibraryFilters"
import { getIncrementalReadingSettings } from "../../../srs/settings/incrementalReadingSettingsSchema"
import {
  buildIRSourceTree,
  type IRTimeNavKey,
  type SequentialBookTreeContext
} from "./irSourceTreeBuilder"
import { loadSequentialBookTreeContexts } from "./loadSequentialBookTreeContexts"
import { resolveBlockDisplayTitle } from "./resolveBlockDisplayTitle"

const { useCallback, useEffect, useMemo, useState } = window.React

function getDayStartTime(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function useIRWorkspaceLibrary(loadPluginName: () => Promise<string>, pluginName: string) {
  const [libraryCards, setLibraryCards] = useState<IRCard[]>([])
  const [sequentialBooks, setSequentialBooks] = useState<SequentialBookTreeContext[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [filters, setFilters] = useState<IRLibraryFilters>(() => createDefaultIRLibraryFilters())
  const [selectedCardIds, setSelectedCardIds] = useState<Set<DbId>>(new Set())
  const [titleMap, setTitleMap] = useState<Record<string, string>>({})
  const [detailsCardId, setDetailsCardId] = useState<DbId | null>(null)
  const [isBatchRemoving, setIsBatchRemoving] = useState(false)
  const [isDeferringOverflow, setIsDeferringOverflow] = useState(false)
  const [todayQueueInfo, setTodayQueueInfo] = useState({
    dailyLimit: 0,
    totalDueCount: 0,
    topicCount: 0,
    extractCount: 0,
    overflowCount: 0,
    actionEnabled: false
  })

  const [timeNavKey, setTimeNavKey] = useState<IRTimeNavKey>("all")
  const [expandedSourceIds, setExpandedSourceIds] = useState<Record<string, boolean>>({})
  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>({})

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const name = await loadPluginName()
      const cards = await collectAllIRCards(name)
      setLibraryCards(cards)

      // Plan-backed sequential outline (placeholders only; does not invent IR cards)
      try {
        const { contexts, warnings } = await loadSequentialBookTreeContexts(cards)
        setSequentialBooks(contexts)
        if (warnings.length > 0) {
          orca.notify(
            "warn",
            warnings.length === 1
              ? warnings[0]
              : `顺序阅读计划加载有 ${warnings.length} 个警告，详见控制台`,
            { title: "渐进阅读" }
          )
        }
      } catch (seqError) {
        console.error("[IR Workspace] 加载顺序书计划失败:", seqError)
        setSequentialBooks([])
        orca.notify("warn", "顺序阅读章节大纲加载失败，仅显示已激活卡片", {
          title: "渐进阅读"
        })
      }

      const settings = getIncrementalReadingSettings(name)
      const now = new Date()
      const todayStart = getDayStartTime(now)
      const dueCards = cards.filter(card => getDayStartTime(card.due) <= todayStart)
      const todayReadingSummary = summarizeTodayReadableIRCards(cards, now)
      const queue = await buildIRQueue(dueCards, {
        topicQuotaPercent: settings.topicQuotaPercent,
        dailyLimit: settings.dailyLimit,
        now
      })
      setTodayQueueInfo({
        dailyLimit: settings.dailyLimit,
        totalDueCount: todayReadingSummary.total,
        topicCount: todayReadingSummary.topics,
        extractCount: todayReadingSummary.extracts,
        overflowCount: settings.dailyLimit > 0 ? Math.max(0, dueCards.length - queue.length) : 0,
        actionEnabled: settings.enableAutoDefer
      })
    } catch (error) {
      console.error("[IR Workspace] 加载资料库失败:", error)
      const message = error instanceof Error ? error.message : String(error)
      setLibraryError(message)
      orca.notify("error", "加载渐进阅读资料库失败", { title: "渐进阅读" })
    } finally {
      setLibraryLoading(false)
    }
  }, [loadPluginName])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    let cancelled = false
    const loadTitles = async () => {
      // 每次资料库加载都刷新标题：页面改名后 alias 会变，不能因 titleMap 已有旧值而跳过
      const cardIds = libraryCards.map((card: IRCard) => card.id)
      const sequentialChapterIds = (sequentialBooks as SequentialBookTreeContext[]).flatMap(
        (book: SequentialBookTreeContext) => book.selectedChapterIds
      )
      const ids: DbId[] = Array.from(new Set([...cardIds, ...sequentialChapterIds]))
      if (ids.length === 0) return
      try {
        const next: Record<string, string> = {}
        // Seed manifest titles for sequential placeholders first
        for (const book of sequentialBooks as SequentialBookTreeContext[]) {
          if (!book.chapterTitles) continue
          for (const [id, title] of Object.entries(book.chapterTitles)) {
            if (typeof title === "string" && title.trim()) next[id] = title
          }
        }
        // 先用内存态块（alias > text）填充，避免等待后端时闪旧编号
        for (const id of ids) {
          const fromState = orca.state.blocks?.[id] as Block | undefined
          if (!fromState) continue
          const seeded = resolveBlockDisplayTitle(fromState, "")
          if (seeded) next[String(id)] = seeded
        }
        const BATCH = 200
        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH)
          const blocks = await orca.invokeBackend("get-blocks", batch) as Block[] | undefined
          const map = new Map<DbId, Block>()
          for (const block of blocks ?? []) {
            map.set(block.id, block)
          }
          for (const id of batch) {
            const resolved = resolveBlockDisplayTitle(map.get(id), "")
            if (resolved) {
              next[String(id)] = resolved
            } else if (!next[String(id)]) {
              next[String(id)] = "(无标题)"
            }
          }
        }
        if (cancelled) return
        setTitleMap((prev: Record<string, string>) => ({ ...prev, ...next }))
      } catch (error) {
        console.warn("[IR Workspace] 读取块标题失败:", error)
      }
    }
    void loadTitles()
    return () => { cancelled = true }
  }, [libraryCards, sequentialBooks])

  useEffect(() => {
    setSelectedCardIds((prev: Set<DbId>) => {
      const available = new Set(libraryCards.map((c: IRCard) => c.id))
      const next = new Set(Array.from(prev).filter((id: DbId) => available.has(id)))
      if (next.size !== prev.size) return next
      for (const id of prev) {
        if (!next.has(id)) return next
      }
      return prev
    })
  }, [libraryCards])

  const filteredCards = useMemo(
    () => filterAndSortIRCards(libraryCards, filters, { titleMap }),
    [libraryCards, filters, titleMap]
  )
  const summary = useMemo(
    () => summarizeIRLibrary(libraryCards, filteredCards),
    [libraryCards, filteredCards]
  )
  const sourceOptions = useMemo(() => collectIRSourceOptions(libraryCards), [libraryCards])
  const stages = useMemo(() => collectIRStageOptions(libraryCards), [libraryCards])
  const selectedCards = useMemo(
    () => libraryCards.filter((card: IRCard) => selectedCardIds.has(card.id)),
    [libraryCards, selectedCardIds]
  )
  const candidateBatchId = useMemo(() => {
    const ids = Array.from(new Set(
      selectedCards
        .map((c: IRCard) => c.batchId)
        .filter((id: string | null): id is string => Boolean(id))
    ))
    return ids.length === 1 ? ids[0] : null
  }, [selectedCards])
  const detailsCard = useMemo(
    () => libraryCards.find((c: IRCard) => c.id === detailsCardId) ?? null,
    [libraryCards, detailsCardId]
  )

  const sourceTreeResult = useMemo(() => {
    return buildIRSourceTree(libraryCards, filters, timeNavKey, {
      titleMap,
      sequentialBooks
    })
  }, [libraryCards, filters, timeNavKey, titleMap, sequentialBooks])

  const isSourceExpanded = useCallback((sourceId: string): boolean => {
    if (expandedSourceIds[sourceId] !== undefined) {
      return expandedSourceIds[sourceId]
    }
    // 筛选后只剩一个来源时，可以自动展开该来源
    if (sourceTreeResult.sources.length === 1 && (timeNavKey !== "all" || hasActiveIRLibraryFilters(filters))) {
      return true
    }
    return false
  }, [expandedSourceIds, sourceTreeResult.sources.length, timeNavKey, filters])

  const toggleSourceExpanded = useCallback((sourceId: string) => {
    setExpandedSourceIds((prev: Record<string, boolean>) => ({
      ...prev,
      [sourceId]: !isSourceExpanded(sourceId)
    }))
  }, [isSourceExpanded])

  const isChapterExpanded = useCallback((chapterId: string): boolean => {
    return Boolean(expandedChapterIds[chapterId])
  }, [expandedChapterIds])

  const toggleChapterExpanded = useCallback((chapterId: string) => {
    setExpandedChapterIds((prev: Record<string, boolean>) => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }))
  }, [])

  const handleBatchRemove = useCallback(async () => {
    if (selectedCards.length === 0 || isBatchRemoving) return
    setIsBatchRemoving(true)
    try {
      // Prefer shared book removal service when all selected cards share one source book
      const bookIds = Array.from(new Set(
        selectedCards
          .map((c: IRCard) => c.sourceBookId)
          .filter((id: DbId | null | undefined): id is DbId => typeof id === "number")
      ))
      let successCount = 0
      let failedCount = 0
      let succeededIds = new Set<DbId>()
      let sequentialPaused = false

      if (bookIds.length === 1) {
        const { removeChaptersFromIR } = await import(
          "../../../srs/book-ir/bookIRRemovalService"
        )
        const bookId = bookIds[0] as DbId
        const result = await removeChaptersFromIR(
          bookId,
          selectedCards.map((c: IRCard) => c.id),
          { pluginName, pauseSequenceIfActiveRemoved: true }
        )
        successCount = result.success.length
        failedCount = result.failed.length
        succeededIds = new Set(result.success)
        sequentialPaused = Boolean(result.sequentialPaused)
      } else {
        const results = await Promise.allSettled(
          selectedCards.map((card: IRCard) => completeIRCard(card.id, pluginName))
        )
        successCount = results.filter(
          (r: PromiseSettledResult<void>) => r.status === "fulfilled"
        ).length
        failedCount = results.length - successCount
        succeededIds = new Set(
          results.flatMap((result: PromiseSettledResult<void>, index: number) => result.status === "fulfilled"
            ? [selectedCards[index].id]
            : [])
        )
      }

      setSelectedCardIds((prev: Set<DbId>) => new Set(
        Array.from(prev).filter(id => !succeededIds.has(id))
      ))
      await loadLibrary()
      if (failedCount > 0) {
        orca.notify("warn", `已移出 ${successCount} 张，失败 ${failedCount} 张（可重试）`, { title: "渐进阅读" })
      } else if (sequentialPaused) {
        orca.notify(
          "success",
          `已移出 ${successCount} 张；顺序阅读已暂停（未自动解锁下一章）`,
          { title: "渐进阅读" }
        )
      } else {
        orca.notify("success", `已将 ${successCount} 张卡片移出渐进阅读`, { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Workspace] 批量移出失败:", error)
      orca.notify("error", "批量移出渐进阅读失败", { title: "渐进阅读" })
    } finally {
      setIsBatchRemoving(false)
    }
  }, [selectedCards, isBatchRemoving, pluginName, loadLibrary])

  /** 资料库按来源书整本移出（稳定 book id，非 batchId；共享确认摘要） */
  const handleRemoveSourceBook = useCallback(async (bookBlockId: DbId) => {
    try {
      const { confirmAndRemoveBookFromIR } = await import(
        "../../../srs/book-ir/bookIRRemovalConfirm"
      )
      const result = await confirmAndRemoveBookFromIR(bookBlockId, pluginName)
      if (result == null) return
      await loadLibrary()
      if (result.kind === "partial") {
        orca.notify(
          "warn",
          `移出成功 ${result.success.length}，失败 ${result.failed.length}`,
          { title: "渐进阅读" }
        )
      } else {
        orca.notify("success", result.message || "已整本移出", { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Workspace] 整本移出失败:", error)
      orca.notify("error", "整本移出失败", { title: "渐进阅读" })
    }
  }, [pluginName, loadLibrary])

  const handleDeferOverflow = useCallback(async () => {
    if (isDeferringOverflow) return
    setIsDeferringOverflow(true)
    try {
      const settings = getIncrementalReadingSettings(pluginName)
      const now = new Date()
      const todayStart = getDayStartTime(now)
      const dueCards = libraryCards.filter((card: IRCard) => getDayStartTime(card.due) <= todayStart)
      const queue = await buildIRQueue(dueCards, {
        topicQuotaPercent: settings.topicQuotaPercent,
        dailyLimit: settings.dailyLimit,
        now
      })
      const result = await deferIROverflow(dueCards, queue, { now })
      await loadLibrary()
      orca.notify(
        result.deferredCount > 0 ? "success" : "info",
        result.deferredCount > 0
          ? `已推后溢出 ${result.deferredCount} 张`
          : "当前没有需要推后的溢出卡片",
        { title: "渐进阅读" }
      )
    } catch (error) {
      console.error("[IR Workspace] 溢出推后失败:", error)
      orca.notify("error", "溢出推后失败", { title: "渐进阅读" })
    } finally {
      setIsDeferringOverflow(false)
    }
  }, [isDeferringOverflow, libraryCards, loadLibrary, pluginName])

  return {
    libraryCards,
    libraryLoading,
    libraryError,
    filters,
    setFilters,
    timeNavKey,
    setTimeNavKey,
    expandedSourceIds,
    setExpandedSourceIds,
    expandedChapterIds,
    setExpandedChapterIds,
    isSourceExpanded,
    toggleSourceExpanded,
    isChapterExpanded,
    toggleChapterExpanded,
    sourceTreeResult,
    selectedCardIds,
    setSelectedCardIds,
    titleMap,
    detailsCardId,
    setDetailsCardId,
    isBatchRemoving,
    isDeferringOverflow,
    todayQueueInfo,
    filteredCards,
    summary,
    sourceOptions,
    stages,
    selectedCards,
    candidateBatchId,
    detailsCard,
    loadLibrary,
    handleBatchRemove,
    handleRemoveSourceBook,
    handleDeferOverflow,
    clearFilters: () => {
      setFilters(createDefaultIRLibraryFilters())
      setTimeNavKey("all")
    }
  }
}
