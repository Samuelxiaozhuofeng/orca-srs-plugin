import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import type { FilterType } from "../../srs/cardFilterUtils"
import CardListItem from "./CardListItem"

const { useEffect, useMemo, useRef, useState } = window.React
const { Button } = orca.components

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "overdue", label: "已到期" },
  { key: "today", label: "今天" },
  { key: "future", label: "未来" },
  { key: "new", label: "新卡" }
]

type CardListViewProps = {
  deckName: string
  cards: ReviewCard[]
  allDeckCards: ReviewCard[]  // 当前牌组的全部卡片（用于计算筛选数量）
  currentFilter: FilterType
  panelId: string
  onFilterChange: (filter: FilterType) => void
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
  onBack: () => void
  onReviewDeck: (deckName: string) => void
}

const PAGE_SIZE = 20 // 每次加载的卡片数量

export default function CardListView({
  deckName,
  cards,
  allDeckCards,
  currentFilter,
  panelId,
  onFilterChange,
  onCardClick,
  onCardReset,
  onCardDelete,
  onBack,
  onReviewDeck
}: CardListViewProps) {
  // 无限滚动状态
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const loaderRef = useRef<HTMLDivElement>(null)

  // 当筛选条件或卡片变化时，重置显示数量
  useEffect(() => {
    setDisplayCount(PAGE_SIZE)
  }, [currentFilter, cards.length])

  // 无限滚动：使用 IntersectionObserver 监听加载触发器
  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < cards.length) {
          setDisplayCount((prev: number) => Math.min(prev + PAGE_SIZE, cards.length))
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loader)
    return () => observer.disconnect()
  }, [displayCount, cards.length])

  // 计算各筛选条件的卡片数量（基于全部卡片，而不是筛选后的卡片）
  const filterCounts = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return {
      all: allDeckCards.length,
      overdue: allDeckCards.filter(c => !c.isNew && c.srs.due < today).length,
      today: allDeckCards.filter(c => !c.isNew && c.srs.due >= today && c.srs.due < tomorrow).length,
      future: allDeckCards.filter(c => !c.isNew && c.srs.due >= tomorrow).length,
      new: allDeckCards.filter(c => c.isNew).length
    }
  }, [allDeckCards])

  const hasDueCards = filterCounts.overdue + filterCounts.today > 0

  // 当前显示的卡片
  const displayedCards = cards.slice(0, displayCount)
  const hasMore = displayCount < cards.length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* 头部 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px"
      }}>
        <Button variant="plain" onClick={onBack} style={{ fontSize: "13px", padding: "6px 12px" }}>
          ← 返回
        </Button>
        <div style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          flex: 1
        }}>
          {deckName}
        </div>
        {hasDueCards && (
          <Button
            variant="solid"
            onClick={() => onReviewDeck(deckName)}
            style={{ fontSize: "13px", padding: "6px 12px" }}
          >
            复习此牌组
          </Button>
        )}
      </div>

      {/* 筛选标签 */}
      <div style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              border: "1px solid",
              borderColor: currentFilter === tab.key
                ? "var(--orca-color-primary-5)"
                : "var(--orca-color-border-1)",
              backgroundColor: currentFilter === tab.key
                ? "var(--orca-color-primary-1)"
                : "transparent",
              color: currentFilter === tab.key
                ? "var(--orca-color-primary-6)"
                : "var(--orca-color-text-2)",
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            {tab.label} ({filterCounts[tab.key]})
          </button>
        ))}
      </div>

      {cards.length > 0 && (
        <div className="srs-card-list-frame__count">
          共 {cards.length} 张
        </div>
      )}

      {/* 卡片列表 tray */}
      <div className="srs-card-list-frame">
        {cards.length === 0 ? (
          <div className="srs-card-list-frame--empty">
            没有符合条件的卡片
          </div>
        ) : (
          <>
            {displayedCards.map((card, index) => (
              <CardListItem
                key={`${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}-${card.listItemId || 0}-${index}`}
                card={card}
                panelId={panelId}
                onCardClick={onCardClick}
                onCardReset={onCardReset}
                onCardDelete={onCardDelete}
              />
            ))}

            <div ref={loaderRef} className="srs-card-list-loader">
              {hasMore ? (
                <span>加载更多... ({displayCount}/{cards.length})</span>
              ) : cards.length > PAGE_SIZE ? (
                <span>已加载全部 {cards.length} 张卡片</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
