/**
 * 困难卡片视图组件
 * 
 * 显示困难卡片列表，支持：
 * - 按困难原因分类显示
 * - 一键复习困难卡片
 * - 查看卡片详情
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "../srs/types"
import type { DifficultCardInfo, DifficultReason } from "../srs/difficultCardsManager"
import SafeBlockPreview from "./SafeBlockPreview"

const { useState, useEffect, useCallback, useMemo } = window.React
const { Button } = orca.components

// ========================================
// 类型定义
// ========================================

type DifficultCardsViewProps = {
  panelId: string
  pluginName: string
  onBack: () => void
  onStartReview: (cards: ReviewCard[]) => void
}

type FilterType = "all" | "high_again_rate" | "high_lapses" | "high_difficulty"

// ========================================
// 工具函数
// ========================================

function getDifficultReasonText(reason: DifficultReason): string {
  switch (reason) {
    case "high_again_rate":
      return "频繁遗忘"
    case "high_lapses":
      return "遗忘次数多"
    case "high_difficulty":
      return "难度较高"
    case "multiple":
      return "多重困难"
  }
}

function getDifficultReasonColor(reason: DifficultReason): string {
  switch (reason) {
    case "high_again_rate":
      return "#ef4444"  // 红色
    case "high_lapses":
      return "#f59e0b"  // 橙色
    case "high_difficulty":
      return "#8b5cf6"  // 紫色
    case "multiple":
      return "#dc2626"  // 深红色
  }
}

function getDifficultReasonIcon(reason: DifficultReason): string {
  switch (reason) {
    case "high_again_rate":
      return "ti-alert-triangle"
    case "high_lapses":
      return "ti-repeat"
    case "high_difficulty":
      return "ti-flame"
    case "multiple":
      return "ti-alert-octagon"
  }
}

// ========================================
// 子组件：困难卡片项
// ========================================

type DifficultCardItemProps = {
  info: DifficultCardInfo
  panelId: string
  onCardClick: (cardId: DbId) => void
}

function DifficultCardItem({ info, panelId, onCardClick }: DifficultCardItemProps) {
  const { card, reason, recentAgainCount, totalLapses, difficulty } = info

  const handleClick = () => {
    onCardClick(card.id)
  }

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
        cursor: "pointer",
        transition: "all 0.2s ease"
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        e.currentTarget.style.borderColor = "var(--orca-color-primary-4)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
        e.currentTarget.style.borderColor = "var(--orca-color-border-1)"
      }}
    >
      {/* 困难原因标签 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 500,
          backgroundColor: `${getDifficultReasonColor(reason)}20`,
          color: getDifficultReasonColor(reason)
        }}>
          <i className={`ti ${getDifficultReasonIcon(reason)}`} style={{ fontSize: "12px" }} />
          {getDifficultReasonText(reason)}
        </span>
        <span style={{
          fontSize: "12px",
          color: "var(--orca-color-text-3)"
        }}>
          {card.deck}
        </span>
      </div>

      {/* 卡片内容预览 */}
      <div style={{ minHeight: "24px" }}>
        <SafeBlockPreview blockId={card.id} panelId={panelId} />
      </div>

      {/* 统计信息 */}
      <div style={{
        display: "flex",
        gap: "16px",
        fontSize: "12px",
        color: "var(--orca-color-text-3)",
        borderTop: "1px solid var(--orca-color-border-1)",
        paddingTop: "8px"
      }}>
        <span title="最近10次复习中的Again次数">
          <i className="ti ti-x" style={{ marginRight: "2px" }} />
          Again: {recentAgainCount}
        </span>
        <span title="总遗忘次数">
          <i className="ti ti-repeat" style={{ marginRight: "2px" }} />
          遗忘: {totalLapses}
        </span>
        <span title="难度值 (1-10)">
          <i className="ti ti-flame" style={{ marginRight: "2px" }} />
          难度: {difficulty.toFixed(1)}
        </span>
        {card.clozeNumber && (
          <span style={{ color: "var(--orca-color-primary-5)" }}>
            填空 c{card.clozeNumber}
          </span>
        )}
        {card.directionType && (
          <span style={{ color: card.directionType === "forward" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)" }}>
            {card.directionType === "forward" ? "正向" : "反向"}
          </span>
        )}
      </div>
    </div>
  )
}

// ========================================
// 主组件
// ========================================

