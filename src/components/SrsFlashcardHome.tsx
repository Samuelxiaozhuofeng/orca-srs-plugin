/** Flash Home 主容器：拥有数据、事件订阅、导航与业务动作。 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats, SrsState } from "../srs/types"
import type { FilterType } from "../srs/cardFilterUtils"
import { filterCards } from "../srs/cardFilterUtils"
import { SRS_EVENTS } from "../srs/srsEvents"
import {
  invalidateFlashHomeDataCache,
  loadFlashHomeData
} from "../srs/flashHomeDataLoader"
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
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentFilter, setCurrentFilter] = useState<FilterType>("all")

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
      } catch (error) {
        console.error(`[${pluginName}] Flash Home 加载数据失败:`, error)
        if (showSpinner) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (showSpinner) setIsLoading(false)
      }
    },
    [pluginName]
  )

  const loadData = useCallback(async () => {
    invalidateFlashHomeDataCache()
    await applyLoaded(true, true)
  }, [applyLoaded])

  useEffect(() => {
    void applyLoaded(false, true)
  }, [applyLoaded])

  // 120s 兜底：强制刷新，绕过 TTL
  useEffect(() => {
    const autoRefresh = async () => {
      try {
        const data = await loadFlashHomeData({ pluginName, force: true })
        setAllCards(data.cards)
        setTodayStats(data.todayStats)
        setDeckStats(await mergeDeckNotes(pluginName, data.deckStats))
      } catch (error) {
        console.warn(`[${pluginName}] Flash Home 自动刷新失败:`, error)
      }
    }
    const interval = setInterval(autoRefresh, 120000)
    return () => clearInterval(interval)
  }, [pluginName])

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
      void loadDataRef.current()
    }
    const handleCardGraded = () => {
      console.log(`[${pluginName}] Flash Home: 收到 CARD_GRADED 事件，静默刷新`)
      silentReload()
    }
    const handleCardPostponed = () => {
      console.log(`[${pluginName}] Flash Home: 收到 CARD_POSTPONED 事件，静默刷新`)
      silentReload()
    }
    const handleCardSuspended = () => {
      console.log(`[${pluginName}] Flash Home: 收到 CARD_SUSPENDED 事件，静默刷新`)
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
      orca.notify("error", "启动复习失败", { title: "SRS 复习" })
    }
  }, [pluginName])

  const handleStartTodayReview = useCallback(async () => {
    try {
      const { startReviewSession } = await import("../main")
      await startReviewSession()
    } catch (error) {
      console.error(`[${pluginName}] 启动今日复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "SRS 复习" })
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
      orca.notify("success", "卡片已重置为新卡", { title: "SRS" })
    } catch (error) {
      console.error(`[${pluginName}] 重置卡片失败:`, error)
      orca.notify("error", "重置卡片失败", { title: "SRS" })
    }
  }, [pluginName, recomputeSummaries])

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
      orca.notify("success", "卡片已删除", { title: "SRS" })
    } catch (error) {
      console.error(`[${pluginName}] 删除卡片失败:`, error)
      orca.notify("error", "删除卡片失败", { title: "SRS" })
    }
  }, [pluginName, recomputeSummaries])

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

      orca.nav.openInLastPanel("block", { blockId: reviewBlockId })
      orca.notify("success", `已开始复习 ${cards.length} 张困难卡片`, { title: "SRS 复习" })
    } catch (error) {
      console.error(`[${pluginName}] 启动困难卡片复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "SRS 复习" })
    }
  }, [pluginName])

  const handleRefresh = useCallback(() => {
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
            panelId={panelId}
            pluginName={pluginName}
            onViewDeck={handleViewDeck}
            onReviewDeck={handleReviewDeck}
            onStartTodayReview={handleStartTodayReview}
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
