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
import { getIRChapterPresentation } from "./irChapterPresentation"
import IRLibraryRow from "./IRLibraryRow"
import { resolveBlockDisplayTitle } from "./resolveBlockDisplayTitle"
import {
  IR_CHAPTER_EXTRACT_PAGE_SIZE,
  nextExtractDisplayCount,
  pageExtracts
} from "./irExtractPaging"

const React = (window as any).React || (globalThis as any).React
const { useEffect, useRef, useState } = React

export { IR_CHAPTER_EXTRACT_PAGE_SIZE }

const FUTURE_GROUPS = ["明天", "未来7天", "新卡", "7天后"]

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
  // titleMap 由 get-blocks 按 alias > text 刷新；不得再用 state.text 覆盖回旧编号
  const mapped = titleMap[String(cardId)]
  if (mapped) return mapped
  const fromState = orca.state.blocks?.[cardId] as { aliases?: string[]; text?: string } | undefined
  return resolveBlockDisplayTitle(fromState, `(#${cardId})`)
}

function sequentialChapterClassName(chapter: IRChapterNode): string {
  if (!chapter.sequentialStatus) return ""
  if (chapter.sequentialStatus === "active" && chapter.card) {
    return "ir-library-chapter--sequential-active"
  }
  if (chapter.isSequentialPlaceholder || chapter.sequentialStatus !== "active") {
    return `ir-library-chapter--sequential-${chapter.sequentialStatus}`
  }
  return "ir-library-chapter--sequential-active"
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
  const isPartiallySelected = selectedCount > 0 && !isFullySelected
  const groupCheckboxRef = useRef(null) as { current: HTMLInputElement | null }
  const {
    chapterCard,
    isContextOnly,
    canExpand,
    extractCountLabel,
    sequentialStatus,
    sequentialStatusLabel,
    isSequentialPlaceholder
  } = getIRChapterPresentation(chapter)
  const dueLabel = chapter.due ? formatIRDueDate(chapter.due) : "无到期日"
  const stageLabel = formatIRStageLabel(chapter.stage)
  const importanceLabel = formatIRImportanceLabel(chapter.priority)
  const canAdvanceLearn = chapterCard
    ? FUTURE_GROUPS.includes(getIRDateGroup(chapterCard, now))
    : false
  const sequentialClass = sequentialChapterClassName(chapter)
  const contentAriaLabel = [
    chapter.title,
    sequentialStatusLabel,
    chapterCard ? `${dueLabel}，${stageLabel}` : null
  ].filter(Boolean).join("，")

  useEffect(() => {
    if (groupCheckboxRef.current) {
      groupCheckboxRef.current.indeterminate = isPartiallySelected
    }
  }, [isPartiallySelected])

  return (
    <div className={[
      "ir-library-chapter",
      isContextOnly ? "ir-library-chapter--context" : "",
      isSequentialPlaceholder ? "ir-library-chapter--placeholder" : "",
      sequentialClass,
      chapterCard && selectedCount > 0 ? "ir-library-chapter--selected" : ""
    ].filter(Boolean).join(" ")}>
      <div className="ir-library-chapter__header">
        <div className="ir-library-chapter__main">
          {canExpand ? (
            <button
              type="button"
              className="ir-library-chapter__expand"
              onClick={() => onToggleExpand(chapter.chapterId)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "收起章节摘录" : "展开章节摘录"}
              title={isExpanded ? "收起章节摘录" : "展开章节摘录"}
            >
              <i
                className={`ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"} ir-library-chapter__toggle-icon`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="ir-library-chapter__expand-placeholder" aria-hidden="true" />
          )}

          {chapterCard ? (
            <input
              ref={groupCheckboxRef}
              type="checkbox"
              className="ir-library-chapter__check"
              checked={isFullySelected}
              onChange={() => onToggleGroupSelection(allCardIdsInChapter)}
              aria-label={`选择章节 ${chapter.title} 及其可见摘录`}
              title="选择本章节及其当前可见摘录"
            />
          ) : null}

          <i
            className={[
              "ti",
              sequentialStatus === "active" ? "ti-player-play" : "ti-bookmark",
              "ir-library-chapter__icon"
            ].join(" ")}
            aria-hidden="true"
          />

          <button
            type="button"
            className="ir-library-chapter__content"
            onClick={() => {
              if (canExpand) {
                onToggleExpand(chapter.chapterId)
                return
              }
              if (chapterCard) {
                onOpenDetails(chapterCard.id)
              }
            }}
            aria-expanded={canExpand ? isExpanded : undefined}
            aria-label={contentAriaLabel}
            title={
              canExpand
                ? (isExpanded ? "收起章节摘录" : "展开章节摘录")
                : chapterCard
                  ? "查看章节详情"
                  : sequentialStatusLabel
                    ? `${chapter.title}（${sequentialStatusLabel}）`
                    : chapter.title
            }
            disabled={isSequentialPlaceholder && !canExpand}
          >
            <span className="ir-library-chapter__title" title={chapter.title}>{chapter.title}</span>
            <span className="ir-library-chapter__metadata">
              {sequentialStatusLabel ? (
                <span
                  className={[
                    "ir-library-chapter__status",
                    `ir-library-chapter__status--${sequentialStatus}`
                  ].join(" ")}
                  aria-label={sequentialStatusLabel}
                >
                  {sequentialStatusLabel}
                </span>
              ) : null}
              {chapterCard ? (
                <>
                  <span className="ir-library-chapter__meta">{dueLabel}</span>
                  <span className="ir-library-chapter__meta">{stageLabel}</span>
                  <span className="ir-library-chapter__meta">重要 {importanceLabel}</span>
                </>
              ) : null}
              {extractCountLabel ? (
                <span
                  className={`ir-library-chapter__badge${isContextOnly ? " ir-library-chapter__badge--context" : ""}`}
                  title={`该章节含 ${chapter.extracts.length} 个匹配摘录`}
                >
                  {extractCountLabel}
                </span>
              ) : null}
            </span>
          </button>
        </div>

        {chapterCard ? (
          <div className="ir-library-chapter__actions">
            <button
              type="button"
              className="ir-library-chapter__icon-btn"
              onClick={() => onOpenDetails(chapterCard.id)}
              title="查看章节详情"
              aria-label="查看章节详情"
            >
              <i className="ti ti-info-circle" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ir-action-btn ir-action-btn--read ir-library-chapter__read-btn"
              onClick={() => onStartReading(chapterCard.id)}
              title={canAdvanceLearn ? "提前到今天并开始阅读" : "阅读该章节"}
            >
              <i className="ti ti-book-read" aria-hidden="true" />
              <span>{canAdvanceLearn ? "提前阅读" : "开始阅读"}</span>
            </button>
            {canAdvanceLearn ? (
              <button
                type="button"
                className="ir-library-chapter__icon-btn"
                onClick={() => onAdvanceLearn(chapterCard.id)}
                disabled={Boolean(advancingIds[String(chapterCard.id)])}
                title="仅提前到期到今天"
                aria-label="仅提前到期到今天"
              >
                <i className="ti ti-calendar-forward" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isExpanded && chapter.extracts.length > 0 ? (
        <ChapterExtractList
          chapter={chapter}
          titleMap={titleMap}
          selectedCardIds={selectedCardIds}
          advancingIds={advancingIds}
          now={now}
          onToggleCardSelection={onToggleCardSelection}
          onOpenDetails={onOpenDetails}
          onStartReading={onStartReading}
          onAdvanceLearn={onAdvanceLearn}
        />
      ) : null}
    </div>
  )
}

function ChapterExtractList({
  chapter,
  titleMap,
  selectedCardIds,
  advancingIds,
  now,
  onToggleCardSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn
}: {
  chapter: IRChapterNode
  titleMap: Record<string, string>
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  now: Date
  onToggleCardSelection: (cardId: DbId) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
}) {
  const [displayCount, setDisplayCount] = useState(IR_CHAPTER_EXTRACT_PAGE_SIZE)
  const total = chapter.extracts.length

  useEffect(() => {
    setDisplayCount(IR_CHAPTER_EXTRACT_PAGE_SIZE)
  }, [chapter.chapterId, total])

  const visible = pageExtracts(chapter.extracts, displayCount)

  return (
    <div className="ir-library-chapter__extracts">
      {visible.map((extractNode: IRChapterNode["extracts"][number]) => (
        <div key={extractNode.card.id} className="ir-library-chapter__extract-row">
          <IRLibraryRow
            card={extractNode.card}
            title={getCardTitle(extractNode.card.id, titleMap)}
            selected={selectedCardIds.has(extractNode.card.id)}
            canAdvanceLearn={FUTURE_GROUPS.includes(getIRDateGroup(extractNode.card, now))}
            isAdvancing={Boolean(advancingIds[String(extractNode.card.id)])}
            now={now}
            showSource={false}
            onToggleSelect={onToggleCardSelection}
            onOpenDetails={onOpenDetails}
            onStartReading={onStartReading}
            onAdvanceLearn={onAdvanceLearn}
          />
        </div>
      ))}
      {displayCount < total ? (
        <button
          type="button"
          className="ir-load-more-btn"
          onClick={() =>
            setDisplayCount((n: number) => nextExtractDisplayCount(n, total))
          }
        >
          加载更多摘录（{displayCount}/{total}）
        </button>
      ) : null}
    </div>
  )
}
