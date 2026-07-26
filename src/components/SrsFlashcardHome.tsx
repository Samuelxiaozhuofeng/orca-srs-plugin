/** 今日学习主页：统一摘要、可恢复入口、卡组与困难卡次级区。 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats, SrsState } from "../srs/types"
import type { FilterType } from "../srs/cardFilterUtils"
import { filterCards } from "../srs/cardFilterUtils"
import { SRS_EVENTS } from "../srs/srsEvents"
import {
  invalidateFlashHomeDataCache,
  loadFlashHomeData
} from "../srs/flashHomeDataLoader"
import {
  invalidateTodayLearningSummaryCache,
  loadTodayLearningSummaryCached,
  type TodayLearningSummary
} from "../srs/todayLearning/todayLearningSummary"
import {
  loadTodayLearningResume,
  resumeMarkerHasTrustedTasks,
  type TodayLearningResumeMarker,
  type TodayLearningTimeBudget
} from "../srs/todayLearning/todayLearningResumeStorage"
import FlashHomePage from "./flashcard-home/FlashHomePage"
import CardListView from "./flashcard-home/CardListView"
import DifficultCardsView from "./DifficultCardsView"
import type { HomeStatKind } from "./flashcard-home/homeStatNav"
import {
  GLOBAL_DECK_SCOPE,
  homeStatToFilter,
  isGlobalDeckScope
} from "./flashcard-home/homeStatNav"

const { useState, useEffect, useCallback, useMemo, useRef } = window.React
const { Button } = orca.components

type ViewMode = "home" | "card-list" | "difficult-cards"

type SrsFlashcardHomeProps = {
  panelId: string
  pluginName: string
  onClose?: () => void
}

async function mergeDeckNotes(
  pluginName: string,
  stats: DeckStats
): Promise<DeckStats> {
  const { getAllDeckNotes } = await import("../srs/deckNoteManager")
  const deckNotes = await getAllDeckNotes(pluginName)
  return {
    ...stats,
    decks: stats.decks.map((deck: DeckInfo) => ({
      ...deck,
      note: deckNotes[deck.name] || ""
    }))
  }
}

export default function SrsFlashcardHome({ panelId, pluginName, onClose }: SrsFlashcardHomeProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("home")
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null)
  const [allCards, setAllCards] = useState<ReviewCard[]>([])
  const [deckStats, setDeckStats] = useState<DeckStats>({
    decks: [],
    totalCards: 0,
    totalNew: 0,
    totalOverdue: 0
  })
  const [todayStats, setTodayStats] = useState<TodayStats>({
    pendingCount: 0,
    todayCount: 0,
    newCount: 0,
    totalCount: 0
  })
  const [todayLearning, setTodayLearning] = useState<TodayLearningSummary | null>(null)
  const [todayLearningLoading, setTodayLearningLoading] = useState(true)
  const [resumeMarker, setResumeMarker] = useState<TodayLearningResumeMarker | null>(null)
  const [resumeLoadError, setResumeLoadError] = useState<string | null>(null)
  const [resumeActionError, setResumeActionError] = useState<string | null>(null)
  const [selectedMinutes, setSelectedMinutes] = useState<TodayLearningTimeBudget>(20)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentFilter, setCurrentFilter] = useState<FilterType>("all")
  const [actionBusy, setActionBusy] = useState(false)
  const actionBusyRef = useRef(false)

  const loadResume = useCallback(async () => {
    try {
      const result = await loadTodayLearningResume({ pluginName })
      if (result.status === "ok") {
        setResumeMarker(result.marker)
        setResumeLoadError(null)
        if (result.marker.kind === "ir") {
          setSelectedMinutes(result.marker.timeBudgetMinutes)
        }
      } else if (result.status === "stale" || result.status === "absent") {
        setResumeMarker(null)
        setResumeLoadError(null)
      } else {
        setResumeMarker(null)
        setResumeLoadError(result.error.message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[${pluginName}] 读取今日学习 resume 失败:`, error)
      setResumeMarker(null)
      setResumeLoadError(message)
    }
  }, [pluginName])

  const loadTodayLearning = useCallback(
    async (force: boolean) => {
      setTodayLearningLoading(true)
      try {
        if (force) invalidateTodayLearningSummaryCache()
        const summary = await loadTodayLearningSummaryCached(pluginName, {
          force
        })
        setTodayLearning(summary)
      } catch (error) {
        console.error(`[${pluginName}] 加载今日学习摘要失败:`, error)
        const message = error instanceof Error ? error.message : String(error)
        setTodayLearning({
          loadStatus: "error",
          srsRemaining: null,
          irRemaining: null,
          remainingTotal: null,
          estimatedMinutes: null,
          srsCompleted: null,
          irReadingCompleted: null,
          completedUnified: null,
          srsCostSeconds: null,
          irCostSeconds: null,
          recommendation: "暂时无法读取今日学习，请重试。",
          errorMessage: message,
          warnings: Object.freeze([message]),
          dateKey: "",
          fetchedAt: Date.now()
        })
      } finally {
        setTodayLearningLoading(false)
      }
    },
    [pluginName]
  )

  const applyLoaded = useCallback(
    async (force: boolean, showSpinner: boolean) => {
      if (showSpinner) {
        setIsLoading(true)
        setErrorMessage(null)
      }
      try {
        const data = await loadFlashHomeData({ pluginName, force })
        setAllCards(data.cards)
        setTodayStats(data.todayStats)
        setDeckStats(await mergeDeckNotes(pluginName, data.deckStats))
        // 首页 mount / 强制刷新：绕过 45s 缓存拉今日剩余
        await loadTodayLearning(true)
        await loadResume()
      } catch (error) {
        console.error(`[${pluginName}] 今日学习主页加载数据失败:`, error)
        if (showSpinner) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (showSpinner) setIsLoading(false)
      }
    },
    [pluginName, loadTodayLearning, loadResume]
  )

  const loadData = useCallback(async () => {
    invalidateFlashHomeDataCache()
    invalidateTodayLearningSummaryCache()
    await applyLoaded(true, true)
  }, [applyLoaded])

  useEffect(() => {
    void applyLoaded(false, true)
  }, [applyLoaded])

  // 120s 兜底：强制刷新
  useEffect(() => {
    const autoRefresh = async () => {
      try {
        const data = await loadFlashHomeData({ pluginName, force: true })
        setAllCards(data.cards)
        setTodayStats(data.todayStats)
        setDeckStats(await mergeDeckNotes(pluginName, data.deckStats))
        await loadTodayLearning(true)
        await loadResume()
      } catch (error) {
        console.warn(`[${pluginName}] 今日学习自动刷新失败:`, error)
      }
    }
    const interval = setInterval(autoRefresh, 120000)
    return () => clearInterval(interval)
  }, [pluginName, loadTodayLearning, loadResume])

  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  const handlersRef = useRef<{
    graded: ((data: unknown) => void) | null
    postponed: ((data: unknown) => void) | null
    suspended: ((data: unknown) => void) | null
  }>({ graded: null, postponed: null, suspended: null })

  useEffect(() => {
    const silentReload = () => {
      invalidateFlashHomeDataCache()
      invalidateTodayLearningSummaryCache()
      void loadDataRef.current()
    }
    const handleCardGraded = () => {
      console.log(`[${pluginName}] 今日学习: 收到 CARD_GRADED，刷新`)
      silentReload()
    }
    const handleCardPostponed = () => {
      console.log(`[${pluginName}] 今日学习: 收到 CARD_POSTPONED，刷新`)
      silentReload()
    }
    const handleCardSuspended = () => {
      console.log(`[${pluginName}] 今日学习: 收到 CARD_SUSPENDED，刷新`)
      silentReload()
    }

    handlersRef.current = {
      graded: handleCardGraded,
      postponed: handleCardPostponed,
      suspended: handleCardSuspended
    }

    if (!orca.broadcasts.isHandlerRegistered(SRS_EVENTS.CARD_GRADED)) {
      orca.broadcasts.registerHandler(SRS_EVENTS.CARD_GRADED, handleCardGraded)
    }
    if (!orca.broadcasts.isHandlerRegistered(SRS_EVENTS.CARD_POSTPONED)) {
      orca.broadcasts.registerHandler(SRS_EVENTS.CARD_POSTPONED, handleCardPostponed)
    }
    if (!orca.broadcasts.isHandlerRegistered(SRS_EVENTS.CARD_SUSPENDED)) {
      orca.broadcasts.registerHandler(SRS_EVENTS.CARD_SUSPENDED, handleCardSuspended)
    }

    return () => {
      const handlers = handlersRef.current
      if (handlers.graded) {
        orca.broadcasts.unregisterHandler(SRS_EVENTS.CARD_GRADED, handlers.graded)
      }
      if (handlers.postponed) {
        orca.broadcasts.unregisterHandler(SRS_EVENTS.CARD_POSTPONED, handlers.postponed)
      }
      if (handlers.suspended) {
        orca.broadcasts.unregisterHandler(SRS_EVENTS.CARD_SUSPENDED, handlers.suspended)
      }
    }
  }, [pluginName])

  const deckCards = useMemo(() => {
    if (!selectedDeck) return []
    if (isGlobalDeckScope(selectedDeck)) return allCards
    return allCards.filter((card: ReviewCard) => card.deck === selectedDeck)
  }, [allCards, selectedDeck])

  const filteredCards = useMemo(() => {
    return filterCards(deckCards, currentFilter)
  }, [deckCards, currentFilter])

  // 仅精确 ok 侧数字可启动；partial lower-bound 不可信
  const trustedIrRemaining = todayLearning?.irRemaining
  const trustedSrsRemaining = todayLearning?.srsRemaining
  const hasTrustedTasks =
    (trustedIrRemaining != null && trustedIrRemaining > 0) ||
    (trustedSrsRemaining != null && trustedSrsRemaining > 0)
  const resumeHasTrustedTasks = resumeMarkerHasTrustedTasks(resumeMarker, {
    srs: trustedSrsRemaining,
    ir: trustedIrRemaining
  })

  const canContinue =
    resumeMarker != null &&
    resumeHasTrustedTasks &&
    resumeLoadError == null &&
    resumeActionError == null

  const canStart = hasTrustedTasks

  const startFreshLearning = useCallback(async () => {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    setResumeActionError(null)
    try {
      const irRem = todayLearning?.irRemaining
      const srsRem = todayLearning?.srsRemaining

      // 优先启动精确可读的 IR；否则精确 SRS；禁止用 partial 假数字
      if (irRem != null && irRem > 0) {
        const { openIRWorkspace } = await import(
          "../srs/incremental-reading/irWorkspacePanelLaunch"
        )
        // 不预写 resume；autoStart 成功处理时再写
        await openIRWorkspace({
          pluginName,
          mode: "reading",
          autoStart: true,
          timeBudgetMinutes: selectedMinutes,
          sessionLaunchMode: "mixed"
        })
        return
      }

      if (srsRem != null && srsRem > 0) {
        const { startReviewSession } = await import("../main")
        await startReviewSession()
        return
      }

      orca.notify("info", "今天已完成，没有可开始的内容", { title: "今日学习" })
    } catch (error) {
      console.error(`[${pluginName}] 开始今日学习失败:`, error)
      const message = error instanceof Error ? error.message : String(error)
      setResumeActionError(message)
      orca.notify("error", `开始失败：${message}`, { title: "今日学习" })
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
      void loadResume()
      void loadTodayLearning(true)
    }
  }, [
    pluginName,
    selectedMinutes,
    todayLearning,
    loadResume,
    loadTodayLearning
  ])

  const continueLearning = useCallback(async () => {
    if (actionBusyRef.current) return
    if (!resumeMarker) {
      setResumeActionError("没有可继续的恢复点")
      return
    }
    actionBusyRef.current = true
    setActionBusy(true)
    setResumeActionError(null)
    try {
      if (resumeMarker.kind === "srs") {
        const { resolveReviewSessionBlock } = await import(
          "../srs/reviewSessionManager"
        )
        const { readReviewSessionDescriptorFromBlock } = await import(
          "../srs/reviewSessionDescriptor"
        )
        const {
          assertResumeSessionIdMatches
        } = await import("../srs/todayLearning/todayLearningResumeStorage")
        const blockId = resumeMarker.sessionBlockId as DbId
        let block: unknown
        try {
          block = await resolveReviewSessionBlock(blockId)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          throw new Error(`上次复习会话块不可用：${message}`)
        }
        if (!block) {
          throw new Error("上次复习会话块不存在")
        }
        let descriptor
        try {
          descriptor = readReviewSessionDescriptorFromBlock(block)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          throw new Error(`上次复习会话描述不可读：${message}`)
        }
        if (descriptor.kind !== "normal") {
          throw new Error(
            `上次会话类型为 ${descriptor.kind}，今日学习不支持从该类型继续（请开始新会话）`
          )
        }
        const idMatch = assertResumeSessionIdMatches(
          resumeMarker.sessionId,
          descriptor.sessionId
        )
        if (!idMatch.ok) {
          throw idMatch.error
        }
        orca.nav.openInLastPanel("block", { blockId })
        orca.notify("success", "已回到上次复习", { title: "今日学习" })
        return
      }

      // ir / mixed：autoStart 时再写 resume
      const { openIRWorkspace } = await import(
        "../srs/incremental-reading/irWorkspacePanelLaunch"
      )
      await openIRWorkspace({
        pluginName,
        mode: "reading",
        autoStart: true,
        timeBudgetMinutes: resumeMarker.timeBudgetMinutes,
        sessionLaunchMode: "mixed"
      })
    } catch (error) {
      console.error(`[${pluginName}] 继续今日学习失败:`, error)
      const message = error instanceof Error ? error.message : String(error)
      setResumeActionError(message)
      orca.notify("error", `无法继续上次学习：${message}`, { title: "今日学习" })
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }, [resumeMarker, pluginName])

  const handleRetryResumeLoad = useCallback(() => {
    setResumeLoadError(null)
    setResumeActionError(null)
    void loadResume()
  }, [loadResume])

  const handlePrimaryAction = useCallback(() => {
    if (canContinue) {
      void continueLearning()
    } else {
      void startFreshLearning()
    }
  }, [canContinue, continueLearning, startFreshLearning])

  const handleViewDeck = useCallback((deckName: string) => {
    setSelectedDeck(deckName)
    setCurrentFilter("all")
    setViewMode("card-list")
  }, [])

  const handleStatClick = useCallback((kind: HomeStatKind) => {
    setSelectedDeck(GLOBAL_DECK_SCOPE)
    setCurrentFilter(homeStatToFilter(kind))
    setViewMode("card-list")
  }, [])

  const handleReviewDeck = useCallback(async (deckName: string) => {
    if (isGlobalDeckScope(deckName)) return
    try {
      const { startReviewSession } = await import("../main")
      await startReviewSession(deckName)
    } catch (error) {
      console.error(`[${pluginName}] 启动牌组复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "今日学习" })
    }
  }, [pluginName])

  const recomputeSummaries = useCallback(async (cards: ReviewCard[]) => {
    const { calculateDeckStats, calculateHomeStats } = await import("../srs/deckUtils")
    setTodayStats(calculateHomeStats(cards))
    setDeckStats(await mergeDeckNotes(pluginName, calculateDeckStats(cards)))
  }, [pluginName])

  const handleCardReset = useCallback(async (card: ReviewCard) => {
    try {
      const { resetCardSrsState, resetClozeSrsState, resetDirectionSrsState } =
        await import("../srs/storage")

      let newSrsState: SrsState
      if (card.clozeNumber) {
        newSrsState = await resetClozeSrsState(card.id, card.clozeNumber)
      } else if (card.directionType) {
        newSrsState = await resetDirectionSrsState(card.id, card.directionType)
      } else {
        newSrsState = await resetCardSrsState(card.id)
      }

      setAllCards((prev: ReviewCard[]) => {
        const next = prev.map((c: ReviewCard) => {
          const isMatch = card.clozeNumber
            ? c.id === card.id && c.clozeNumber === card.clozeNumber
            : card.directionType
              ? c.id === card.id && c.directionType === card.directionType
              : c.id === card.id
          if (isMatch) return { ...c, srs: newSrsState, isNew: true }
          return c
        })
        void recomputeSummaries(next)
        return next
      })
      invalidateFlashHomeDataCache()
      invalidateTodayLearningSummaryCache()
      void loadTodayLearning(true)
      orca.notify("success", "卡片已重置为新卡", { title: "SRS" })
    } catch (error) {
      console.error(`[${pluginName}] 重置卡片失败:`, error)
      orca.notify("error", "重置卡片失败", { title: "SRS" })
    }
  }, [pluginName, recomputeSummaries, loadTodayLearning])

  const handleCardDelete = useCallback(async (card: ReviewCard) => {
    setAllCards((prev: ReviewCard[]) => {
      const next = prev.filter((c: ReviewCard) => {
        if (card.clozeNumber) {
          return !(c.id === card.id && c.clozeNumber === card.clozeNumber)
        }
        if (card.directionType) {
          return !(c.id === card.id && c.directionType === card.directionType)
        }
        return c.id !== card.id
      })
      void recomputeSummaries(next)
      return next
    })

    try {
      const {
        deleteCardSrsData,
        deleteClozeCardSrsData,
        deleteDirectionCardSrsData
      } = await import("../srs/storage")

      if (card.clozeNumber) {
        await deleteClozeCardSrsData(card.id, card.clozeNumber)
      } else if (card.directionType) {
        await deleteDirectionCardSrsData(card.id, card.directionType)
      } else {
        await deleteCardSrsData(card.id)
      }

      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        card.id,
        "card"
      )

      invalidateFlashHomeDataCache()
      invalidateTodayLearningSummaryCache()
      void loadTodayLearning(true)
      orca.notify("success", "卡片已删除", { title: "SRS" })
    } catch (error) {
      console.error(`[${pluginName}] 删除卡片失败:`, error)
      orca.notify("error", "删除卡片失败", { title: "SRS" })
    }
  }, [pluginName, recomputeSummaries, loadTodayLearning])

  const handleCardClick = useCallback((cardId: DbId) => {
    orca.nav.openInLastPanel("block", { blockId: cardId })
  }, [])

  const handleBack = useCallback(() => {
    setViewMode("home")
    setSelectedDeck(null)
    setCurrentFilter("all")
  }, [])

  const handleShowDifficultCards = useCallback(() => {
    setViewMode("difficult-cards")
  }, [])

  const handleFilterChange = useCallback((filter: FilterType) => {
    setCurrentFilter(filter)
  }, [])

  const handleDifficultCardsReview = useCallback(async (cards: ReviewCard[]) => {
    try {
      const { createRepeatReviewSession } = await import("../srs/repeatReviewManager")
      const { createReviewSessionBlockWithDescriptor } = await import(
        "../srs/reviewSessionManager"
      )
      const { createFixedRepeatSessionDescriptor } = await import(
        "../srs/reviewSessionDescriptor"
      )

      const descriptor = createFixedRepeatSessionDescriptor({
        cards,
        sourceBlockId: 0,
        sourceType: "children"
      })
      createRepeatReviewSession(
        cards,
        0 as DbId,
        "children",
        descriptor.sessionId
      )
      const reviewBlockId = await createReviewSessionBlockWithDescriptor(
        pluginName,
        descriptor
      )

      // fixed 会话不写今日 resume，避免错误回退 all
      orca.nav.openInLastPanel("block", { blockId: reviewBlockId })
      orca.notify("success", `已开始复习 ${cards.length} 张困难卡`, { title: "今日学习" })
    } catch (error) {
      console.error(`[${pluginName}] 启动困难卡复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "今日学习" })
    }
  }, [pluginName])

  const handleRefresh = useCallback(() => {
    setResumeActionError(null)
    void loadData()
  }, [loadData])

  const handleNoteChange = useCallback((deckName: string, note: string) => {
    setDeckStats((prev: DeckStats) => ({
      ...prev,
      decks: prev.decks.map((deck: DeckInfo) =>
        deck.name === deckName ? { ...deck, note } : deck
      )
    }))
  }, [])

  if (isLoading) {
    return (
      <div className="srs-flash-home-state srs-flash-home-state--loading">
        加载中...
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="srs-flash-home-state srs-flash-home-state--error">
        <div className="srs-flash-home-state__error-text">
          加载失败：{errorMessage}
        </div>
        <Button variant="solid" onClick={handleRefresh}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="srs-flash-home-root">
      {viewMode === "home" ? (
        <div className="srs-flash-home-page">
          <FlashHomePage
            deckStats={deckStats}
            todayStats={todayStats}
            todayLearning={todayLearning}
            todayLearningLoading={todayLearningLoading}
            selectedMinutes={selectedMinutes}
            onSelectMinutes={setSelectedMinutes}
            canContinue={canContinue}
            canStart={canStart}
            actionBusy={actionBusy}
            resumeLoadError={resumeLoadError}
            resumeActionError={resumeActionError}
            onPrimaryAction={handlePrimaryAction}
            onRetryResumeLoad={handleRetryResumeLoad}
            onRetryContinue={() => void continueLearning()}
            onStartFresh={() => void startFreshLearning()}
            panelId={panelId}
            pluginName={pluginName}
            onViewDeck={handleViewDeck}
            onReviewDeck={handleReviewDeck}
            onRefresh={handleRefresh}
            onNoteChange={handleNoteChange}
            onShowDifficultCards={handleShowDifficultCards}
            onStatClick={handleStatClick}
          />
        </div>
      ) : viewMode === "difficult-cards" ? (
        <div className="srs-difficult-cards-view">
          <DifficultCardsView
            panelId={panelId}
            pluginName={pluginName}
            onBack={handleBack}
            onStartReview={handleDifficultCardsReview}
          />
        </div>
      ) : (
        <div className="srs-flash-home-view">
          <CardListView
            deckName={selectedDeck || ""}
            cards={filteredCards}
            allDeckCards={deckCards}
            currentFilter={currentFilter}
            panelId={panelId}
            onFilterChange={handleFilterChange}
            onCardClick={handleCardClick}
            onCardReset={handleCardReset}
            onCardDelete={handleCardDelete}
            onBack={handleBack}
            onReviewDeck={handleReviewDeck}
          />
        </div>
      )}
    </div>
  )
}
