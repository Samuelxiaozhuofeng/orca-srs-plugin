import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import type { TtsBatchItemStatus } from "../../srs/tts/ttsBatch"
import SafeBlockPreview from "../SafeBlockPreview"
import CardFrame from "./CardFrame"
import {
  formatDueDate,
  formatInterval,
  formatNextReviewDate,
  getCardDueStatus
} from "./cardStatus"

const { Button, ConfirmBox } = orca.components

type CardListItemProps = {
  card: ReviewCard
  panelId: string
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
  /** 批量 TTS 模式 */
  batchMode?: boolean
  selectable?: boolean
  selected?: boolean
  skipReason?: string
  batchStatus?: TtsBatchItemStatus
  batchError?: string
  onToggleSelect?: () => void
  /**
   * 管理多选（与 TTS 选择互斥展示）。
   * 普通模式展示管理复选框；TTS 模式走 batchMode 选择。
   */
  manageSelect?: boolean
  manageSelected?: boolean
  /** 批量写入进行中时禁止改选择 */
  manageSelectDisabled?: boolean
  /** 批量写入进行中时禁止单卡操作 */
  actionsDisabled?: boolean
  onToggleManageSelect?: () => void
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
  if (status === "new") {
    // 新卡也可能 due 在未来（IR Item 分散首 due）；badge 仍标「新卡」
    return "新卡"
  }
  return formatDueDate(card.srs.due)
}

/**
 * 删除确认文案：区分 cloze / direction / list / IO / 普通卡。
 * 删除 = 结构恢复为普通文本 + 清除复习进度（暂停由独立「暂停」承接）。
 * Cloze 额外提示：挖空文本的加粗/链接等格式未保存，无法恢复。
 */
export function deleteConfirmText(
  card: Pick<ReviewCard, "clozeNumber" | "directionType" | "cardType">
): string {
  if (card.cardType === "image-occlusion" && card.clozeNumber != null && card.clozeNumber > 0) {
    return `确定删除此遮罩（c${card.clozeNumber}）？将移除该编号的遮罩区域与 SRS 数据；同块其它遮罩不受影响，仅当它是本块最后一个卡片变体时才移除 #card。不可撤销。`
  }
  if (card.clozeNumber != null && card.clozeNumber > 0) {
    return `确定删除此填空（c${card.clozeNumber}）？将恢复为普通文本并删除复习进度；同块其它填空/卡片不受影响，仅当它是本块最后一个卡片变体时才移除 #card。原挖空文本的格式（加粗、链接等）未被保存，无法恢复。不可撤销。`
  }
  if (card.directionType) {
    const label = card.directionType === "forward" ? "正向" : "反向"
    return `确定删除此方向（${label}）？将恢复为普通文本并删除复习进度；同块另一方向不受影响，仅当它是本块最后一个卡片变体时才移除 #card。不可撤销。`
  }
  if (card.cardType === "list") {
    return "确定删除此列表卡？将恢复为普通文本并删除复习进度（含所有直接子条目上的进度），并移除 #card。不可撤销。"
  }
  return "确定删除此卡片？将恢复为普通文本并删除复习进度，并移除 #card。不可撤销。"
}

function batchStatusLabel(status?: TtsBatchItemStatus): string | null {
  switch (status) {
    case "pending":
      return "待生成"
    case "running":
      return "生成中"
    case "success":
      return "已生成"
    case "skipped":
      return "已跳过"
    case "failed":
      return "失败"
    case "cancelled":
      return "已取消"
    default:
      return null
  }
}

