/**
 * 资料库来源->章节->摘录三级树形容器
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRSourceTreeResult } from "./irSourceTreeBuilder"
import IRLibrarySourceItem from "./IRLibrarySourceItem"

const React = (window as any).React || (globalThis as any).React

type Props = {
  treeResult: IRSourceTreeResult
  titleMap: Record<string, string>
  isSourceExpanded: (sourceId: string) => boolean
  isChapterExpanded: (chapterId: string) => boolean
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  listRef: { current: HTMLDivElement | null }
  now?: Date
  onToggleSource: (sourceId: string) => void
  onToggleChapter: (chapterId: string) => void
  onToggleCardSelection: (cardId: DbId) => void
  onToggleGroupSelection: (cardIds: DbId[]) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
  onRemoveSourceBook?: (bookId: DbId) => void
}

export default function IRLibrarySourceTree({
  treeResult,
  titleMap,
  isSourceExpanded,
  isChapterExpanded,
  selectedCardIds,
  advancingIds,
  listRef,
  now = new Date(),
  onToggleSource,
  onToggleChapter,
  onToggleCardSelection,
  onToggleGroupSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn,
  onRemoveSourceBook
}: Props) {
  if (treeResult.sources.length === 0) {
    return (
      <div className="ir-library-scroll" ref={listRef}>
        <div className="ir-library-empty">没有匹配的渐进阅读卡片</div>
      </div>
    )
  }

  return (
    <div className="ir-library-scroll" ref={listRef}>
      <div className="ir-source-tree-container">
        {treeResult.sources.map(source => (
          <IRLibrarySourceItem
            key={source.sourceId}
            source={source}
            titleMap={titleMap}
            isExpanded={isSourceExpanded(source.sourceId)}
            isChapterExpanded={isChapterExpanded}
            selectedCardIds={selectedCardIds}
            advancingIds={advancingIds}
            now={now}
            onToggleSource={onToggleSource}
            onToggleChapter={onToggleChapter}
            onToggleCardSelection={onToggleCardSelection}
            onToggleGroupSelection={onToggleGroupSelection}
            onOpenDetails={onOpenDetails}
            onStartReading={onStartReading}
            onAdvanceLearn={onAdvanceLearn}
            onRemoveSourceBook={onRemoveSourceBook}
          />
        ))}
      </div>
    </div>
  )
}
