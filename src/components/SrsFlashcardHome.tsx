import type { CSSProperties } from "react"
import type { DbId } from "../orca.d.ts"
import type { DeckInfo, DeckStats, ReviewCard, TodayStats } from "../srs/types"
import DeckCardCompact from "./DeckCardCompact"
import { calculateDeckStats, collectReviewCards, startReviewSession, getPluginName } from "../main.ts"

const { useState, useEffect, useMemo, useCallback } = window.React
const { Button } = orca.components

type ViewMode = "deck-list" | "card-list"
type FilterType = "all" | "overdue" | "today" | "future" | "new"

type SrsFlashcardHomeProps = {
  panelId: string
  blockId: DbId
}

export default function SrsFlashcardHome({ panelId, blockId }: SrsFlashcardHomeProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("deck-list")
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null)
  const [cards, setCards] = useState<ReviewCard[]>([])
  const [deckStats, setDeckStats] = useState<DeckStats | null>(null)
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pluginName, setPluginName] = useState(() => {
    try {
      return getPluginName()
    } catch {
      return "orca-srs"
    }
  })

  const loadData = useCallback(async (showBlocking = false) => {
    if (showBlocking) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setErrorMessage(null)

    try {
      const resolvedPluginName = getPluginName()
      setPluginName(resolvedPluginName)
      const cardList = await collectReviewCards(resolvedPluginName)
      const stats = calculateDeckStats(cardList)
      setCards(cardList)
      setDeckStats(stats)
      setTodayStats(calculateHomeStats(cardList))
    } catch (error) {
      console.error("[Flashcard Home] 数据加载失败:", error)
      setErrorMessage(error instanceof Error ? error.message : `${error}`)
      orca.notify("error", "Flashcard Home 数据加载失败，请稍后重试")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData(true)
  }, [loadData])

  const handleRefresh = useCallback(() => {
    void loadData(false)
  }, [loadData])

  const handleReviewAll = useCallback(() => {
    void startReviewSession()
  }, [])

  const handleReviewDeck = useCallback((deckName: string) => {
    void startReviewSession(deckName)
  }, [])

  const handleViewDeck = useCallback((deckName: string) => {
    setSelectedDeck(deckName)
    setViewMode("card-list")
  }, [])

  const handleBackToDecks = useCallback(() => {
    setSelectedDeck(null)
    setViewMode("deck-list")
  }, [])

  const selectedDeckInfo = useMemo<DeckInfo | null>(() => {
    if (!selectedDeck || !deckStats) return null
    return deckStats.decks.find((deck: DeckInfo) => deck.name === selectedDeck) ?? null
  }, [deckStats, selectedDeck])

  const selectedDeckCards = useMemo(() => {
    if (!selectedDeck) return []
    return cards.filter((card: ReviewCard) => card.deck === selectedDeck)
  }, [cards, selectedDeck])

  return (
    <div
      data-panel-id={panelId}
      data-block-id={String(blockId)}
      style={{
        height: "100%",
        overflow: "auto",
        backgroundColor: "var(--orca-color-bg-0)"
      }}
    >
      {viewMode === "deck-list" ? (
        <DeckListView
          pluginName={pluginName}
          deckStats={deckStats}
          todayStats={todayStats}
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          errorMessage={errorMessage}
          onRefresh={handleRefresh}
          onReviewAll={handleReviewAll}
          onReviewDeck={handleReviewDeck}
          onViewDeck={handleViewDeck}
        />
      ) : (
        <CardListView
          deckName={selectedDeck}
          deckInfo={selectedDeckInfo}
          cards={selectedDeckCards}
          onBack={handleBackToDecks}
          onReviewDeck={handleReviewDeck}
          onRefresh={handleRefresh}
          isLoading={isLoading && selectedDeckCards.length === 0}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

type DeckListViewProps = {
  pluginName: string
  deckStats: DeckStats | null
  todayStats: TodayStats | null
  isLoading: boolean
  isRefreshing: boolean
  errorMessage: string | null
  onRefresh: () => void
  onReviewAll: () => void
  onReviewDeck: (deckName: string) => void
  onViewDeck: (deckName: string) => void
}

function DeckListView({
  pluginName,
  deckStats,
  todayStats,
  isLoading,
  isRefreshing,
  errorMessage,
  onRefresh,
  onReviewAll,
  onReviewDeck,
  onViewDeck
}: DeckListViewProps) {
  if (isLoading && !deckStats) {
    return (
      <div style={loadingContainerStyle}>
        正在加载 Flashcard Home...
      </div>
    )
  }

  if (errorMessage && !deckStats) {
    return (
      <div style={loadingContainerStyle}>
        <div style={{ marginBottom: "12px", color: "var(--orca-color-danger-6)" }}>
          加载失败：{errorMessage}
        </div>
        <Button variant="solid" onClick={onRefresh}>重试</Button>
      </div>
    )
  }

  const handleHeaderRefresh = () => {
    if (isRefreshing) return
    onRefresh()
  }

  return (
    <div style={{ padding: "24px 32px 40px 32px", maxWidth: "960px", margin: "0 auto" }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px"
      }}>
        <div>
          <div style={{ fontSize: "22px", fontWeight: 600 }}>Flashcard Home</div>
          <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", marginTop: "4px" }}>
            插件：{pluginName}
          </div>
        </div>
        <Button
          variant="plain"
          onClick={handleHeaderRefresh}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            opacity: isRefreshing ? 0.5 : 1,
            pointerEvents: isRefreshing ? "none" : "auto"
          }}
        >
          <i className={`ti ${isRefreshing ? "ti-loader-3" : "ti-refresh"}`} />
          {isRefreshing ? "刷新中..." : "刷新"}
        </Button>
      </header>

      {errorMessage && (
        <div style={{
          backgroundColor: "var(--orca-color-danger-1)",
          border: "1px solid var(--orca-color-danger-3)",
          padding: "12px 16px",
          borderRadius: "8px",
          color: "var(--orca-color-danger-7)",
          marginBottom: "16px"
        }}>
          {errorMessage}
        </div>
      )}

      <StatsSection deckStats={deckStats} todayStats={todayStats} />
      <QuickReviewSection
          todayStats={todayStats}
          deckStats={deckStats}
          onReviewAll={onReviewAll}
        />

      <section style={{ marginTop: "32px" }}>
        <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Deck 管理</div>
        {deckStats && deckStats.decks.length > 0 ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px"
          }}>
            {deckStats.decks.map((deck: DeckInfo) => (
              <DeckCardCompact
                key={deck.name}
                deck={deck}
                onReviewDeck={onReviewDeck}
                onViewDeck={onViewDeck}
              />
            ))}
          </div>
        ) : (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: "18px", marginBottom: "8px" }}>还没有找到卡片</div>
            <div style={{ fontSize: "13px", color: "var(--orca-color-text-3)" }}>
              使用 #card 或 #card/deck 名称标签来创建你的第一张卡片
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

