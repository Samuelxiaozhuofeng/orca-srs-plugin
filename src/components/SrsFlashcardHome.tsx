/** Flash Home 主容器：拥有数据、事件订阅、导航与业务动作。 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats, SrsState } from "../srs/types"
import type { FilterType } from "../srs/cardFilterUtils"
import { filterCards } from "../srs/cardFilterUtils"
import { SRS_EVENTS } from "../srs/srsEvents"
import StatisticsView from "./StatisticsView"
import DifficultCardsView from "./DifficultCardsView"
import FlashcardDashboard from "./FlashcardDashboard"
import CardListView from "./flashcard-home/CardListView"
import DeckListView from "./flashcard-home/DeckListView"

const { useState, useEffect, useCallback, useMemo, useRef } = window.React
const { Button } = orca.components

type ViewMode = "dashboard" | "deck-list" | "card-list" | "statistics" | "difficult-cards"

type SrsFlashcardHomeProps = {
  panelId: string
  pluginName: string
  onClose?: () => void
}

export default function SrsFlashcardHome({ panelId, pluginName, onClose }: SrsFlashcardHomeProps) {
  // 1. 所有 Hooks 在顶层声明（避免 Error #185）
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard")
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null)
  const [allCards, setAllCards] = useState<ReviewCard[]>([])
  const [deckStats, setDeckStats] = useState<DeckStats>({ decks: [], totalCards: 0, totalNew: 0, totalOverdue: 0 })
  const [todayStats, setTodayStats] = useState<TodayStats>({ pendingCount: 0, todayCount: 0, newCount: 0, totalCount: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentFilter, setCurrentFilter] = useState<FilterType>("all")
  
  // Dashboard 需要的额外数据
  const [reviewHistory, setReviewHistory] = useState<any>(null)
  const [futureForecast, setFutureForecast] = useState<any>(null)
  const [todayStatistics, setTodayStatistics] = useState<any>(null)

  // 加载数据
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { collectReviewCards, calculateDeckStats } = await import("../main")
      const { calculateHomeStats } = await import("../srs/deckUtils")
      const { getAllDeckNotes } = await import("../srs/deckNoteManager")
      const { 
        getReviewHistory, 
        getFutureForecast,
        getTodayStatistics 
      } = await import("../srs/statisticsManager")

      const cards = await collectReviewCards(pluginName)
      setAllCards(cards)

      const stats = calculateDeckStats(cards)
      
      // 加载卡组备注并合并到统计数据中
      const deckNotes = await getAllDeckNotes(pluginName)
      const enhancedStats = {
        ...stats,
        decks: stats.decks.map(deck => ({
          ...deck,
          note: deckNotes[deck.name] || ""
        }))
      }
      setDeckStats(enhancedStats)

      const homeStats = calculateHomeStats(cards)
      setTodayStats(homeStats)
      
      // 加载 Dashboard 需要的数据
      const [history, forecast, todayStatsData] = await Promise.all([
        getReviewHistory(pluginName, "3months"),
        getFutureForecast(pluginName, 30),
        getTodayStatistics(pluginName)
      ])
      setReviewHistory(history)
      setFutureForecast(forecast)
      setTodayStatistics(todayStatsData)
    } catch (error) {
      console.error(`[${pluginName}] Flash Home 加载数据失败:`, error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }, [pluginName])

  // 初始加载
  useEffect(() => {
    void loadData()
  }, [loadData])

  // 动态更新：定期刷新数据以显示新到期的卡片
  // FC-13：graded/postponed/suspended 已事件驱动即时刷新；编辑/删除事件不完整，
  // 故保留 120s 低频全量兜底。收集成本由 cardCollector FC-13 预热/批量读取降低。
  useEffect(() => {
    const autoRefresh = async () => {
      try {
        // 静默刷新数据，不显示加载状态
        const { collectReviewCards, calculateDeckStats } = await import("../main")
        const { calculateHomeStats } = await import("../srs/deckUtils")
        const { getAllDeckNotes } = await import("../srs/deckNoteManager")

        const cards = await collectReviewCards(pluginName)
        
        // 检查是否有新的到期卡片
        const oldTotalDue = todayStats.pendingCount
        const newStats = calculateHomeStats(cards)
        
        if (newStats.pendingCount > oldTotalDue) {
          console.log(`[${pluginName}] Flash Home: 发现新到期卡片，从 ${oldTotalDue} 增加到 ${newStats.pendingCount}`)
        }
        
        setAllCards(cards)

        const stats = calculateDeckStats(cards)
        
        // 加载卡组备注并合并到统计数据中
        const deckNotes = await getAllDeckNotes(pluginName)
        const enhancedStats = {
          ...stats,
          decks: stats.decks.map(deck => ({
            ...deck,
            note: deckNotes[deck.name] || ""
          }))
        }
        setDeckStats(enhancedStats)
        setTodayStats(newStats)
      } catch (error) {
        // 静默失败，不影响用户体验
        console.warn(`[${pluginName}] Flash Home 自动刷新失败:`, error)
      }
    }

    // 每2分钟自动刷新一次数据
    const interval = setInterval(autoRefresh, 120000) // 120秒

    // 组件卸载时清理定时器
    return () => clearInterval(interval)
  }, [pluginName, todayStats.pendingCount])

  // 使用 ref 存储 loadData，避免事件订阅时的依赖问题
  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  // 事件订阅：静默刷新数据
  // 注意：orca.broadcasts 每个事件类型只能有一个处理器
  // 使用 useRef 存储处理器引用，确保注册和取消注册使用同一个函数引用
  const handlersRef = useRef<{
    graded: ((data: unknown) => void) | null
    postponed: ((data: unknown) => void) | null
    suspended: ((data: unknown) => void) | null
  }>({ graded: null, postponed: null, suspended: null })

  useEffect(() => {
    // 创建处理器函数
    const handleCardGraded = () => {
      console.log(`[${pluginName}] Flash Home: 收到 CARD_GRADED 事件，静默刷新`)
      void loadDataRef.current()
    }

    const handleCardPostponed = () => {
      console.log(`[${pluginName}] Flash Home: 收到 CARD_POSTPONED 事件，静默刷新`)
      void loadDataRef.current()
    }

    const handleCardSuspended = () => {
      console.log(`[${pluginName}] Flash Home: 收到 CARD_SUSPENDED 事件，静默刷新`)
      void loadDataRef.current()
    }

    // 存储处理器引用
    handlersRef.current = {
      graded: handleCardGraded,
      postponed: handleCardPostponed,
      suspended: handleCardSuspended
    }

    // 安全注册：先检查是否已注册，如果已注册则跳过
    // 这样可以避免重复注册错误，同时允许其他组件也能注册
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
      // 取消订阅 - 使用存储的处理器引用
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

  // 筛选当前牌组的卡片
  const deckCards = useMemo(() => {
    if (!selectedDeck) return []
    return allCards.filter((card: ReviewCard) => card.deck === selectedDeck)
  }, [allCards, selectedDeck])

  const filteredCards = useMemo(() => {
    // 应用筛选条件
    return filterCards(deckCards, currentFilter)
  }, [deckCards, currentFilter])

  // 处理查看牌组
  const handleViewDeck = useCallback((deckName: string) => {
    setSelectedDeck(deckName)
    setCurrentFilter("all")
    setViewMode("card-list")
  }, [])

  // 处理复习牌组
  const handleReviewDeck = useCallback(async (deckName: string) => {
    try {
      const { startReviewSession } = await import("../main")
      await startReviewSession(deckName)
    } catch (error) {
      console.error(`[${pluginName}] 启动牌组复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "SRS 复习" })
    }
  }, [pluginName])

  // 处理开始今日复习
  const handleStartTodayReview = useCallback(async () => {
    try {
      const { startReviewSession } = await import("../main")
      await startReviewSession()
    } catch (error) {
      console.error(`[${pluginName}] 启动今日复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "SRS 复习" })
    }
  }, [pluginName])

  // 处理重置卡片
  const handleCardReset = useCallback(async (card: ReviewCard) => {
    try {
      const { resetCardSrsState, resetClozeSrsState, resetDirectionSrsState } = await import("../srs/storage")
      
      let newSrsState: SrsState
      if (card.clozeNumber) {
        // Cloze 卡片
        newSrsState = await resetClozeSrsState(card.id, card.clozeNumber)
      } else if (card.directionType) {
        // Direction 卡片
        newSrsState = await resetDirectionSrsState(card.id, card.directionType)
      } else {
        // 普通卡片
        newSrsState = await resetCardSrsState(card.id)
      }
      
      // 只更新该卡片的状态，不刷新整个列表
      setAllCards((prev: ReviewCard[]) => prev.map((c: ReviewCard) => {
        // 匹配卡片
        const isMatch = card.clozeNumber
          ? c.id === card.id && c.clozeNumber === card.clozeNumber
          : card.directionType
            ? c.id === card.id && c.directionType === card.directionType
            : c.id === card.id
        
        if (isMatch) {
          return { ...c, srs: newSrsState, isNew: true }
        }
        return c
      }))
      
      orca.notify("success", "卡片已重置为新卡", { title: "SRS" })
    } catch (error) {
      console.error(`[${pluginName}] 重置卡片失败:`, error)
      orca.notify("error", "重置卡片失败", { title: "SRS" })
    }
  }, [pluginName])

  // 处理删除卡片
  const handleCardDelete = useCallback(async (card: ReviewCard) => {
    // 先从列表中移除该卡片，避免闪烁
    setAllCards((prev: ReviewCard[]) => prev.filter((c: ReviewCard) => {
      // 对于 Cloze 卡片，需要匹配 id 和 clozeNumber
      if (card.clozeNumber) {
        return !(c.id === card.id && c.clozeNumber === card.clozeNumber)
      }
      // 对于 Direction 卡片，需要匹配 id 和 directionType
      if (card.directionType) {
        return !(c.id === card.id && c.directionType === card.directionType)
      }
      // 普通卡片只匹配 id
      return c.id !== card.id
    }))
    
    // 然后异步删除 SRS 数据和 #card 标签
    try {
      const { deleteCardSrsData, deleteClozeCardSrsData, deleteDirectionCardSrsData } = await import("../srs/storage")
      
      if (card.clozeNumber) {
        // Cloze 卡片 - 删除该填空的 SRS 数据
        await deleteClozeCardSrsData(card.id, card.clozeNumber)
      } else if (card.directionType) {
        // Direction 卡片 - 删除该方向的 SRS 数据
        await deleteDirectionCardSrsData(card.id, card.directionType)
      } else {
        // 普通卡片 - 删除所有 SRS 数据
        await deleteCardSrsData(card.id)
      }
      
      // 无论什么类型的卡片，都移除 #card 标签
      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        card.id,
        "card"
      )
      
      orca.notify("success", "卡片已删除", { title: "SRS" })
    } catch (error) {
      console.error(`[${pluginName}] 删除卡片失败:`, error)
      orca.notify("error", "删除卡片失败", { title: "SRS" })
    }
  }, [pluginName])

  // 处理点击卡片 - 在新面板打开卡片原始块
  const handleCardClick = useCallback((cardId: DbId) => {
    orca.nav.openInLastPanel("block", { blockId: cardId })
  }, [])

  // 处理返回
  const handleBack = useCallback(() => {
    setViewMode("deck-list")
    setSelectedDeck(null)
    setCurrentFilter("all")
  }, [])

  // 处理显示统计视图
  const handleShowStatistics = useCallback(() => {
    setViewMode("statistics")
  }, [])

  // 处理显示困难卡片视图
  const handleShowDifficultCards = useCallback(() => {
    setViewMode("difficult-cards")
  }, [])

  // 处理筛选变更
  const handleFilterChange = useCallback((filter: FilterType) => {
    setCurrentFilter(filter)
  }, [])

  // 处理困难卡片复习
  const handleDifficultCardsReview = useCallback(async (cards: ReviewCard[]) => {
    try {
      const { createRepeatReviewSession } = await import("../srs/repeatReviewManager")
      const { createReviewSessionBlockWithDescriptor } = await import(
        "../srs/reviewSessionManager"
      )
      const { createFixedRepeatSessionDescriptor } = await import(
        "../srs/reviewSessionDescriptor"
      )

      // F2-01：困难卡固定 sourceBlockId=0 + children，与进度 scope 约定一致
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

      // 使用原生方法在新面板打开
      orca.nav.openInLastPanel("block", { blockId: reviewBlockId })

      orca.notify("success", `已开始复习 ${cards.length} 张困难卡片`, { title: "SRS 复习" })
    } catch (error) {
      console.error(`[${pluginName}] 启动困难卡片复习失败:`, error)
      orca.notify("error", "启动复习失败", { title: "SRS 复习" })
    }
  }, [pluginName])

  // 处理刷新
  const handleRefresh = useCallback(() => {
    void loadData()
  }, [loadData])

  // 处理备注变更
  const handleNoteChange = useCallback((deckName: string, note: string) => {
    setDeckStats((prev: DeckStats) => ({
      ...prev,
      decks: prev.decks.map((deck: DeckInfo) => 
        deck.name === deckName ? { ...deck, note } : deck
      )
    }))
  }, [])

  // 2. 条件渲染在 Hooks 之后
  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: "200px",
        fontSize: "14px",
        color: "var(--orca-color-text-2)"
      }}>
        加载中...
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "24px",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "200px"
      }}>
        <div style={{ color: "var(--orca-color-danger-5)" }}>
          加载失败：{errorMessage}
        </div>
        <Button variant="solid" onClick={handleRefresh}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div style={{
      padding: "16px",
      height: "100%",
      overflow: "auto"
    }}>
      {viewMode === "dashboard" ? (
        <div className="srs-dashboard-view">
          {/* Dashboard 顶部导航 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px"
          }}>
            <div style={{
              display: "flex",
              gap: "8px"
            }}>
              <Button
                variant="solid"
                onClick={() => setViewMode("dashboard")}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                主页
              </Button>
              <Button
                variant="plain"
                onClick={() => setViewMode("deck-list")}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                卡组
              </Button>
              <Button
                variant="plain"
                onClick={handleShowStatistics}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                统计
              </Button>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                variant="plain"
                onClick={handleShowDifficultCards}
                style={{ fontSize: "13px", padding: "6px 12px", color: "var(--orca-color-danger-6)" }}
              >
                <i className="ti ti-alert-triangle" style={{ marginRight: "4px" }} />
                困难卡片
              </Button>
              <Button
                variant="plain"
                onClick={handleRefresh}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                <i className="ti ti-refresh" />
              </Button>
            </div>
          </div>
          
          <FlashcardDashboard
            pluginName={pluginName}
            todayStats={todayStatistics}
            reviewHistory={reviewHistory}
            futureForecast={futureForecast}
            totalCards={todayStats.totalCount}
            newCards={todayStats.newCount}
            dueCards={todayStats.pendingCount}
            onStartReview={handleStartTodayReview}
            onRefresh={handleRefresh}
            isLoading={isLoading}
          />
        </div>
      ) : viewMode === "deck-list" ? (
        <div className="srs-deck-list-view">
          {/* Deck List 顶部导航 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px"
          }}>
            <div style={{
              display: "flex",
              gap: "8px"
            }}>
              <Button
                variant="plain"
                onClick={() => setViewMode("dashboard")}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                主页
              </Button>
              <Button
                variant="solid"
                onClick={() => setViewMode("deck-list")}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                卡组
              </Button>
              <Button
                variant="plain"
                onClick={handleShowStatistics}
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                统计
              </Button>
            </div>
          </div>
          
          <DeckListView
            deckStats={deckStats}
            todayStats={todayStats}
            panelId={panelId}
            pluginName={pluginName}
            onViewDeck={handleViewDeck}
            onReviewDeck={handleReviewDeck}
            onStartTodayReview={handleStartTodayReview}
            onRefresh={handleRefresh}
            onNoteChange={handleNoteChange}
            onShowStatistics={handleShowStatistics}
            onShowDifficultCards={handleShowDifficultCards}
          />
        </div>
      ) : viewMode === "statistics" ? (
        <div className="srs-statistics-view">
          <StatisticsView
            panelId={panelId}
            pluginName={pluginName}
            onBack={handleBack}
            decks={deckStats.decks}
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
