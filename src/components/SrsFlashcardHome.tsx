/**
 * Flash Home 主组件
 * 
 * 提供牌组列表视图和卡片列表视图，支持统计概览和筛选功能
 * 
 * 需求: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats, SrsState } from "../srs/types"
import type { FilterType } from "../srs/cardFilterUtils"
import { filterCards } from "../srs/cardFilterUtils"
import SafeBlockPreview from "./SafeBlockPreview"
import BlockTextPreview from "./BlockTextPreview"
import { SRS_EVENTS } from "../srs/srsEvents"
import StatisticsView from "./StatisticsView"
import DifficultCardsView from "./DifficultCardsView"
import FlashcardDashboard from "./FlashcardDashboard"

const { useState, useEffect, useCallback, useMemo, useRef } = window.React
const { Button } = orca.components

// ========================================
// 类型定义
// ========================================

type ViewMode = "dashboard" | "deck-list" | "card-list" | "statistics" | "difficult-cards"

type SrsFlashcardHomeProps = {
  panelId: string
  pluginName: string
  onClose?: () => void
}

// ========================================
// 筛选标签配置
// ========================================

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "overdue", label: "已到期" },
  { key: "today", label: "今天" },
  { key: "future", label: "未来" },
  { key: "new", label: "新卡" }
]

// ========================================
// 工具函数：高亮文本
// ========================================

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>
  }

  const parts = text.split(new RegExp(`(${query})`, "gi"))
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={index} style={{
            backgroundColor: "var(--orca-color-warning-2)",
            color: "var(--orca-color-warning-7)",
            fontWeight: 600,
            padding: "0 2px",
            borderRadius: "2px"
          }}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

// ========================================
// 子组件：统计卡片
// ========================================

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "12px 16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      minWidth: "80px"
    }}>
      <div style={{
        fontSize: "24px",
        fontWeight: 600,
        color: color || "var(--orca-color-text-1)"
      }}>
        {value}
      </div>
      <div style={{
        fontSize: "12px",
        color: "var(--orca-color-text-3)",
        marginTop: "4px"
      }}>
        {label}
      </div>
    </div>
  )
}

// ========================================
// 子组件：牌组卡片
// ========================================

type DeckCardProps = {
  deck: DeckInfo
  deckBlockId: DbId | null
  panelId: string
  pluginName: string
  searchQuery?: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onNoteChange: (deckName: string, note: string) => void
}

function DeckCard({ deck, deckBlockId, panelId, pluginName, searchQuery = "", onViewDeck, onReviewDeck, onNoteChange }: DeckCardProps) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(deck.note || "")
  const dueCount = deck.overdueCount + deck.todayCount

  const handleClick = () => {
    onViewDeck(deck.name)
  }

  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation()
    onReviewDeck(deck.name)
  }

  const handleNoteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingNote(true)
  }

  const handleNoteSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { setDeckNote } = await import("../srs/deckNoteManager")
      await setDeckNote(pluginName, deck.name, noteText)
      onNoteChange(deck.name, noteText)
      setIsEditingNote(false)
    } catch (error) {
      console.error(`[${pluginName}] 保存卡组备注失败:`, error)
      orca.notify("error", "保存备注失败", { title: "SRS" })
    }
  }

  const handleNoteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNoteText(deck.note || "")
    setIsEditingNote(false)
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNoteText(e.target.value)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-1)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        transition: "all 0.2s ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        e.currentTarget.style.borderColor = "var(--orca-color-primary-4)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
        e.currentTarget.style.borderColor = "var(--orca-color-border-1)"
      }}
    >
      {/* 牌组名称 */}
      <div style={{
        fontSize: "15px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)"
      }}>
        <HighlightText text={deck.name} query={searchQuery} />
      </div>

      {/* 统计信息 */}
      <div style={{
        display: "flex",
        gap: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        {deck.newCount > 0 && (
          <span style={{ color: "var(--orca-color-primary-6)" }}>
            {deck.newCount} 未学习
          </span>
        )}
        {deck.todayCount > 0 && (
          <span style={{ color: "var(--orca-color-danger-6)" }}>
            {deck.todayCount} 学习中
          </span>
        )}
        {deck.overdueCount > 0 && (
          <span style={{ color: "var(--orca-color-success-6)" }}>
            {deck.overdueCount} 待复习
          </span>
        )}
        <span style={{ color: "var(--orca-color-text-3)" }}>
          共 {deck.totalCount} 张
        </span>
      </div>

      {/* 备注区域 */}
      {(deck.note || isEditingNote) && (
        <div style={{
          marginTop: "8px",
          padding: "8px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "4px",
          border: "1px solid var(--orca-color-border-1)"
        }}>
          {isEditingNote ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                value={noteText}
                onChange={handleNoteChange}
                placeholder="输入卡组备注..."
                style={{
                  width: "100%",
                  minHeight: "60px",
                  padding: "6px",
                  border: "1px solid var(--orca-color-border-1)",
                  borderRadius: "4px",
                  backgroundColor: "var(--orca-color-bg-1)",
                  color: "var(--orca-color-text-1)",
                  fontSize: "13px",
                  resize: "vertical"
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Button
                  variant="plain"
                  onClick={handleNoteCancel}
                  style={{ fontSize: "12px", padding: "4px 8px" }}
                >
                  取消
                </Button>
                <Button
                  variant="solid"
                  onClick={handleNoteSave}
                  style={{ fontSize: "12px", padding: "4px 8px" }}
                >
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={handleNoteClick}
              style={{
                fontSize: "13px",
                color: "var(--orca-color-text-2)",
                cursor: "pointer",
                minHeight: "20px",
                whiteSpace: "pre-wrap"
              }}
              title="点击编辑备注"
            >
              {deck.note ? (
                <HighlightText text={deck.note} query={searchQuery} />
              ) : (
                "点击添加备注..."
              )}
            </div>
          )}
        </div>
      )}

      {/* 添加备注按钮（当没有备注且不在编辑状态时显示） */}
      {!deck.note && !isEditingNote && (
        <Button
          variant="plain"
          onClick={handleNoteClick}
          style={{
            marginTop: "8px",
            fontSize: "12px",
            padding: "4px 8px",
            color: "var(--orca-color-text-3)"
          }}
        >
          <i className="ti ti-note" style={{ marginRight: "4px" }} />
          添加备注
        </Button>
      )}

      {/* 复习按钮 */}
      {dueCount > 0 && (
        <Button
          variant="solid"
          onClick={handleReview}
          style={{ marginTop: "4px", fontSize: "13px", padding: "6px 12px" }}
        >
          开始复习
        </Button>
      )}
    </div>
  )
}

// ========================================
// 子组件：卡片列表项
// ========================================

type CardListItemProps = {
  card: ReviewCard
  panelId: string
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
}

function CardListItem({ card, panelId, onCardClick, onCardReset, onCardDelete }: CardListItemProps) {
  // 格式化到期时间（相对描述）
  const formatDueDate = (date: Date): string => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date < today) {
      const days = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
      return `已到期 ${days} 天`
    } else if (date < tomorrow) {
      return "今天到期"
    } else {
      const days = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return `${days} 天后到期`
    }
  }

  // 格式化下次复习日期（具体日期）
  const formatNextReviewDate = (date: Date): string => {
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  }

  // 格式化间隔天数
  const formatInterval = (interval: number): string => {
    if (interval < 1) return "< 1天"
    if (interval < 30) return `${Math.round(interval)}天`
    if (interval < 365) return `${Math.round(interval / 30)}月`
    return `${(interval / 365).toFixed(1)}年`
  }

  // 处理跳转按钮点击
  const handleGoToClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardClick(card.id)
  }

  // 处理重置按钮点击
  const handleResetClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardReset(card)
  }

  // 处理删除按钮点击
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardDelete(card)
  }

  const resets = card.srs.resets ?? 0

  return (
    <div
      style={{
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-1)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        transition: "all 0.2s ease"
      }}
    >
      {/* 面包屑导航 */}
      <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
        <orca.components.BlockBreadcrumb blockId={card.id} />
      </div>

      {/* 卡片内容预览 */}
      <div style={{ minHeight: "24px" }}>
        <SafeBlockPreview blockId={card.id} panelId={panelId} />
      </div>

      {/* 卡片状态和操作 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        color: "var(--orca-color-text-3)",
        borderTop: "1px solid var(--orca-color-border-1)",
        paddingTop: "8px"
      }}>
        {/* 状态信息 */}
        <div style={{ display: "flex", gap: "12px", flex: 1, flexWrap: "wrap" }}>
          {card.isNew ? (
            <span style={{ color: "var(--orca-color-primary-6)" }}>未学习</span>
          ) : (
            <>
              <span style={{ 
                color: (() => {
                  const now = new Date()
                  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  const tomorrow = new Date(today)
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  if (card.srs.due < today) return "var(--orca-color-success-6)" // 待复习（已到期）- 绿色
                  if (card.srs.due < tomorrow) return "var(--orca-color-danger-6)" // 学习中（今天到期）- 红色
                  return "var(--orca-color-text-2)" // 未来到期
                })()
              }}>
                {formatDueDate(card.srs.due)}
              </span>
              <span style={{ color: "var(--orca-color-text-2)" }}>
                下次: {formatNextReviewDate(card.srs.due)}
              </span>
              <span style={{ color: "var(--orca-color-text-2)" }}>
                间隔: {formatInterval(card.srs.interval)}
              </span>
            </>
          )}
          {card.clozeNumber && (
            <span style={{ color: "var(--orca-color-primary-5)" }}>填空 c{card.clozeNumber}</span>
          )}
          {card.directionType && (
            <span style={{ color: card.directionType === "forward" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)" }}>
              {card.directionType === "forward" ? "正向" : "反向"}
            </span>
          )}
          {resets > 0 && (
            <span style={{ color: "var(--orca-color-warning-6)" }}>
              重置 {resets} 次
            </span>
          )}
        </div>
        
        {/* 删除按钮 */}
        <Button
          variant="plain"
          onClick={handleDeleteClick}
          style={{
            fontSize: "12px",
            padding: "4px 8px",
            minWidth: "auto",
            color: "var(--orca-color-danger-6)"
          }}
          title="删除卡片（移除 Card 标记和 SRS 数据）"
        >
          <i className="ti ti-trash" style={{ marginRight: "4px" }} />
          删除
        </Button>
        
        {/* 重置按钮 */}
        <Button
          variant="plain"
          onClick={handleResetClick}
          style={{
            fontSize: "12px",
            padding: "4px 8px",
            minWidth: "auto",
            color: "var(--orca-color-warning-6)"
          }}
          title="重置卡片为新卡状态"
        >
          <i className="ti ti-refresh" style={{ marginRight: "4px" }} />
          重置
        </Button>
        
        {/* 跳转按钮 */}
        <Button
          variant="plain"
          onClick={handleGoToClick}
          style={{
            fontSize: "12px",
            padding: "4px 8px",
            minWidth: "auto"
          }}
          title="在右侧面板打开编辑"
        >
          <i className="ti ti-external-link" style={{ marginRight: "4px" }} />
          跳转
        </Button>
      </div>
    </div>
  )
}

