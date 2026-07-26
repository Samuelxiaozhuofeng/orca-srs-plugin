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

import {
  applyHardCap,
  DIFFICULT_CARDS_HARD_CAP,
  DIFFICULT_CARDS_PAGE_SIZE,
  pageSlice
} from "./difficultCardsPaging"

const { useState, useEffect, useCallback, useMemo, useRef } = window.React
const { Button } = orca.components

export { DIFFICULT_CARDS_HARD_CAP, DIFFICULT_CARDS_PAGE_SIZE }

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

/**
 * 困难原因 → 语义修饰后缀（视觉在 `flashcard-home.css` 的 Difficult cards 小节）。
 * 颜色一律走设计令牌，不再返回硬编码十六进制。
 */
function getDifficultReasonTone(
  reason: DifficultReason
): "again" | "lapses" | "difficulty" | "multiple" {
  switch (reason) {
    case "high_again_rate":
      return "again"
    case "high_lapses":
      return "lapses"
    case "high_difficulty":
      return "difficulty"
    case "multiple":
      return "multiple"
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

  const tone = getDifficultReasonTone(reason)

  return (
    <div className="srs-difficult-card" onClick={handleClick}>
      {/* 困难原因标签 */}
      <div className="srs-difficult-card__header">
        <span className={`srs-difficult-badge srs-difficult-badge--${tone}`}>
          <i
            className={`ti ${getDifficultReasonIcon(reason)} srs-difficult-badge__icon`}
          />
          {getDifficultReasonText(reason)}
        </span>
        <span className="srs-difficult-card__deck">
          {card.deck}
        </span>
      </div>

      {/* 卡片内容预览 */}
      <div className="srs-difficult-card__preview">
        <SafeBlockPreview blockId={card.id} panelId={panelId} />
      </div>

      {/* 统计信息 */}
      <div className="srs-difficult-card__footer">
        <span className="srs-difficult-card__stat" title="最近10次复习中的Again次数">
          <i className="ti ti-x" />
          Again: {recentAgainCount}
        </span>
        <span className="srs-difficult-card__stat" title="总遗忘次数">
          <i className="ti ti-repeat" />
          遗忘: {totalLapses}
        </span>
        <span className="srs-difficult-card__stat" title="难度值 (1-10)">
          <i className="ti ti-flame" />
          难度: {difficulty.toFixed(1)}
        </span>
        {card.clozeNumber && (
          <span className="srs-card-badge srs-card-badge--meta">
            填空 c{card.clozeNumber}
          </span>
        )}
        {card.directionType && (
          <span className="srs-card-badge srs-card-badge--meta">
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
  const [displayCount, setDisplayCount] = useState(DIFFICULT_CARDS_PAGE_SIZE)
  const loaderRef = useRef<HTMLDivElement | null>(null)

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
    let list: DifficultCardInfo[]
    if (filter === "all") {
      list = difficultCards
    } else {
      list = difficultCards.filter((info: DifficultCardInfo) => {
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
    }
    return applyHardCap(list, DIFFICULT_CARDS_HARD_CAP)
  }, [difficultCards, filter])

  const totalMatching = useMemo(() => {
    if (filter === "all") return difficultCards.length
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
    }).length
  }, [difficultCards, filter])

  useEffect(() => {
    setDisplayCount(DIFFICULT_CARDS_PAGE_SIZE)
  }, [filter, filteredCards.length])

  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && displayCount < filteredCards.length) {
          setDisplayCount((prev: number) =>
            Math.min(prev + DIFFICULT_CARDS_PAGE_SIZE, filteredCards.length)
          )
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(loader)
    return () => observer.disconnect()
  }, [displayCount, filteredCards.length])

  const visibleCards = useMemo(
    () => pageSlice(filteredCards, displayCount),
    [filteredCards, displayCount]
  )

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

  // 处理开始复习（对当前筛选结果；受硬上限约束）
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
      <div className="srs-flash-home-state srs-flash-home-state--loading">
        加载中...
      </div>
    )
  }

  return (
    <div className="srs-difficult-cards">
      {/* 头部 */}
      <div className="srs-difficult-cards__header">
        <Button variant="plain" onClick={onBack} className="srs-difficult-cards__back">
          ← 返回
        </Button>
        <div className="srs-difficult-cards__title">
          <i className="ti ti-alert-triangle srs-difficult-cards__title-icon" />
          困难卡片
          <span className="srs-difficult-cards__count">
            ({difficultCards.length})
          </span>
        </div>
        {filteredCards.length > 0 && (
          <Button
            variant="solid"
            onClick={handleStartReview}
            className="srs-difficult-cards__review"
          >
            复习困难卡片
          </Button>
        )}
      </div>

      {/* 说明文字 */}
      <div className="srs-difficult-cards__intro">
        <p className="srs-difficult-cards__intro-lead">
          困难卡片是指经常遗忘或难度较高的卡片。系统会自动识别以下类型：
        </p>
        <ul className="srs-difficult-cards__intro-list">
          <li><span className="srs-difficult-reason--again">频繁遗忘</span>：最近10次复习中按了3次以上 Again</li>
          <li><span className="srs-difficult-reason--lapses">遗忘次数多</span>：总遗忘次数达到3次以上</li>
          <li><span className="srs-difficult-reason--difficulty">难度较高</span>：难度值达到7以上</li>
        </ul>
      </div>

      {/* 筛选标签 */}
      <div className="srs-difficult-cards__filters">
        {[
          { key: "all" as FilterType, label: "全部" },
          { key: "high_again_rate" as FilterType, label: "频繁遗忘" },
          { key: "high_lapses" as FilterType, label: "遗忘次数多" },
          { key: "high_difficulty" as FilterType, label: "难度较高" }
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={
              filter === tab.key
                ? "srs-filter-chip srs-filter-chip--active"
                : "srs-filter-chip"
            }
          >
            {tab.label} ({stats[tab.key]})
          </button>
        ))}
      </div>

      {/* 卡片列表 */}
      <div className="srs-card-list-frame">
        {filteredCards.length === 0 ? (
          <div className="srs-difficult-cards__empty">
            <i className="ti ti-mood-smile srs-difficult-cards__empty-icon" />
            <div className="srs-difficult-cards__empty-title">
              {filter === "all" ? "太棒了！没有困难卡片" : "没有符合条件的困难卡片"}
            </div>
            <div className="srs-difficult-cards__empty-hint">
              继续保持良好的复习习惯
            </div>
          </div>
        ) : (
          <>
            {visibleCards.map((info: DifficultCardInfo, index: number) => (
              <DifficultCardItem
                key={`${info.card.id}-${info.card.clozeNumber || 0}-${info.card.directionType || "basic"}-${info.card.listItemId || 0}-${index}`}
                info={info}
                panelId={panelId}
                onCardClick={handleCardClick}
              />
            ))}
            {displayCount < filteredCards.length ? (
              <div ref={loaderRef} className="srs-card-list-loader">
                滚动加载更多（已显示 {displayCount}/{filteredCards.length}）
              </div>
            ) : null}
            {totalMatching > DIFFICULT_CARDS_HARD_CAP ? (
              <div className="srs-difficult-cards__cap">
                仅显示前 {DIFFICULT_CARDS_HARD_CAP} 张困难卡片（共 {totalMatching} 张匹配）。请用筛选缩小范围。
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
