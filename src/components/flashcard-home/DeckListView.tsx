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
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* 搜索栏 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)"
      }}>
        <i className="ti ti-search" style={{
          fontSize: "16px",
          color: "var(--orca-color-text-3)"
        }} />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索卡组名称或备注内容..."
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            color: "var(--orca-color-text-1)",
            fontSize: "14px",
            padding: "4px 0"
          }}
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
            style={{
              padding: "4px",
              minWidth: "auto",
              fontSize: "14px",
              color: "var(--orca-color-text-3)"
            }}
            title="清空搜索"
          >
            <i className="ti ti-x" />
          </Button>
        )}
      </div>

      {isSearching && filteredDecks.length > 0 && (
        <div style={{
          fontSize: "12px",
          color: "var(--orca-color-text-3)",
          paddingLeft: "2px"
        }}>
          匹配 {filteredDecks.length} 个卡组
        </div>
      )}

      {/* 牌组表格 */}
      <div style={{
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        overflow: "hidden"
      }}>
        {/* 表头 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 12px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderBottom: "1px solid var(--orca-color-border-1)"
        }}>
          <div style={{
            flex: 1,
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--orca-color-text-2)"
          }}>
            牌组
          </div>
          <div style={{
            width: "60px",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            color: "#3b82f6"
          }}>
            新卡
          </div>
          <div style={{
            width: "60px",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            color: "#ef4444"
          }}>
            今日到期
          </div>
          <div style={{
            width: "60px",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            color: "#22c55e"
          }}>
            积压
          </div>
          <div style={{ width: "64px" }} />
        </div>

        {/* 牌组列表 */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {deckStats.decks.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "24px",
              color: "var(--orca-color-text-3)"
            }}>
              暂无牌组，请先创建卡片
            </div>
          ) : filteredDecks.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "24px",
              color: "var(--orca-color-text-3)"
            }}>
              <div style={{ marginBottom: "8px" }}>
                <i className="ti ti-search-off" style={{ fontSize: "24px", opacity: 0.5 }} />
              </div>
              <div>未找到匹配的卡组</div>
              <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.7 }}>
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
                style={{
                  padding: hasMore ? "12px" : "8px",
                  textAlign: "center",
                  color: "var(--orca-color-text-3)",
                  fontSize: "13px"
                }}
              >
                {hasMore ? (
                  <span>加载更多... ({displayCount}/{filteredDecks.length})</span>
                ) : filteredDecks.length > DECK_PAGE_SIZE ? (
                  <span style={{ opacity: 0.6 }}>已加载全部 {filteredDecks.length} 个卡组</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
