/**
 * 卡片调度详情抽屉
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import {
  formatIRCardTypeLabel,
  formatIRDueLabel,
  formatIRImportanceLabel
} from "./irLibraryFilters"
import { useIRDialogFocus } from "./useIRDialogFocus"

const { Button } = orca.components

type Props = {
  open: boolean
  card: IRCard | null
  title: string
  onClose: () => void
  onStartReading: (cardId: DbId) => void
  onOpenInPanel: (cardId: DbId) => void
}

function formatDate(value: Date | null | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "—"
  return value.toLocaleString()
}

export default function IRDetailsDrawer({
  open,
  card,
  title,
  onClose,
  onStartReading,
  onOpenInPanel
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
        aria-label="卡片详情"
        tabIndex={-1}
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        <div className="ir-drawer__header">
          <div className="ir-drawer__title">卡片详情</div>
          <button
            type="button"
            className="ir-icon-btn"
            aria-label="关闭详情"
            title="关闭"
            onClick={onClose}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div className="ir-drawer__body">
          {!card ? (
            <div className="ir-drawer__hint">未选择卡片</div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
              <dl className="ir-details-kv">
                <dt>类型</dt>
                <dd>{formatIRCardTypeLabel(card.cardType)}</dd>
                <dt>到期</dt>
                <dd>{formatIRDueLabel(card)}（{formatDate(card.due)}）</dd>
                <dt>阶段</dt>
                <dd>{card.stage}</dd>
                <dt>重要性</dt>
                <dd>{formatIRImportanceLabel(card.priority)}（{card.priority}）</dd>
                <dt>间隔</dt>
                <dd>{card.intervalDays} 天</dd>
                <dt>推后次数</dt>
                <dd>{card.postponeCount}</dd>
                <dt>已读</dt>
                <dd>{card.readCount}</dd>
                <dt>最近动作</dt>
                <dd>{card.lastAction}</dd>
                <dt>来源书籍</dt>
                <dd>{card.sourceBookTitle || "—"}</dd>
                <dt>批次</dt>
                <dd>{card.batchId || "—"}</dd>
                <dt>上次阅读</dt>
                <dd>{formatDate(card.lastRead)}</dd>
                <dt>Block ID</dt>
                <dd>{String(card.id)}</dd>
              </dl>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button tabIndex={0} variant="solid" onClick={() => onStartReading(card.id)}>
                  开始阅读
                </Button>
                <Button tabIndex={0} variant="outline" onClick={() => onOpenInPanel(card.id)}>
                  在面板打开
                </Button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
