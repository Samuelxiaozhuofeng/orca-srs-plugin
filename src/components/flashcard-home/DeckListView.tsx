import type { DeckInfo, DeckStats, TodayStats } from "../../srs/types"
import DeckRow from "./DeckRow"
import StatCard from "./StatCard"

const { useEffect, useMemo, useRef, useState } = window.React
const { Button } = orca.components

type DeckListViewProps = {
  deckStats: DeckStats
  todayStats: TodayStats
  panelId: string
  pluginName: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onStartTodayReview: () => void
  onRefresh: () => void
  onNoteChange: (deckName: string, note: string) => void
  onShowStatistics: () => void
  onShowDifficultCards: () => void
}

export default function DeckListView({
  deckStats,
  todayStats,
  panelId,
  pluginName,
  onViewDeck,
  onReviewDeck,
  onStartTodayReview,
  onRefresh,
  onNoteChange,
  onShowStatistics,
  onShowDifficultCards
}: DeckListViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hasDueCards = todayStats.pendingCount > 0 || todayStats.newCount > 0

  // 无限滚动状态
  const DECK_PAGE_SIZE = 15
  const [displayCount, setDisplayCount] = useState(DECK_PAGE_SIZE)
  const loaderRef = useRef<HTMLDivElement>(null)

  // 搜索过滤逻辑
  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) {
      return deckStats.decks
    }

    const query = searchQuery.toLowerCase().trim()
    return deckStats.decks.filter((deck: DeckInfo) => {
      // 按卡组名称搜索
      const nameMatch = deck.name.toLowerCase().includes(query)
      // 按备注内容搜索
      const noteMatch = deck.note?.toLowerCase().includes(query) || false
      return nameMatch || noteMatch
    })
  }, [deckStats.decks, searchQuery])

  // 当搜索条件变化时，重置显示数量
  useEffect(() => {
    setDisplayCount(DECK_PAGE_SIZE)
  }, [searchQuery])

  // 无限滚动：使用 IntersectionObserver 监听加载触发器
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

  // 当前显示的牌组
  const displayedDecks = filteredDecks.slice(0, displayCount)
  const hasMore = displayCount < filteredDecks.length

  // 清空搜索
  const handleClearSearch = () => {
    setSearchQuery("")
    searchInputRef.current?.focus()
  }

  // 移除全局键盘快捷键支持，避免与浏览器默认功能冲突

  // 计算搜索结果统计
  const searchStats = useMemo(() => {
    if (!searchQuery.trim()) {
      return {
        deckCount: deckStats.decks.length,
        totalCards: todayStats.totalCount,
        newCards: todayStats.newCount,
        pendingCards: todayStats.pendingCount
      }
    }

    const totalCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.totalCount, 0)
    const newCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.newCount, 0)
    const pendingCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.overdueCount + deck.todayCount, 0)

    return {
      deckCount: filteredDecks.length,
      totalCards,
      newCards,
      pendingCards
    }
  }, [deckStats.decks, filteredDecks, todayStats, searchQuery])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* 顶部工具栏 - Requirements: 12.1 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "8px"
      }}>
        <Button
          variant="plain"
          onClick={onShowDifficultCards}
          className="srs-difficult-cards-button"
          style={{
            fontSize: "13px",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--orca-color-danger-6)"
          }}
          title="查看困难卡片"
        >
          <i className="ti ti-alert-triangle" />
          困难卡片
        </Button>
        <Button
          variant="plain"
          onClick={onShowStatistics}
          className="srs-statistics-button"
          style={{
            fontSize: "13px",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }}
          title="查看学习统计"
        >
          <i className="ti ti-chart-bar" />
          统计
        </Button>
      </div>

      {/* 顶部统计卡片 */}
      <div style={{
        display: "flex",
        gap: "12px",
        justifyContent: "center",
        flexWrap: "wrap"
      }}>
        <StatCard
          label="未学习"
          value={todayStats.newCount}
          color="var(--orca-color-primary-6)"
        />
        <StatCard
          label="学习中"
          value={todayStats.todayCount}
          color="var(--orca-color-danger-6)"
        />
        <StatCard
          label="待复习"
          value={todayStats.pendingCount - todayStats.todayCount}
          color="var(--orca-color-success-6)"
        />
      </div>

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
            未学习
          </div>
          <div style={{
            width: "60px",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            color: "#ef4444"
          }}>
            学习中
          </div>
          <div style={{
            width: "60px",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            color: "#22c55e"
          }}>
            待复习
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

      {/* 底部统计和操作 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px"
      }}>
        {/* 学习统计 */}
        <div style={{
          fontSize: "13px",
          color: "var(--orca-color-text-2)",
          textAlign: "center"
        }}>
          {searchQuery.trim() ? (
            <div>
              <div>搜索结果：{searchStats.deckCount} 个卡组，{searchStats.totalCards} 张卡片</div>
              <div style={{ marginTop: "2px", opacity: 0.8 }}>
                {searchStats.newCards} 张新卡，{searchStats.pendingCards} 张待复习
              </div>
            </div>
          ) : (
            <div>
              共 {todayStats.totalCount} 张卡片，{todayStats.newCount} 张新卡，{todayStats.pendingCount} 张待复习
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant="solid"
            onClick={hasDueCards ? onStartTodayReview : undefined}
            style={{
              opacity: hasDueCards ? 1 : 0.5,
              cursor: hasDueCards ? "pointer" : "not-allowed",
              padding: "8px 24px"
            }}
          >
            开始今日复习
          </Button>
          <Button
            variant="plain"
            onClick={onRefresh}
            style={{ padding: "8px 16px" }}
            title="刷新数据"
          >
            <i className="ti ti-refresh" style={{ marginRight: "4px" }} />
            刷新
          </Button>
        </div>
      </div>
    </div>
  )
}
