import type { DeckInfo, DeckStats } from "../../srs/types"
import DeckRow from "./DeckRow"

const { useEffect, useMemo, useRef, useState } = window.React
const { Button } = orca.components

export type DeckListViewProps = {
  deckStats: DeckStats
  panelId: string
  pluginName: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onNoteChange: (deckName: string, note: string) => void
}

export default function DeckListView({
  deckStats,
  panelId: _panelId,
  pluginName,
  onViewDeck,
  onReviewDeck,
  onNoteChange
}: DeckListViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 无限滚动状态
  const DECK_PAGE_SIZE = 15
  const [displayCount, setDisplayCount] = useState(DECK_PAGE_SIZE)
  const loaderRef = useRef<HTMLDivElement>(null)

  // 搜索过滤：卡组名称 + 备注
  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) {
      return deckStats.decks
    }

    const query = searchQuery.toLowerCase().trim()
    return deckStats.decks.filter((deck: DeckInfo) => {
      const nameMatch = deck.name.toLowerCase().includes(query)
      const noteMatch = deck.note?.toLowerCase().includes(query) || false
      return nameMatch || noteMatch
    })
  }, [deckStats.decks, searchQuery])

  // 搜索条件变化时重置分页
  useEffect(() => {
    setDisplayCount(DECK_PAGE_SIZE)
  }, [searchQuery])

  // 无限滚动：IntersectionObserver 监听加载触发器
  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < filteredDecks.length) {
          setDisplayCount((prev: number) => Math.min(prev + DECK_PAGE_SIZE, filteredDecks.length))
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loader)
    return () => observer.disconnect()
  }, [displayCount, filteredDecks.length])

  const displayedDecks = filteredDecks.slice(0, displayCount)
  const hasMore = displayCount < filteredDecks.length
  const isSearching = searchQuery.trim().length > 0

  const handleClearSearch = () => {
    setSearchQuery("")
    searchInputRef.current?.focus()
  }

  return (
    <div className="srs-deck-list">
      {/* 搜索栏 */}
      <div className="srs-deck-search">
        <i className="ti ti-search srs-deck-search__icon" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索卡组名称或备注内容..."
          className="srs-deck-search__input"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              handleClearSearch()
            }
          }}
        />
        {searchQuery && (
          <Button
            variant="plain"
            onClick={handleClearSearch}
            className="srs-deck-search__clear"
            title="清空搜索"
          >
            <i className="ti ti-x" />
          </Button>
        )}
      </div>

      {isSearching && filteredDecks.length > 0 && (
        <div className="srs-deck-list__match-count">
          匹配 {filteredDecks.length} 个卡组
        </div>
      )}

      {/* 牌组表格 */}
      <div className="srs-deck-table">
        {/* 表头 */}
        <div className="srs-deck-table__head">
          <div className="srs-deck-table__col-name">
            牌组
          </div>
          <div className="srs-deck-table__col-count srs-deck-table__col-count--new">
            新卡
          </div>
          <div className="srs-deck-table__col-count srs-deck-table__col-count--today">
            今日到期
          </div>
          <div className="srs-deck-table__col-count srs-deck-table__col-count--backlog">
            积压
          </div>
          <div className="srs-deck-table__col-actions" />
        </div>

        {/* 牌组列表 */}
        <div className="srs-deck-table__body">
          {deckStats.decks.length === 0 ? (
            <div className="srs-deck-table__empty">
              暂无牌组，请先创建卡片
            </div>
          ) : filteredDecks.length === 0 ? (
            <div className="srs-deck-table__empty">
              <div className="srs-deck-table__empty-icon">
                <i className="ti ti-search-off" />
              </div>
              <div>未找到匹配的卡组</div>
              <div className="srs-deck-table__empty-hint">
                尝试搜索卡组名称或备注内容
              </div>
            </div>
          ) : (
            <>
              {displayedDecks.map((deck: DeckInfo) => (
                <DeckRow
                  key={deck.name}
                  deck={deck}
                  pluginName={pluginName}
                  searchQuery={searchQuery}
                  onViewDeck={onViewDeck}
                  onReviewDeck={onReviewDeck}
                  onNoteChange={onNoteChange}
                />
              ))}

              {/* 加载触发器 */}
              <div
                ref={loaderRef}
                className={
                  hasMore
                    ? "srs-deck-table__loader"
                    : "srs-deck-table__loader srs-deck-table__loader--complete"
                }
              >
                {hasMore ? (
                  <span>加载更多... ({displayCount}/{filteredDecks.length})</span>
                ) : filteredDecks.length > DECK_PAGE_SIZE ? (
                  <span className="srs-deck-table__loader-done">已加载全部 {filteredDecks.length} 个卡组</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
