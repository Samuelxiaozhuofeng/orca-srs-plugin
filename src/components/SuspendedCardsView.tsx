/**
 * 已暂停卡片视图（Flash Home 次级视图）
 *
 * 列出 include-suspended 收集得到的暂停行（整块 suspend 展开行 + 变体级 suspend 行），
 * 支持逐行「取消暂停」。恢复成功由父组件移除该行并刷新正常卡数据 / 今日统计 / 缓存；
 * 失败时行保留并显示可见错误，绝不伪装成功。
 *
 * 本视图不提供复习 / 重置 / 删除 / 批量 TTS。
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "../srs/types"
import { cardKeyFromReviewCard } from "../srs/cardIdentity"
import SafeBlockPreview from "./SafeBlockPreview"

const { useState } = window.React
const { Button } = orca.components

export type SuspendedCardsViewProps = {
  cards: ReviewCard[]
  panelId: string
  pluginName: string
  onBack: () => void
  /** 取消暂停；成功由父组件移除行，失败抛错（本视图显示行级错误） */
  onUnsuspend: (card: ReviewCard) => Promise<void>
}

// ---------------------------------------------------------------------------
// 纯函数（可单测）
// ---------------------------------------------------------------------------

/** 按稳定 cardKey 从列表中移除一张卡（恢复成功后行立即消失） */
export function removeCardByKey(
  cards: readonly ReviewCard[],
  key: string
): ReviewCard[] {
  return cards.filter((card) => cardKeyFromReviewCard(card) !== key)
}

/** 行级错误表更新：message 为 null 时清除该行错误 */
export function applyRowError(
  errors: Record<string, string>,
  key: string,
  message: string | null
): Record<string, string> {
  if (message == null) {
    if (!errors[key]) return errors
    const next = { ...errors }
    delete next[key]
    return next
  }
  if (errors[key] === message) return errors
  return { ...errors, [key]: message }
}

// ---------------------------------------------------------------------------
// 行内容
// ---------------------------------------------------------------------------

function variantLabel(card: ReviewCard): string | null {
  if (card.cardType === "image-occlusion" && card.clozeNumber) {
    return `遮罩 c${card.clozeNumber}`
  }
  if (card.cardType === "cloze" && card.clozeNumber) {
    return `填空 c${card.clozeNumber}`
  }
  if (card.directionType) {
    return card.directionType === "forward" ? "正向" : "反向"
  }
  if (card.cardType === "list") {
    return "列表卡"
  }
  return null
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export default function SuspendedCardsView({
  cards,
  panelId,
  pluginName,
  onBack,
  onUnsuspend
}: SuspendedCardsViewProps) {
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const handleUnsuspend = async (card: ReviewCard) => {
    const key = cardKeyFromReviewCard(card)
    if (busyKey) return
    setBusyKey(key)
    try {
      await onUnsuspend(card)
      // 成功：父组件已移除该行；同时清掉可能的旧错误
      setRowErrors((prev: Record<string, string>) => applyRowError(prev, key, null))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[${pluginName}] 取消暂停失败:`, error)
      setRowErrors((prev: Record<string, string>) => applyRowError(prev, key, message))
    } finally {
      setBusyKey(null)
    }
  }

  const handleCardClick = (cardId: DbId) => {
    orca.nav.openInLastPanel("block", { blockId: cardId })
  }

  return (
    <div className="srs-suspended-cards">
      <div className="srs-suspended-cards__header">
        <Button
          variant="plain"
          onClick={onBack}
          className="srs-suspended-cards__back"
        >
          ← 返回
        </Button>
        <div className="srs-suspended-cards__title">
          <i className="ti ti-player-pause srs-suspended-cards__title-icon" />
          已暂停
          <span className="srs-suspended-cards__count">({cards.length})</span>
        </div>
      </div>

      <div className="srs-suspended-cards__intro">
        已暂停的卡片不会出现在复习队列中。恢复某一行只会恢复该变体，
        不影响同块其它卡片。
      </div>

      <div className="srs-card-list-frame">
        {cards.length === 0 ? (
          <div className="srs-suspended-cards__empty">
            <i className="ti ti-mood-smile srs-suspended-cards__empty-icon" />
            <div className="srs-suspended-cards__empty-title">没有已暂停的卡片</div>
            <div className="srs-suspended-cards__empty-hint">
              在复习中按「暂停」的卡片会出现在这里
            </div>
          </div>
        ) : (
          cards.map((card) => {
            const key = cardKeyFromReviewCard(card)
            const label = variantLabel(card)
            const error = rowErrors[key]
            const busy = busyKey === key
            return (
              <div key={key} className="srs-suspended-card">
                <div
                  className="srs-suspended-card__main"
                  onClick={() => handleCardClick(card.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      handleCardClick(card.id)
                    }
                  }}
                >
                  <div className="srs-suspended-card__preview">
                    <SafeBlockPreview blockId={card.id} panelId={panelId} />
                  </div>
                  <div className="srs-suspended-card__meta">
                    <span className="srs-suspended-card__deck">{card.deck}</span>
                    {label ? (
                      <span className="srs-card-badge srs-card-badge--meta">
                        {label}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="srs-suspended-card__actions">
                  {error ? (
                    <div className="srs-suspended-card__error" role="alert">
                      <i className="ti ti-alert-triangle" />
                      {error}
                    </div>
                  ) : null}
                  <Button
                    variant="solid"
                    onClick={busy ? undefined : () => void handleUnsuspend(card)}
                    className={busy ? "srs-btn-disabled" : undefined}
                  >
                    <i className="ti ti-player-play srs-suspended-card__unsuspend-icon" />
                    {busy ? "恢复中…" : "取消暂停"}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