// ========================================
// 子组件：牌组表格行
// ========================================

type DeckRowProps = {
  deck: DeckInfo
  pluginName: string
  searchQuery?: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onNoteChange: (deckName: string, note: string) => void
}

function DeckRow({ deck, pluginName, searchQuery = "", onViewDeck, onReviewDeck, onNoteChange }: DeckRowProps) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(deck.note || "")
  const dueCount = deck.overdueCount + deck.todayCount
  
  const handleClick = () => {
    onViewDeck(deck.name)
  }
  
  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (dueCount > 0 || deck.newCount > 0) {
      onReviewDeck(deck.name)
    }
  }

  const handleNoteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingNote(true)
  }

  const handleNoteSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { setDeckNote } = await import("../srs/deckNoteManager")
      await setDeckNote(pluginName, deck.name, noteText)
      onNoteChange(deck.name, noteText)
      setIsEditingNote(false)
    } catch (error) {
      console.error(`[${pluginName}] 保存卡组备注失败:`, error)
      orca.notify("error", "保存备注失败", { title: "SRS" })
    }
  }

  const handleNoteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNoteText(deck.note || "")
    setIsEditingNote(false)
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNoteText(e.target.value)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 12px",
          backgroundColor: "var(--orca-color-bg-1)",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "background-color 0.15s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
        }}
      >
        {/* 牌组名称 */}
        <div style={{
          flex: 1,
          fontSize: "14px",
          color: "var(--orca-color-text-1)",
          fontWeight: 500
        }}>
          <div>
            <HighlightText text={deck.name} query={searchQuery} />
          </div>
          {deck.note && !isEditingNote && (
            <div 
              style={{
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                marginTop: "2px",
                cursor: "pointer"
              }}
              onClick={handleNoteClick}
              title="点击编辑备注"
            >
              <HighlightText text={deck.note} query={searchQuery} />
            </div>
          )}
        </div>
      
        {/* 未学习数 - 蓝色 */}
        <div style={{
          width: "60px",
          textAlign: "center",
          fontSize: "14px",
          color: deck.newCount > 0 ? "#3b82f6" : "#9ca3af"
        }}>
          {deck.newCount}
        </div>
        
        {/* 学习中（今天到期） - 红色 */}
        <div style={{
          width: "60px",
          textAlign: "center",
          fontSize: "14px",
          color: deck.todayCount > 0 ? "#ef4444" : "#9ca3af"
        }}>
          {deck.todayCount}
        </div>
        
        {/* 待复习（已到期） - 绿色 */}
        <div style={{
          width: "60px",
          textAlign: "center",
          fontSize: "14px",
          color: deck.overdueCount > 0 ? "#22c55e" : "#9ca3af"
        }}>
          {deck.overdueCount}
        </div>
        
        {/* 操作按钮 */}
        <div style={{ width: "64px", textAlign: "center", display: "flex", gap: "4px" }}>
          <Button
            variant="plain"
            onClick={handleNoteClick}
            style={{
              padding: "4px",
              minWidth: "auto",
              opacity: 0.7
            }}
            title={deck.note ? "编辑备注" : "添加备注"}
          >
            <i className="ti ti-note" />
          </Button>
          <Button
            variant="plain"
            onClick={handleReview}
            style={{
              padding: "4px",
              minWidth: "auto",
              opacity: (dueCount > 0 || deck.newCount > 0) ? 1 : 0.3
            }}
            title="开始复习"
          >
            <i className="ti ti-player-play" />
          </Button>
        </div>
      </div>
      
      {/* 备注编辑区域 */}
      {isEditingNote && (
        <div style={{
          padding: "8px 12px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "6px",
          marginTop: "4px"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={noteText}
              onChange={handleNoteChange}
              placeholder="输入卡组备注..."
              style={{
                flex: 1,
                padding: "4px 8px",
                border: "1px solid var(--orca-color-border-1)",
                borderRadius: "4px",
                backgroundColor: "var(--orca-color-bg-1)",
                color: "var(--orca-color-text-1)",
                fontSize: "13px"
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <Button
              variant="plain"
              onClick={handleNoteCancel}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
              取消
            </Button>
            <Button
              variant="solid"
              onClick={handleNoteSave}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ========================================
// 子组件：牌组列表视图
// ========================================

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

function DeckListView({
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

// ========================================
// 子组件：卡片列表视图
// ========================================

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

function CardListView({
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

      {/* 卡片列表 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }}>
        {cards.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "24px",
            color: "var(--orca-color-text-3)"
          }}>
            没有符合条件的卡片
          </div>
        ) : (
          <>
            {displayedCards.map((card, index) => (
              <CardListItem
                key={`${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}-${index}`}
                card={card}
                panelId={panelId}
                onCardClick={onCardClick}
                onCardReset={onCardReset}
                onCardDelete={onCardDelete}
              />
            ))}
            
            {/* 加载触发器 */}
            <div
              ref={loaderRef}
              style={{
                padding: "16px",
                textAlign: "center",
                color: "var(--orca-color-text-3)",
                fontSize: "13px"
              }}
            >
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

// ========================================
// 主组件
// ========================================

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
      const { getOrCreateReviewSessionBlock } = await import("../srs/reviewSessionManager")
      
      // 创建重复复习会话
      createRepeatReviewSession(cards, 0 as DbId, "children")
      
      // 获取复习会话块
      const reviewBlockId = await getOrCreateReviewSessionBlock(pluginName)
      
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
