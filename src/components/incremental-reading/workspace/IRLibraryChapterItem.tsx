/**
 * 资料库树形章节节点与下属摘录列表
 */

import type { DbId } from "../../../orca.d.ts"
import {
  collectIRChapterMatchedCardIds,
  type IRChapterNode
} from "./irSourceTreeBuilder"
import { getIRDateGroup } from "../../../srs/incrementalReadingManagerUtils"
import {
  formatIRDueDate,
  formatIRImportanceLabel,
  formatIRStageLabel
} from "./irLibraryFilters"
import IRLibraryRow from "./IRLibraryRow"

const React = (window as any).React || (globalThis as any).React

type Props = {
  chapter: IRChapterNode
  titleMap: Record<string, string>
  isExpanded: boolean
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  now: Date
  onToggleExpand: (chapterId: string) => void
  onToggleCardSelection: (cardId: DbId) => void
  onToggleGroupSelection: (cardIds: DbId[]) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
}

function getCardTitle(cardId: DbId, titleMap: Record<string, string>): string {
  const fromState = orca.state.blocks?.[cardId] as { text?: string } | undefined
  if (fromState?.text) return fromState.text
  return titleMap[String(cardId)] ?? `(#${cardId})`
}

export default function IRLibraryChapterItem({
  chapter,
  titleMap,
  isExpanded,
  selectedCardIds,
  advancingIds,
  now,
  onToggleExpand,
  onToggleCardSelection,
  onToggleGroupSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn
}: Props) {
  const allCardIdsInChapter = collectIRChapterMatchedCardIds(chapter)
  const selectedCount = allCardIdsInChapter.filter(id => selectedCardIds.has(id)).length
  const isFullySelected = allCardIdsInChapter.length > 0 && selectedCount === allCardIdsInChapter.length
  const FUTURE_GROUPS = ["明天", "未来7天", "新卡", "7天后"]
  const dueLabel = chapter.due ? formatIRDueDate(chapter.due) : "无到期日"
  const stageLabel = formatIRStageLabel(chapter.stage)
  const importanceLabel = formatIRImportanceLabel(chapter.priority)

  return (
    <div className="ir-library-chapter">
      <div className="ir-library-chapter__header">
        <button
          type="button"
          className="ir-library-chapter__toggle"
          onClick={() => onToggleExpand(chapter.chapterId)}
          aria-expanded={isExpanded}
        >
          <i
            className={`ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"} ir-library-chapter__toggle-icon`}
            aria-hidden="true"
          />
          <i className="ti ti-bookmark ir-library-chapter__icon" aria-hidden="true" />
          <span className="ir-library-chapter__title" title={chapter.title}>{chapter.title}</span>
          <span className="ir-library-chapter__meta">{dueLabel}</span>
          <span className="ir-library-chapter__meta">{stageLabel}</span>
          <span className="ir-library-chapter__meta">重要 {importanceLabel}</span>
          <span className="ir-library-chapter__badge" title={`该章节含 ${chapter.extracts.length} 个匹配摘录`}>
            {chapter.extracts.length > 0 ? `${chapter.extracts.length} 摘录` : "主章节"}
          </span>
        </button>

        <div className="ir-library-chapter__actions">
          <button
            type="button"
            className="ir-group-select-btn"
            onClick={() => onToggleGroupSelection(allCardIdsInChapter)}
            title={isFullySelected ? "取消该章节选择" : "全选该章节"}
          >
            {isFullySelected ? "取消本章" : `选本章${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
        </div>
      </div>

      {isExpanded && chapter.card && chapter.cardMatches ? (
        <div className="ir-library-chapter__main-card">
          <IRLibraryRow
            card={chapter.card}
            title={getCardTitle(chapter.card.id, titleMap)}
            selected={selectedCardIds.has(chapter.card.id)}
            canAdvanceLearn={FUTURE_GROUPS.includes(getIRDateGroup(chapter.card, now))}
            isAdvancing={Boolean(advancingIds[String(chapter.card.id)])}
            now={now}
            onToggleSelect={onToggleCardSelection}
            onOpenDetails={onOpenDetails}
            onStartReading={onStartReading}
            onAdvanceLearn={onAdvanceLearn}
          />
        </div>
      ) : null}

      {isExpanded && chapter.extracts.length > 0 ? (
        <div className="ir-library-chapter__extracts">
          {chapter.extracts.map(extractNode => (
            <div key={extractNode.card.id} className="ir-library-chapter__extract-row">
              <IRLibraryRow
                card={extractNode.card}
                title={getCardTitle(extractNode.card.id, titleMap)}
                selected={selectedCardIds.has(extractNode.card.id)}
                canAdvanceLearn={FUTURE_GROUPS.includes(getIRDateGroup(extractNode.card, now))}
                isAdvancing={Boolean(advancingIds[String(extractNode.card.id)])}
                now={now}
                onToggleSelect={onToggleCardSelection}
                onOpenDetails={onOpenDetails}
                onStartReading={onStartReading}
                onAdvanceLearn={onAdvanceLearn}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