type CardListViewProps = {
  deckName: string | null
  deckInfo: DeckInfo | null
  cards: ReviewCard[]
  onBack: () => void
  onReviewDeck: (deckName: string) => void
  onRefresh: () => void
  isLoading: boolean
  isRefreshing: boolean
}

function CardListView({
  deckName,
  deckInfo,
  cards,
  onBack,
  onReviewDeck,
  onRefresh,
  isLoading,
  isRefreshing
}: CardListViewProps) {
  const [currentFilter, setCurrentFilter] = useState<FilterType>("all")

  const filters: FilterType[] = ["all", "overdue", "today", "future", "new"]

  const filteredCards = useMemo<ReviewCard[]>(() => {
    if (currentFilter === "all") return cards
    return cards.filter((card: ReviewCard) => getCardFilterType(card) === currentFilter)
  }, [cards, currentFilter])

  const filterCounts = useMemo(() => {
    const counts: Record<FilterType, number> = {
      all: cards.length,
      overdue: 0,
      today: 0,
      future: 0,
      new: 0
    }
    for (const card of cards) {
      const bucket = getCardFilterType(card)
      counts[bucket]++
    }
    return counts
  }, [cards])

  if (!deckName) {
    return (
      <div style={loadingContainerStyle}>
        请选择一个 Deck 查看卡片列表
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={loadingContainerStyle}>
        正在加载 {deckName} 的卡片...
      </div>
    )
  }

  const handleDeckRefresh = () => {
    if (isRefreshing) return
    onRefresh()
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "var(--orca-color-bg-0)"
    }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--orca-color-border-1)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <Button variant="plain" onClick={onBack}>← 返回</Button>
        <div style={{ fontSize: "18px", fontWeight: 600 }}>{deckName}</div>
        <div style={{ flex: 1 }} />
        <Button
          variant="plain"
          onClick={handleDeckRefresh}
          style={{
            opacity: isRefreshing ? 0.5 : 1,
            pointerEvents: isRefreshing ? "none" : "auto"
          }}
        >
          {isRefreshing ? "刷新中..." : "刷新"}
        </Button>
        <Button variant="solid" onClick={() => onReviewDeck(deckName)}>
          复习此 Deck
        </Button>
      </div>

      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--orca-color-border-1)",
        display: "flex",
        gap: "16px",
        flexWrap: "wrap"
      }}>
        <DeckSummaryPill label="新卡" value={deckInfo?.newCount ?? 0} color="var(--orca-color-primary-6)" />
        <DeckSummaryPill label="今天" value={deckInfo?.todayCount ?? 0} color="var(--orca-color-warning-6)" />
        <DeckSummaryPill label="已到期" value={deckInfo?.overdueCount ?? 0} color="var(--orca-color-danger-6)" />
        <DeckSummaryPill label="总数" value={deckInfo?.totalCount ?? cards.length} color="var(--orca-color-text-2)" />
      </div>

      <div style={{
        padding: "12px 24px",
        borderBottom: "1px solid var(--orca-color-border-1)",
        display: "flex",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        {filters.map(filter => (
          <Button
            key={filter}
            variant={currentFilter === filter ? "solid" : "plain"}
            onClick={() => setCurrentFilter(filter)}
            style={{ fontSize: "12px" }}
          >
            {filterLabel[filter]} {filter !== "all" && `(${filterCounts[filter]})`}
          </Button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {filteredCards.length === 0 ? (
          <div style={emptyStateStyle}>没有符合条件的卡片</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredCards.map((card: ReviewCard) => (
              <CardRow key={`${card.id}-${card.clozeNumber ?? "basic"}`} card={card} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type DeckSummaryPillProps = {
  label: string
  value: number
  color: string
}

function DeckSummaryPill({ label, value, color }: DeckSummaryPillProps) {
  return (
    <div style={{
      borderRadius: "10px",
      padding: "10px 14px",
      backgroundColor: "var(--orca-color-bg-1)",
      border: "1px solid var(--orca-color-border-1)",
      minWidth: "110px"
    }}>
      <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

function CardRow({ card }: { card: ReviewCard }) {
  const filterType = getCardFilterType(card)
  const dueColor = getDueColor(filterType)

  const handleOpenCard = () => {
    orca.nav.goTo("block", { blockId: card.id })
  }

  return (
    <div
      onClick={handleOpenCard}
      style={{
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "10px",
        padding: "12px 14px",
        cursor: "pointer",
        backgroundColor: "var(--orca-color-bg-1)",
        transition: "background-color 0.2s ease, border-color 0.2s ease"
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        e.currentTarget.style.borderColor = "var(--orca-color-primary-4)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
        e.currentTarget.style.borderColor = "var(--orca-color-border-1)"
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "6px" }}>
        {card.front || "(无题目)"} {card.clozeNumber ? <span style={{ color: "var(--orca-color-text-3)", fontSize: "12px" }}>#c{card.clozeNumber}</span> : null}
      </div>
      <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <span>上次复习：{formatDateTime(card.srs.lastReviewed)}</span>
        <span style={{ color: dueColor }}>到期：{formatDateTime(card.srs.due)}</span>
        <span>复习 {card.srs.reps} 次</span>
        <span>状态：{filterLabel[filterType]}</span>
      </div>
    </div>
  )
}

function StatsSection({ deckStats, todayStats }: { deckStats: DeckStats | null; todayStats: TodayStats | null }) {
  const stats = [
    {
      label: "今日待复习",
      value: todayStats?.todayCount ?? 0,
      sub: `总计 ${todayStats?.pendingCount ?? 0} 张（含已到期）`,
      color: "var(--orca-color-warning-6)"
    },
    {
      label: "新卡待学",
      value: todayStats?.newCount ?? 0,
      sub: "尚未复习的卡片",
      color: "var(--orca-color-primary-6)"
    },
    {
      label: "总卡片数",
      value: deckStats?.totalCards ?? 0,
      sub: `Deck 数量 ${deckStats?.decks.length ?? 0}`,
      color: "var(--orca-color-text-2)"
    }
  ]

  return (
    <section style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "16px"
    }}>
      {stats.map(stat => (
        <div key={stat.label} style={{
          borderRadius: "14px",
          padding: "18px",
          border: "1px solid var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-1)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.05)"
        }}>
          <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", marginBottom: "4px" }}>{stat.label}</div>
          <div style={{ fontSize: "28px", fontWeight: 600, color: stat.color }}>{stat.value}</div>
          <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", marginTop: "6px" }}>{stat.sub}</div>
        </div>
      ))}
    </section>
  )
}

function QuickReviewSection({
  todayStats,
  deckStats,
  onReviewAll
}: {
  todayStats: TodayStats | null
  deckStats: DeckStats | null
  onReviewAll: () => void
}) {
  const pendingToday = todayStats?.todayCount ?? 0
  const overdueCount = deckStats?.totalOverdue ?? 0
  const disableReview = (todayStats?.pendingCount ?? 0) === 0

  return (
    <section style={{
      marginTop: "28px",
      border: "1px solid var(--orca-color-border-1)",
      borderRadius: "14px",
      padding: "20px",
      backgroundColor: "var(--orca-color-bg-1)",
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    }}>
      <div style={{ fontSize: "15px", fontWeight: 600 }}>快速复习</div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Button
          variant="solid"
          onClick={() => {
            if (disableReview) return
            onReviewAll()
          }}
          style={{
            minWidth: "180px",
            opacity: disableReview ? 0.5 : 1,
            pointerEvents: disableReview ? "none" : "auto"
          }}
        >
          开始今日复习 ({pendingToday})
        </Button>
        <Button
          variant="plain"
          onClick={() => {
            if (disableReview) return
            onReviewAll()
          }}
          style={{
            minWidth: "180px",
            opacity: disableReview ? 0.5 : 1,
            pointerEvents: disableReview ? "none" : "auto"
          }}
        >
          复习所有到期 ({overdueCount})
        </Button>
      </div>
      <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
        提示：复习会话会自动包含所有已经到期的卡片。
      </div>
    </section>
  )
}

const filterLabel: Record<FilterType, string> = {
  all: "全部",
  overdue: "已到期",
  today: "今天",
  future: "未来",
  new: "新卡"
}

const loadingContainerStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "12px",
  color: "var(--orca-color-text-2)"
}

const emptyStateStyle: CSSProperties = {
  border: "1px dashed var(--orca-color-border-1)",
  borderRadius: "12px",
  padding: "32px",
  textAlign: "center",
  color: "var(--orca-color-text-3)",
  backgroundColor: "var(--orca-color-bg-1)"
}

function formatDateTime(date: Date | null): string {
  if (!date) return "未复习"
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function getTodayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  return { start, end }
}

function getCardFilterType(card: ReviewCard): FilterType {
  const { start, end } = getTodayRange()

  if (card.isNew) {
    return "new"
  }

  if (card.srs.due < start) {
    return "overdue"
  }

  if (card.srs.due >= start && card.srs.due <= end) {
    return "today"
  }

  return "future"
}

function getDueColor(filterType: FilterType): string {
  switch (filterType) {
    case "overdue":
      return "var(--orca-color-danger-6)"
    case "today":
      return "var(--orca-color-warning-6)"
    case "new":
      return "var(--orca-color-primary-6)"
    default:
      return "var(--orca-color-text-2)"
  }
}

function calculateHomeStats(cards: ReviewCard[]): TodayStats {
  const { start, end } = getTodayRange()
  let pendingCount = 0
  let todayCount = 0
  let newCount = 0

  for (const card of cards) {
    // 新卡单独统计，不计入待复习数量
    if (card.isNew) {
      newCount++
      continue  // 跳过后续统计，避免重复计数
    }

    // 只有非新卡才计入待复习统计
    if (card.srs.due <= end) {
      pendingCount++
    }

    if (card.srs.due >= start && card.srs.due <= end) {
      todayCount++
    }
  }

  return {
    pendingCount,
    todayCount,
    newCount,
    totalCount: cards.length
  }
}
