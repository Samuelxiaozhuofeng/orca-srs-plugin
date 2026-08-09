/**
 * 资料库高密度行
 * - 点标题 = 开始阅读；详情由行尾 ⓘ 常驻按钮进入
 * - 「现在读 / 改到今天」hover·focus-within 时显形（触屏常显）
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import {
  formatIRCardTypeLabel,
  formatIRCardSourceLabel,
  formatIRDueDate,
  formatIRImportanceLabel,
  formatIRStageLabel,
  getIRDueTone
} from "./irLibraryFilters"

type Props = {
  card: IRCard
  title: string
  selected: boolean
  canAdvanceLearn: boolean
  isAdvancing: boolean
  now: Date
  showSource?: boolean
  onToggleSelect: (cardId: DbId) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
}

export default function IRLibraryRow({
  card,
  title,
  selected,
  canAdvanceLearn,
  isAdvancing,
  now,
  showSource = true,
  onToggleSelect,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn
}: Props) {
  const checkboxId = `ir-card-check-${card.id}`
  const typeLabel = formatIRCardTypeLabel(card.cardType)
  const dueDateLabel = formatIRDueDate(card.due)
  const importanceLabel = formatIRImportanceLabel(card.priority)
  const importanceTone = importanceLabel === "高" ? "high" : importanceLabel === "中" ? "medium" : "low"
  const stageLabel = formatIRStageLabel(card.stage)
  const dueTone = getIRDueTone(card, now)
  const source = formatIRCardSourceLabel(card)
  const startTitle = canAdvanceLearn ? "提前到今天并开始阅读" : "以该卡开始阅读"

  return (
    <div className={`ir-library-row${selected ? " ir-library-row--selected" : ""}`}>
      <div className="ir-library-row__check">
        <input
          id={checkboxId}
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(card.id)}
          aria-label={`选择 ${title}`}
        />
      </div>
      <div className="ir-library-row__main">
        <button
          type="button"
          className="ir-library-row__title"
          onClick={() => onStartReading(card.id)}
          title={startTitle}
        >
          {title}
        </button>
        <div className="ir-library-row__meta">
          <span className={`ir-tag ir-tag--type ir-tag--type-${card.cardType || "topic"}`}>
            {typeLabel}
          </span>
          <span className={`ir-tag ir-tag--due ir-tag--due-${dueTone}`}>
            <i className="ti ti-calendar ir-tag__icon" aria-hidden="true" />
            到期: {dueDateLabel}
          </span>
          <span className="ir-tag ir-tag--stage" title={`阶段：${card.stage}`}>
            {stageLabel}
          </span>
          <span className={`ir-tag ir-tag--importance ir-tag--importance-${importanceTone}`}>
            重要: {importanceLabel}
          </span>
          {showSource && source !== "—" ? (
            <span className="ir-tag ir-tag--source" title={source}>
              <i className={`ti ${card.sourceWebUrl ? "ti-world-download" : "ti-book"}`} aria-hidden="true" />
              {source}
            </span>
          ) : null}
        </div>
      </div>
      <div className="ir-library-row__actions">
        <button
          type="button"
          onClick={() => onStartReading(card.id)}
          title={startTitle}
          className="ir-action-btn ir-action-btn--read"
        >
          <i className="ti ti-book-read ir-action-btn__icon" aria-hidden="true" />
          <span>现在读</span>
        </button>
        {canAdvanceLearn ? (
          <button
            type="button"
            onClick={() => onAdvanceLearn(card.id)}
            disabled={isAdvancing}
            title="仅提前到期到今天"
            className="ir-action-btn ir-action-btn--advance"
          >
            <i className="ti ti-calendar-forward ir-action-btn__icon" aria-hidden="true" />
            <span>{isAdvancing ? "处理中" : "改到今天"}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="ir-row-icon-btn"
          onClick={() => onOpenDetails(card.id)}
          aria-label="查看详情"
          title="查看详情"
        >
          <i className="ti ti-info-circle" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
