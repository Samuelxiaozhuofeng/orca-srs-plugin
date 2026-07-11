/**
 * 当前阅读队列抽屉
 */

import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { formatIRCardTypeLabel } from "./irLibraryFilters"
import { useIRDialogFocus } from "./useIRDialogFocus"

type Props = {
  open: boolean
  queue: IRCard[]
  currentIndex: number
  titleMap: Record<string, string>
  onClose: () => void
}

export default function IRQueueDrawer({
  open,
  queue,
  currentIndex,
  titleMap,
  onClose
}: Props) {
  const dialogRef = useIRDialogFocus(open, onClose)
  if (!open) return null

  return (
    <div className="ir-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        ref={dialogRef}
        className="ir-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="阅读队列"
        tabIndex={-1}
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        <div className="ir-drawer__header">
          <div className="ir-drawer__title">阅读队列（{queue.length}）</div>
          <button
            type="button"
            className="ir-icon-btn"
            aria-label="关闭队列"
            title="关闭"
            onClick={onClose}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div className="ir-drawer__body">
          {queue.length === 0 ? (
            <div className="ir-drawer__hint">当前没有阅读队列</div>
          ) : (
            queue.map((card, index) => {
              const title =
                titleMap[String(card.id)] ||
                (orca.state.blocks?.[card.id] as { text?: string } | undefined)?.text ||
                `#${card.id}`
              const isCurrent = index === currentIndex
              return (
                <div
                  key={card.id}
                  className={`ir-queue-item${isCurrent ? " ir-queue-item--current" : ""}`}
                >
                  <div className="ir-queue-item__title">
                    {isCurrent ? "▸ " : `${index + 1}. `}{title}
                  </div>
                  <div className="ir-queue-item__meta">
                    {formatIRCardTypeLabel(card.cardType)}
                    {card.sourceBookTitle ? ` · ${card.sourceBookTitle}` : ""}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}
