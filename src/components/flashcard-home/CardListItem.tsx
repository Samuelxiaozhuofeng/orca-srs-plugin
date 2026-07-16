import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import SafeBlockPreview from "../SafeBlockPreview"

const { Button } = orca.components

type CardListItemProps = {
  card: ReviewCard
  panelId: string
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
}

export default function CardListItem({ card, panelId, onCardClick, onCardReset, onCardDelete }: CardListItemProps) {
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
