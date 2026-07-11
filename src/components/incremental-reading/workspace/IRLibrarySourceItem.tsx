/**
 * 资料库树形来源节点与下属章节列表
 */

import type { DbId } from "../../../orca.d.ts"
import {
  collectIRSourceMatchedCardIds,
  type IRSourceNode
} from "./irSourceTreeBuilder"
import IRLibraryChapterItem from "./IRLibraryChapterItem"

const React = (window as any).React || (globalThis as any).React

type Props = {
  source: IRSourceNode
  titleMap: Record<string, string>
  isExpanded: boolean
  isChapterExpanded: (chapterId: string) => boolean
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  now: Date
  onToggleSource: (sourceId: string) => void
  onToggleChapter: (chapterId: string) => void
  onToggleCardSelection: (cardId: DbId) => void
  onToggleGroupSelection: (cardIds: DbId[]) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
  onRemoveSourceBook?: (bookId: DbId) => void
}

export default function IRLibrarySourceItem({
  source,
  titleMap,
  isExpanded,
  isChapterExpanded,
  selectedCardIds,
  advancingIds,
  now,
  onToggleSource,
  onToggleChapter,
  onToggleCardSelection,
  onToggleGroupSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn,
  onRemoveSourceBook
}: Props) {
  const allCardIdsInSource = collectIRSourceMatchedCardIds(source)

  const selectedCount = allCardIdsInSource.filter(id => selectedCardIds.has(id)).length
  const isFullySelected = allCardIdsInSource.length > 0 && selectedCount === allCardIdsInSource.length

  const overdueCount = source.stats.timeGroupCardCounts["overdue"] ?? 0
  const todayCount = source.stats.timeGroupCardCounts["today"] ?? 0
  const newCount = source.stats.timeGroupCardCounts["new"] ?? 0
  const chapterCountLabel = source.stats.matchedChapterCount === source.stats.totalChapterCount
    ? String(source.stats.totalChapterCount)
    : `${source.stats.matchedChapterCount}/${source.stats.totalChapterCount}`
  const cardCountLabel = source.stats.matchedCardCount === source.stats.totalCardCount
    ? String(source.stats.totalCardCount)
    : `${source.stats.matchedCardCount}/${source.stats.totalCardCount}`

  return (
    <section className="ir-library-source">
      <div className="ir-library-source__header">
        <button
          type="button"
          className="ir-library-source__toggle"
          onClick={() => onToggleSource(source.sourceId)}
          aria-expanded={isExpanded}
        >
          <i
            className={`ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"} ir-library-source__toggle-icon`}
            aria-hidden="true"
          />
          <i className={`ti ${source.sourceType === "book" ? "ti-book" : "ti-folder"} ir-library-source__icon`} aria-hidden="true" />
          <span className="ir-library-source__title" title={source.title}>{source.title}</span>
          <span className="ir-library-source__stats">
            <span className="ir-library-source__badge ir-library-source__badge--main">
              {chapterCountLabel} 章 · {cardCountLabel} 卡
            </span>
            {overdueCount > 0 ? (
              <span className="ir-library-source__badge ir-library-source__badge--overdue">
                逾期 {overdueCount} 卡
              </span>
            ) : null}
            {todayCount > 0 ? (
              <span className="ir-library-source__badge ir-library-source__badge--today">
                今天 {todayCount} 卡
              </span>
            ) : null}
            {newCount > 0 ? (
              <span className="ir-library-source__badge ir-library-source__badge--new">
                新卡 {newCount} 卡
              </span>
            ) : null}
          </span>
        </button>

        <div className="ir-library-source__actions">
          <button
            type="button"
            className="ir-group-select-btn"
            onClick={() => onToggleGroupSelection(allCardIdsInSource)}
            title={isFullySelected ? "取消该来源下选择" : "全选该来源下卡片"}
          >
            {isFullySelected ? "取消来源" : `全选来源${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>

          {source.sourceType === "book" && !Number.isNaN(Number(source.sourceId)) && onRemoveSourceBook ? (
            <button
              type="button"
              className="ir-toolbar-icon-btn ir-toolbar-icon-btn--danger"
              title="将该书籍从渐进阅读整本移出"
              onClick={() => onRemoveSourceBook(Number(source.sourceId) as DbId)}
            >
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <div className="ir-library-source__chapters">
          {source.chapters.map(chapter => (
            <IRLibraryChapterItem
              key={chapter.chapterId}
              chapter={chapter}
              titleMap={titleMap}
              isExpanded={isChapterExpanded(chapter.chapterId)}
              selectedCardIds={selectedCardIds}
              advancingIds={advancingIds}
              now={now}
              onToggleExpand={onToggleChapter}
              onToggleCardSelection={onToggleCardSelection}
              onToggleGroupSelection={onToggleGroupSelection}
              onOpenDetails={onOpenDetails}
              onStartReading={onStartReading}
              onAdvanceLearn={onAdvanceLearn}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
