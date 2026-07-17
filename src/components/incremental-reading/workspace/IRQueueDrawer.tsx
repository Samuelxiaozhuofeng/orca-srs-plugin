/**
 * 当前阅读队列抽屉
 */

import type { IRSessionEntry } from "../../../srs/incremental-reading/irMixedQueuePolicy"
import { formatIRCardSourceLabel, formatIRCardTypeLabel } from "./irLibraryFilters"
import { resolveBlockDisplayTitle } from "./resolveBlockDisplayTitle"
import { useIRDialogFocus } from "./useIRDialogFocus"

type Props = {
  open: boolean
  queue: IRSessionEntry[]
  currentIndex: number
  titleMap: Record<string, string>
  onClose: () => void
}

function entryTitle(entry: IRSessionEntry, titleMap: Record<string, string>): string {
  if (entry.kind === "review") {
    const block = orca.state.blocks?.[entry.card.id] as { aliases?: string[]; text?: string } | undefined
    let label =
      resolveBlockDisplayTitle(block, "") ||
      entry.card.front ||
      `#${entry.card.id}`
    if (entry.card.clozeNumber) label += ` [c${entry.card.clozeNumber}]`
    if (entry.card.directionType) {
      label += ` [${entry.card.directionType === "forward" ? "→" : "←"}]`
    }
    return label
  }
  const mapped = titleMap[String(entry.card.id)]
  if (mapped) return mapped
  const block = orca.state.blocks?.[entry.card.id] as { aliases?: string[]; text?: string } | undefined
  return resolveBlockDisplayTitle(block, `#${entry.card.id}`)
}

function entryTypeLabel(entry: IRSessionEntry): string {
  if (entry.kind === "review") return "复习卡"
  return formatIRCardTypeLabel(entry.card.cardType)
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
          <div className="ir-drawer__title">会话队列（{queue.length}）</div>
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
            <div className="ir-drawer__hint">当前没有会话队列</div>
          ) : (
            queue.map((entry, index) => {
              const title = entryTitle(entry, titleMap)
              const isCurrent = index === currentIndex
              return (
                <div
                  key={entry.key}
                  className={`ir-queue-item${isCurrent ? " ir-queue-item--current" : ""}`}
                >
                  <div className="ir-queue-item__title">
                    {isCurrent ? "▸ " : `${index + 1}. `}{title}
                  </div>
                  <div className="ir-queue-item__meta">
                    {entryTypeLabel(entry)}
                    {entry.kind === "reading" && formatIRCardSourceLabel(entry.card) !== "—"
                      ? ` · ${formatIRCardSourceLabel(entry.card)}`
                      : ""}
                    {entry.kind === "review" && entry.card.deck ? ` · ${entry.card.deck}` : ""}
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
