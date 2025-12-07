/**
 * SRS 卡片浏览器组件
 * 功能：
 * - 显示所有 SRS 卡片列表
 * - 支持按到期状态筛选（全部、已到期、今天到期、未来、新卡）
 * - 显示卡片基础信息（题目、上次复习时间、下次复习时间）
 * - 点击卡片跳转到对应块
 */

import type { Block, DbId, Repr } from "../orca.d.ts"

const { useState, useEffect, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { ModalOverlay, Button } = orca.components

// 扩展 Block 类型以包含 _repr 属性
type BlockWithRepr = Block & { _repr?: Repr }

/**
 * 筛选类型
 */
type FilterType = "all" | "overdue" | "today" | "future" | "new"

/**
 * 卡片信息（用于浏览器显示）
 */
type CardInfo = {
  blockId: DbId
  front: string
  lastReviewed: Date | null
  due: Date
  reps: number
}

type SrsCardBrowserProps = {
  onClose: () => void
}

/**
 * 格式化日期时间
 */
function formatDateTime(date: Date | null): string {
  if (!date) return "从未复习"

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")

  return `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 获取今天的开始和结束时间
 */
function getTodayRange(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  return { start, end }
}

/**
 * 判断卡片属于哪个筛选类别
 */
function getCardFilterType(card: CardInfo): FilterType {
  const { start: todayStart, end: todayEnd } = getTodayRange()

  // 新卡：从未复习
  if (!card.lastReviewed || card.reps === 0) {
    return "new"
  }

  // 已到期：due < 今天开始
  if (card.due < todayStart) {
    return "overdue"
  }

  // 今天到期：due 在今天范围内
  if (card.due >= todayStart && card.due <= todayEnd) {
    return "today"
  }

  // 未来到期：due > 今天结束
  return "future"
}

/**
 * 获取到期状态的颜色
 */
function getDueColor(filterType: FilterType): string {
  switch (filterType) {
    case "overdue":
      return "var(--orca-color-danger-7)"
    case "today":
      return "var(--orca-color-warning-7)"
    case "new":
      return "var(--orca-color-primary-7)"
    case "future":
      return "var(--orca-color-text-3)"
    default:
      return "var(--orca-color-text-1)"
  }
}

/**
 * SRS 卡片浏览器组件
 */
export default function SrsCardBrowser({ onClose }: SrsCardBrowserProps) {
  const { blocks } = useSnapshot(orca.state)
  const [currentFilter, setCurrentFilter] = useState<FilterType>("all")

  // 加载所有 SRS 卡片
  const allCards = useMemo<CardInfo[]>(() => {
    const cardList: CardInfo[] = []

    for (const blockId in blocks) {
      const block = blocks[blockId] as BlockWithRepr | undefined
      if (!block) continue

      // 检查是否是 SRS 卡片
      if (block._repr?.type !== "srs.card") continue

      // 从块属性中读取 SRS 状态
      const lastReviewedProp = block.properties?.find((p) => p.name === "srs.lastReviewed")
      const dueProp = block.properties?.find((p) => p.name === "srs.due")
      const repsProp = block.properties?.find((p) => p.name === "srs.reps")

      const lastReviewed = lastReviewedProp?.value ? new Date(lastReviewedProp.value as string) : null
      const due = dueProp?.value ? new Date(dueProp.value as string) : new Date()
      const reps = (repsProp?.value as number) ?? 0

      cardList.push({
        blockId: block.id,
        front: (block._repr as any).front || "（无题目）",
        lastReviewed,
        due,
        reps,
      })
    }

    // 按下次复习时间排序（最早到期的在前）
    cardList.sort((a, b) => a.due.getTime() - b.due.getTime())

    return cardList
  }, [blocks])

  // 根据筛选条件过滤卡片
  const filteredCards = useMemo(() => {
    if (currentFilter === "all") return allCards

    return allCards.filter((card: CardInfo) => getCardFilterType(card) === currentFilter)
  }, [allCards, currentFilter])

  // 处理卡片点击：跳转到对应块
  const handleCardClick = (blockId: DbId) => {
    // 使用 Orca API 跳转到块
    orca.nav.goTo("block", { blockId })

    // 关闭浏览器
    onClose()
  }

  return (
    <ModalOverlay visible={true} onClose={onClose}>
      <div
        style={{
          width: "600px",
          maxHeight: "80vh",
          backgroundColor: "var(--orca-color-bg-1)",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--orca-color-border-1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🃏</span>
            <span style={{ fontSize: "16px", fontWeight: 600 }}>SRS 卡片浏览器</span>
          </div>
          <Button variant="plain" onClick={onClose}>
            关闭
          </Button>
        </div>

        {/* 筛选标签栏 */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--orca-color-border-1)",
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <FilterButton
            label="全部"
            isActive={currentFilter === "all"}
            onClick={() => setCurrentFilter("all")}
            count={allCards.length}
          />
          <FilterButton
            label="已到期"
            isActive={currentFilter === "overdue"}
            onClick={() => setCurrentFilter("overdue")}
            count={allCards.filter((c: CardInfo) => getCardFilterType(c) === "overdue").length}
          />
          <FilterButton
            label="今天到期"
            isActive={currentFilter === "today"}
            onClick={() => setCurrentFilter("today")}
            count={allCards.filter((c: CardInfo) => getCardFilterType(c) === "today").length}
          />
          <FilterButton
            label="未来到期"
            isActive={currentFilter === "future"}
            onClick={() => setCurrentFilter("future")}
            count={allCards.filter((c: CardInfo) => getCardFilterType(c) === "future").length}
          />
          <FilterButton
            label="新卡"
            isActive={currentFilter === "new"}
            onClick={() => setCurrentFilter("new")}
            count={allCards.filter((c: CardInfo) => getCardFilterType(c) === "new").length}
          />
        </div>

        {/* 卡片列表 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
          }}
        >
          {filteredCards.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--orca-color-text-3)",
                padding: "40px 20px",
              }}
            >
              没有找到卡片
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredCards.map((card: CardInfo) => {
                const filterType = getCardFilterType(card)
                const dueColor = getDueColor(filterType)

                return (
                  <div
                    key={card.blockId}
                    onClick={() => handleCardClick(card.blockId)}
                    style={{
                      padding: "12px",
                      border: "1px solid var(--orca-color-border-1)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      backgroundColor: "var(--orca-color-bg-2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--orca-color-primary-5)"
                      e.currentTarget.style.backgroundColor = "var(--orca-color-bg-3)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--orca-color-border-1)"
                      e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
                    }}
                  >
                    {/* 题目 */}
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        marginBottom: "8px",
                        color: "var(--orca-color-text-1)",
                      }}
                    >
                      {card.front}
                    </div>

                    {/* 复习信息 */}
                    <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
                      <div>上次复习：{formatDateTime(card.lastReviewed)}</div>
                      <div style={{ color: dueColor }}>
                        下次复习：{formatDateTime(card.due)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部统计 */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--orca-color-border-1)",
            fontSize: "12px",
            color: "var(--orca-color-text-3)",
            textAlign: "center",
          }}
        >
          共 {filteredCards.length} 张卡片
        </div>
      </div>
    </ModalOverlay>
  )
}

/**
 * 筛选按钮组件
 */
function FilterButton({
  label,
  isActive,
  onClick,
  count,
}: {
  label: string
  isActive: boolean
  onClick: () => void
  count: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "4px",
        backgroundColor: isActive ? "var(--orca-color-primary-5)" : "var(--orca-color-bg-2)",
        color: isActive ? "white" : "var(--orca-color-text-1)",
        fontSize: "12px",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--orca-color-bg-3)"
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        }
      }}
    >
      {label} ({count})
    </button>
  )
}