export default function DifficultCardsView({
  panelId,
  pluginName,
  onBack,
  onStartReview
}: DifficultCardsViewProps) {
  const [difficultCards, setDifficultCards] = useState<DifficultCardInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>("all")

  // 加载困难卡片
  const loadDifficultCards = useCallback(async () => {
    setIsLoading(true)
    try {
      const { getDifficultCards } = await import("../srs/difficultCardsManager")
      const cards = await getDifficultCards(pluginName)
      setDifficultCards(cards)
    } catch (error) {
      console.error(`[${pluginName}] 加载困难卡片失败:`, error)
      orca.notify("error", "加载困难卡片失败", { title: "SRS" })
    } finally {
      setIsLoading(false)
    }
  }, [pluginName])

  useEffect(() => {
    void loadDifficultCards()
  }, [loadDifficultCards])

  // 筛选卡片
  const filteredCards = useMemo(() => {
    if (filter === "all") {
      return difficultCards
    }
    return difficultCards.filter((info: DifficultCardInfo) => {
      if (filter === "high_again_rate") {
        return info.reason === "high_again_rate" || info.reason === "multiple"
      }
      if (filter === "high_lapses") {
        return info.reason === "high_lapses" || info.reason === "multiple"
      }
      if (filter === "high_difficulty") {
        return info.reason === "high_difficulty" || info.reason === "multiple"
      }
      return true
    })
  }, [difficultCards, filter])

  // 统计各类型数量
  const stats = useMemo(() => {
    const result = {
      all: difficultCards.length,
      high_again_rate: 0,
      high_lapses: 0,
      high_difficulty: 0
    }
    for (const info of difficultCards) {
      if (info.reason === "high_again_rate" || info.reason === "multiple") {
        result.high_again_rate++
      }
      if (info.reason === "high_lapses" || info.reason === "multiple") {
        result.high_lapses++
      }
      if (info.reason === "high_difficulty" || info.reason === "multiple") {
        result.high_difficulty++
      }
    }
    return result
  }, [difficultCards])

  // 处理开始复习
  const handleStartReview = useCallback(() => {
    const cards = filteredCards.map((info: DifficultCardInfo) => info.card)
    if (cards.length === 0) {
      orca.notify("info", "没有困难卡片需要复习", { title: "SRS" })
      return
    }
    onStartReview(cards)
  }, [filteredCards, onStartReview])

  // 处理点击卡片
  const handleCardClick = useCallback((cardId: DbId) => {
    orca.nav.openInLastPanel("block", { blockId: cardId })
  }, [])

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "200px",
        color: "var(--orca-color-text-2)"
      }}>
        加载中...
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <i className="ti ti-alert-triangle" style={{ color: "#ef4444" }} />
          困难卡片
          <span style={{
            fontSize: "14px",
            fontWeight: 400,
            color: "var(--orca-color-text-3)"
          }}>
            ({difficultCards.length})
          </span>
        </div>
        {filteredCards.length > 0 && (
          <Button
            variant="solid"
            onClick={handleStartReview}
            style={{ fontSize: "13px", padding: "6px 12px" }}
          >
            复习困难卡片
          </Button>
        )}
      </div>

      {/* 说明文字 */}
      <div style={{
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        lineHeight: 1.6
      }}>
        <p style={{ margin: 0 }}>
          困难卡片是指经常遗忘或难度较高的卡片。系统会自动识别以下类型：
        </p>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
          <li><span style={{ color: "#ef4444" }}>频繁遗忘</span>：最近10次复习中按了3次以上 Again</li>
          <li><span style={{ color: "#f59e0b" }}>遗忘次数多</span>：总遗忘次数达到3次以上</li>
          <li><span style={{ color: "#8b5cf6" }}>难度较高</span>：难度值达到7以上</li>
        </ul>
      </div>

      {/* 筛选标签 */}
      <div style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        {[
          { key: "all" as FilterType, label: "全部", color: "var(--orca-color-text-2)" },
          { key: "high_again_rate" as FilterType, label: "频繁遗忘", color: "#ef4444" },
          { key: "high_lapses" as FilterType, label: "遗忘次数多", color: "#f59e0b" },
          { key: "high_difficulty" as FilterType, label: "难度较高", color: "#8b5cf6" }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              border: "1px solid",
              borderColor: filter === tab.key ? tab.color : "var(--orca-color-border-1)",
              backgroundColor: filter === tab.key ? `${tab.color}15` : "transparent",
              color: filter === tab.key ? tab.color : "var(--orca-color-text-2)",
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            {tab.label} ({stats[tab.key]})
          </button>
        ))}
      </div>

      {/* 卡片列表 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }}>
        {filteredCards.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "var(--orca-color-text-3)"
          }}>
            <i className="ti ti-mood-smile" style={{ fontSize: "48px", opacity: 0.5, display: "block", marginBottom: "12px" }} />
            <div style={{ fontSize: "15px", marginBottom: "8px" }}>
              {filter === "all" ? "太棒了！没有困难卡片" : "没有符合条件的困难卡片"}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.7 }}>
              继续保持良好的复习习惯
            </div>
          </div>
        ) : (
          filteredCards.map((info: DifficultCardInfo, index: number) => (
            <DifficultCardItem
              key={`${info.card.id}-${info.card.clozeNumber || 0}-${info.card.directionType || "basic"}-${index}`}
              info={info}
              panelId={panelId}
              onCardClick={handleCardClick}
            />
          ))
        )}
      </div>
    </div>
  )
}
