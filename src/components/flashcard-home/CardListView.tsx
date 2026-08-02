import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import type { FilterType } from "../../srs/cardFilterUtils"
import {
  cardKeyFromReviewCard,
  inferCardType
} from "../../srs/cardIdentity"
import type { TtsBatchItem } from "../../srs/tts/ttsBatch"
import CardListItem from "./CardListItem"
import TtsBatchBar from "./TtsBatchBar"
import { useTtsBatchMode } from "./useTtsBatchMode"
import { isGlobalDeckScope, resolveCardListTitle } from "./homeStatNav"

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
  allDeckCards: ReviewCard[]
  currentFilter: FilterType
  panelId: string
  pluginName: string
  onFilterChange: (filter: FilterType) => void
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
  onBack: () => void
  onReviewDeck: (deckName: string) => void
}

const PAGE_SIZE = 20

export default function CardListView({
  deckName,
  cards,
  allDeckCards,
  currentFilter,
  panelId,
  pluginName,
  onFilterChange,
  onCardClick,
  onCardReset,
  onCardDelete,
  onBack,
  onReviewDeck
}: CardListViewProps) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const loaderRef = useRef<HTMLDivElement>(null)
  const globalScope = isGlobalDeckScope(deckName)
  const title = resolveCardListTitle(deckName, currentFilter)

  const tts = useTtsBatchMode({
    cards,
    pluginName,
    selectionResetKey: `${currentFilter}:${deckName}`
  })

  useEffect(() => {
    setDisplayCount(PAGE_SIZE)
  }, [currentFilter, cards.length, deckName])

  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < cards.length) {
          setDisplayCount((prev: number) =>
            Math.min(prev + PAGE_SIZE, cards.length)
          )
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loader)
    return () => observer.disconnect()
  }, [displayCount, cards.length])

  const filterCounts = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return {
      all: allDeckCards.length,
      overdue: allDeckCards.filter(
        (c) => !c.isNew && c.srs.due < today
      ).length,
      today: allDeckCards.filter(
        (c) => !c.isNew && c.srs.due >= today && c.srs.due < tomorrow
      ).length,
      future: allDeckCards.filter(
        (c) => !c.isNew && c.srs.due >= tomorrow
      ).length,
      new: allDeckCards.filter((c) => c.isNew).length
    }
  }, [allDeckCards])

  const hasDueCards = filterCounts.overdue + filterCounts.today > 0
  const displayedCards = cards.slice(0, displayCount)
  const hasMore = displayCount < cards.length

  return (
    <div className="srs-card-list-view">
      <div className="srs-card-list-view__header">
        <Button
          variant="plain"
          onClick={onBack}
          className="srs-card-list-view__back"
        >
          ← 返回
        </Button>
        <div className="srs-card-list-view__title">{title}</div>
        <div className="srs-card-list-view__header-actions">
          {!tts.batchMode ? (
            <Button
              variant="outline"
              onClick={() => tts.setBatchMode(true)}
              className="srs-card-list-view__tts-batch"
              title="为当前列表中的 Basic 卡批量添加语音"
            >
              <i className="ti ti-volume" aria-hidden="true" /> 批量语音
            </Button>
          ) : (
            <Button
              variant="plain"
              onClick={tts.batchRunning ? undefined : tts.exitBatchMode}
              className="srs-card-list-view__tts-batch"
            >
              退出批量
            </Button>
          )}
          {!globalScope && hasDueCards && !tts.batchMode && (
            <Button
              variant="solid"
              onClick={() => onReviewDeck(deckName)}
              className="srs-card-list-view__review"
            >
              复习此牌组
            </Button>
          )}
        </div>
      </div>

      <div className="srs-card-list-view__filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onFilterChange(tab.key)}
            className={
              currentFilter === tab.key
                ? "srs-filter-chip srs-filter-chip--active"
                : "srs-filter-chip"
            }
            disabled={tts.batchRunning}
          >
            {tab.label} ({filterCounts[tab.key]})
          </button>
        ))}
      </div>

      {tts.batchMode && (
        <TtsBatchBar
          cardsTotal={cards.length}
          basicFilter={tts.basicFilter}
          selectedCount={tts.selectedKeys.size}
          batchRunning={tts.batchRunning}
          skipExisting={tts.skipExisting}
          onSkipExistingChange={tts.setSkipExisting}
          liveProgress={tts.liveProgress}
          onSelectAll={tts.selectAllEligible}
          onClearSelection={tts.clearSelection}
          onStart={() => {
            void tts.startBatch()
          }}
          onCancel={tts.cancelBatch}
          onRetryFailed={() => {
            void tts.retryFailed()
          }}
        />
      )}

      {cards.length > 0 && (
        <div className="srs-card-list-frame__count">共 {cards.length} 张</div>
      )}

      <div className="srs-card-list-frame">
        {cards.length === 0 ? (
          <div className="srs-card-list-frame--empty">
            没有符合条件的卡片
          </div>
        ) : (
          <>
            {displayedCards.map((card) => {
              const key = cardKeyFromReviewCard(card)
              const type = inferCardType(card)
              const isBasic = type === "basic"
              const frontOk = (card.front ?? "").trim().length > 0
              const selectable = tts.batchMode && isBasic && frontOk
              const selected = tts.selectedKeys.has(key)
              const batchItem = tts.batchItems?.find(
                (i: TtsBatchItem) => i.cardKey === key
              )

              return (
                <CardListItem
                  key={key}
                  card={card}
                  panelId={panelId}
                  onCardClick={onCardClick}
                  onCardReset={onCardReset}
                  onCardDelete={onCardDelete}
                  batchMode={tts.batchMode}
                  selectable={selectable}
                  selected={selected}
                  batchStatus={batchItem?.status}
                  batchError={batchItem?.error}
                  skipReason={
                    tts.batchMode && !selectable
                      ? !isBasic
                        ? `非 Basic（${type}）`
                        : "正面为空"
                      : undefined
                  }
                  onToggleSelect={
                    selectable
                      ? () => tts.toggleSelect(key)
                      : undefined
                  }
                />
              )
            })}

            <div ref={loaderRef} className="srs-card-list-loader">
              {hasMore ? (
                <span>
                  加载更多... ({displayCount}/{cards.length})
                </span>
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
