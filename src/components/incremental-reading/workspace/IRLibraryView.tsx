/**
 * 资料库模式：摘要、工具栏、列表、批量栏
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRLibraryFilters, IRLibrarySummary, IRSourceBookOption } from "./irLibraryFilters"
import type { IRSourceTreeResult, IRTimeNavKey } from "./irSourceTreeBuilder"
import IRBulkActionBar from "./IRBulkActionBar"
import IRLibrarySourceTree from "./IRLibrarySourceTree"
import IRLibraryToolbar from "./IRLibraryToolbar"
import IRQueueHealthBar from "./IRQueueHealthBar"
import IRTimeNavigationBar from "./IRTimeNavigationBar"

const { Button } = orca.components

type Props = {
  workspaceId: string
  loading: boolean
  errorMessage: string | null
  summary: IRLibrarySummary
  filters: IRLibraryFilters
  timeNavKey: IRTimeNavKey
  sourceTreeResult: IRSourceTreeResult
  titleMap: Record<string, string>
  isSourceExpanded: (sourceId: string) => boolean
  isChapterExpanded: (chapterId: string) => boolean
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  sourceBooks: IRSourceBookOption[]
  stages: string[]
  candidateBatchId: string | null
  isBatchRemoving: boolean
  isDeferringOverflow: boolean
  todayQueueInfo: {
    dailyLimit: number
    totalDueCount: number
    overflowCount: number
    actionEnabled: boolean
  }
  listRef: { current: HTMLDivElement | null }
  searchInputRef: { current: HTMLInputElement | null }
  onRetry: () => void
  onFiltersChange: (patch: Partial<IRLibraryFilters>) => void
  onTimeNavChange: (key: IRTimeNavKey) => void
  onClearFilters: () => void
  onToggleSource: (sourceId: string) => void
  onToggleChapter: (chapterId: string) => void
  onToggleCardSelection: (cardId: DbId) => void
  onToggleGroupSelection: (cardIds: DbId[]) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
  onSelectBatch: (batchId: string) => void
  onClearSelection: () => void
  onBatchRemove: () => Promise<void>
  onRemoveSourceBook?: (bookBlockId: number) => Promise<void>
  onDeferOverflow: () => Promise<void>
}

export default function IRLibraryView({
  workspaceId,
  loading,
  errorMessage,
  summary,
  filters,
  timeNavKey,
  sourceTreeResult,
  titleMap,
  isSourceExpanded,
  isChapterExpanded,
  selectedCardIds,
  advancingIds,
  sourceBooks,
  stages,
  candidateBatchId,
  isBatchRemoving,
  isDeferringOverflow,
  todayQueueInfo,
  listRef,
  searchInputRef,
  onRetry,
  onFiltersChange,
  onTimeNavChange,
  onClearFilters,
  onToggleSource,
  onToggleChapter,
  onToggleCardSelection,
  onToggleGroupSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn,
  onSelectBatch,
  onClearSelection,
  onBatchRemove,
  onRemoveSourceBook,
  onDeferOverflow
}: Props) {
  return (
    <div
      id={`${workspaceId}-library-panel`}
      className="ir-library"
      role="tabpanel"
      aria-labelledby={`${workspaceId}-mode-library`}
    >
      <div className="ir-library__summary" aria-live="polite">
        <div className="ir-library__summary-primary">
          <span>逾期 <strong className={summary.overdue > 0 ? "ir-count--danger" : ""}>{summary.overdue}</strong></span>
          <span>今天 <strong>{summary.today}</strong></span>
          <span>新卡 <strong>{summary.newCount}</strong></span>
        </div>
        <div className="ir-library__summary-secondary">
          主题 {summary.topics} · 摘录 {summary.extracts}
        </div>
      </div>

      <IRQueueHealthBar
        {...todayQueueInfo}
        isDeferring={isDeferringOverflow}
        onDeferOverflow={onDeferOverflow}
      />

      <IRTimeNavigationBar
        timeNavKey={timeNavKey}
        counts={sourceTreeResult.timeNavCounts}
        onChange={onTimeNavChange}
      />

      <IRLibraryToolbar
        workspaceId={workspaceId}
        filters={filters}
        sourceBooks={sourceBooks}
        stages={stages}
        searchInputRef={searchInputRef}
        onChange={onFiltersChange}
        onClear={onClearFilters}
      />

      {loading ? (
        <div className="ir-library-status" role="status">加载渐进阅读卡片中…</div>
      ) : errorMessage ? (
        <div className="ir-library-status ir-library-status--error" role="alert">
          <div>加载失败：{errorMessage}</div>
          <div style={{ marginTop: 12 }}>
            <Button tabIndex={0} variant="solid" onClick={onRetry}>重试</Button>
          </div>
        </div>
      ) : (
        <IRLibrarySourceTree
          treeResult={sourceTreeResult}
          titleMap={titleMap}
          isSourceExpanded={isSourceExpanded}
          isChapterExpanded={isChapterExpanded}
          selectedCardIds={selectedCardIds}
          advancingIds={advancingIds}
          listRef={listRef}
          onToggleSource={onToggleSource}
          onToggleChapter={onToggleChapter}
          onToggleCardSelection={onToggleCardSelection}
          onToggleGroupSelection={onToggleGroupSelection}
          onOpenDetails={onOpenDetails}
          onStartReading={onStartReading}
          onAdvanceLearn={onAdvanceLearn}
          onRemoveSourceBook={onRemoveSourceBook}
        />
      )}

      <IRBulkActionBar
        selectedCount={selectedCardIds.size}
        candidateBatchId={candidateBatchId}
        isBatchRemoving={isBatchRemoving}
        onSelectBatch={onSelectBatch}
        onClearSelection={onClearSelection}
        onBatchRemove={onBatchRemove}
        filteredSourceBookId={filters.sourceBook}
        onRemoveSourceBook={onRemoveSourceBook}
      />
    </div>
  )
}
