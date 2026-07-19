import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import SafeBlockPreview from "../SafeBlockPreview"
import CardFrame from "./CardFrame"
import {
  formatDueDate,
  formatInterval,
  formatNextReviewDate,
  getCardDueStatus
} from "./cardStatus"

const { Button } = orca.components

type CardListItemProps = {
  card: ReviewCard
  panelId: string
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
}

function statusBadgeClass(status: ReturnType<typeof getCardDueStatus>): string {
  switch (status) {
    case "new":
      return "srs-card-badge srs-card-badge--new"
    case "today":
      return "srs-card-badge srs-card-badge--today"
    case "backlog":
      return "srs-card-badge srs-card-badge--backlog"
    case "future":
      return "srs-card-badge srs-card-badge--future"
    default:
      return "srs-card-badge srs-card-badge--meta"
  }
}

function statusBadgeLabel(card: ReviewCard, status: ReturnType<typeof getCardDueStatus>): string {
  if (status === "new") return "新卡"
  return formatDueDate(card.srs.due)
}

export default function CardListItem({
  card,
  panelId,
  onCardClick,
  onCardReset,
  onCardDelete
}: CardListItemProps) {
  const status = getCardDueStatus(card)
  const resets = card.srs.resets ?? 0

  const handleGoToClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardClick(card.id)
  }

  const handleResetClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardReset(card)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardDelete(card)
  }

  return (
    <CardFrame status={status}>
      <div className="srs-card-frame__header">
        <div className="srs-card-frame__header-main">
          <orca.components.BlockBreadcrumb blockId={card.id} />
        </div>
        <div className="srs-card-frame__type-badges">
          {card.clozeNumber != null && card.clozeNumber > 0 && (
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

      <div className="srs-card-frame__preview">
        <SafeBlockPreview blockId={card.id} panelId={panelId} />
      </div>

      <div className="srs-card-frame__footer">
        <div className="srs-card-frame__meta">
          <span className={statusBadgeClass(status)}>
            {statusBadgeLabel(card, status)}
          </span>
          {!card.isNew && (
            <>
              <span className="srs-card-badge srs-card-badge--meta">
                下次 {formatNextReviewDate(card.srs.due)}
              </span>
              <span className="srs-card-badge srs-card-badge--meta">
                间隔 {formatInterval(card.srs.interval)}
              </span>
            </>
          )}
          {resets > 0 && (
            <span className="srs-card-badge srs-card-badge--warn">
              重置 {resets} 次
            </span>
          )}
        </div>

        <div className="srs-card-frame__actions">
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
    </CardFrame>
  )
}