export default function CardListItem({
  card,
  panelId,
  onCardClick,
  onCardReset,
  onCardDelete,
  batchMode = false,
  selectable = false,
  selected = false,
  skipReason,
  batchStatus,
  batchError,
  onToggleSelect,
  manageSelect = false,
  manageSelected = false,
  manageSelectDisabled = false,
  actionsDisabled = false,
  onToggleManageSelect
}: CardListItemProps) {
  const status = getCardDueStatus(card)
  const resets = card.srs.resets ?? 0
  const isSuspended = !!card.isSuspended
  const isPending = !!card.isPending && !isSuspended

  const handleGoToClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCardClick(card.id)
  }

  const batchLabel = batchStatusLabel(batchStatus)

  return (
    <CardFrame status={status}>
      <div className="srs-card-frame__header">
        <div className="srs-card-frame__header-main">
          {batchMode && (
            <label
              className={`srs-tts-batch-check${
                selectable ? "" : " srs-tts-batch-check--disabled"
              }`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              title={
                selectable
                  ? selected
                    ? "取消选择"
                    : "选择此卡"
                  : skipReason ?? "不可选"
              }
            >
              <input
                type="checkbox"
                checked={selectable && selected}
                disabled={!selectable}
                onChange={() => onToggleSelect?.()}
                aria-label={selectable ? "选择此卡生成语音" : skipReason}
              />
            </label>
          )}
          {manageSelect && !batchMode && (
            <label
              className={`srs-manage-select-check${
                manageSelectDisabled ? " srs-manage-select-check--disabled" : ""
              }`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              title={
                manageSelectDisabled
                  ? "批量操作进行中"
                  : manageSelected
                    ? "取消选择"
                    : "选择此卡"
              }
            >
              <input
                type="checkbox"
                checked={manageSelected}
                disabled={manageSelectDisabled}
                onChange={() => {
                  if (manageSelectDisabled) return
                  onToggleManageSelect?.()
                }}
                aria-label="选择此卡进行批量管理"
              />
            </label>
          )}
          <orca.components.BlockBreadcrumb blockId={card.id} />
        </div>
        <div className="srs-card-frame__type-badges">
          {isSuspended && (
            <span className="srs-card-badge srs-card-badge--suspended">
              已暂停
            </span>
          )}
          {isPending && (
            <span className="srs-card-badge srs-card-badge--pending">
              待激活
            </span>
          )}
          {card.clozeNumber != null && card.clozeNumber > 0 && (
            <span className="srs-card-badge srs-card-badge--meta">
              {card.cardType === "image-occlusion"
                ? `遮罩 c${card.clozeNumber}`
                : `填空 c${card.clozeNumber}`}
            </span>
          )}
          {card.directionType && (
            <span className="srs-card-badge srs-card-badge--meta">
              {card.directionType === "forward" ? "正向" : "反向"}
            </span>
          )}
          {batchMode && skipReason && (
            <span className="srs-card-badge srs-card-badge--meta" title={skipReason}>
              {skipReason}
            </span>
          )}
          {batchLabel && (
            <span
              className={`srs-card-badge srs-card-badge--meta srs-tts-batch-status srs-tts-batch-status--${batchStatus}`}
              title={batchError}
            >
              {batchLabel}
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
          {card.isNew ? (
            <span className="srs-card-badge srs-card-badge--meta">
              首次 {formatDueDate(card.srs.due)}
            </span>
          ) : (
            <>
              <span className="srs-card-badge srs-card-badge--meta">
                下次 {formatNextReviewDate(card.srs.due)}
              </span>
              <span className="srs-card-badge srs-card-badge--meta">
                间隔 {formatInterval(card.srs.interval)}
              </span>
            </>
          )}
          {card.deck && (
            <span className="srs-card-badge srs-card-badge--meta" title="来源牌组">
              {card.deck}
            </span>
          )}
          {resets > 0 && (
            <span className="srs-card-badge srs-card-badge--warn">
              重置 {resets} 次
            </span>
          )}
        </div>

        <div className="srs-card-frame__actions">
          <ConfirmBox
            text={deleteConfirmText(card)}
            onConfirm={(_e: unknown, close: () => void) => {
              if (actionsDisabled) return
              onCardDelete(card)
              close()
            }}
          >
            {(open) => (
              <Button
                variant="plain"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (actionsDisabled) return
                  open(e)
                }}
                className={`srs-card-action srs-card-action--danger${
                  actionsDisabled ? " srs-btn-disabled" : ""
                }`}
                title={
                  card.cardType === "image-occlusion" && card.clozeNumber
                    ? "删除此遮罩（区域与 SRS 数据；最后一个变体时移除 Card 标记）"
                    : card.clozeNumber || card.directionType
                      ? "删除此变体（恢复普通文本并删除复习进度；最后一个变体时移除 Card 标记）"
                      : "删除卡片（恢复普通文本、删除复习进度并移除 Card 标记）"
                }
              >
                <i className="ti ti-trash srs-card-action__icon" />
                删除
              </Button>
            )}
          </ConfirmBox>

          <ConfirmBox
            text="确定将此卡片重置为新卡？当前进度会丢失。"
            onConfirm={(_e: unknown, close: () => void) => {
              if (actionsDisabled) return
              onCardReset(card)
              close()
            }}
          >
            {(open) => (
              <Button
                variant="plain"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (actionsDisabled) return
                  open(e)
                }}
                className={`srs-card-action srs-card-action--warn${
                  actionsDisabled ? " srs-btn-disabled" : ""
                }`}
                title="重置卡片为新卡状态"
              >
                <i className="ti ti-refresh srs-card-action__icon" />
                重置
              </Button>
            )}
          </ConfirmBox>

          <Button
            variant="plain"
            onClick={actionsDisabled ? undefined : handleGoToClick}
            className={`srs-card-action${actionsDisabled ? " srs-btn-disabled" : ""}`}
            title="在右侧面板打开编辑"
          >
            <i className="ti ti-external-link srs-card-action__icon" />
            跳转
          </Button>
        </div>
      </div>
    </CardFrame>
  )
}
