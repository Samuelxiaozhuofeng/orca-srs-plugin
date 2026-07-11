/**
 * 资料库模式：摘要、工具栏、列表、批量栏
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import type { IRDateGroupKey } from "../../../srs/incrementalReadingManagerUtils"
import type { IRLibraryFilters, IRLibrarySummary, IRSourceBookOption } from "./irLibraryFilters"
import IRBulkActionBar from "./IRBulkActionBar"
import IRLibraryList from "./IRLibraryList"
import IRLibraryToolbar from "./IRLibraryToolbar"
import IRQueueHealthBar from "./IRQueueHealthBar"

const { Button } = orca.components

type Props = {
  workspaceId: string
  loading: boolean
  errorMessage: string | null
  summary: IRLibrarySummary
  filters: IRLibraryFilters
  filteredCards: IRCard[]
  titleMap: Record<string, string>
  expandedGroups: Record<IRDateGroupKey, boolean>
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  groupDisplayCounts: Record<string, number>
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
  onClearFilters: () => void
  onToggleGroup: (key: IRDateGroupKey) => void
  onToggleCardSelection: (cardId: DbId) => void
  onToggleGroupSelection: (cardIds: DbId[]) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
  onLoadMore: (key: IRDateGroupKey) => void
  onSelectBatch: (batchId: string) => void
  onClearSelection: () => void
  onBatchRemove: () => Promise<void>
  onDeferOverflow: () => Promise<void>
}

export default function IRLibraryView({
  workspaceId,
  loading,
  errorMessage,
  summary,
  filters,
  filteredCards,
  titleMap,
  expandedGroups,
  selectedCardIds,
  advancingIds,
  groupDisplayCounts,
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
  onClearFilters,
  onToggleGroup,
  onToggleCardSelection,
  onToggleGroupSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn,
  onLoadMore,
  onSelectBatch,
  onClearSelection,
  onBatchRemove,
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
        <span>共 <strong>{summary.total}</strong></span>
        <span className="ir-library__summary-sep">·</span>
        <span>显示 <strong>{summary.filtered}</strong></span>
        <span className="ir-library__summary-sep">·</span>
        <span>逾期 <strong>{summary.overdue}</strong></span>
        <span className="ir-library__summary-sep">·</span>
        <span>今天 <strong>{summary.today}</strong></span>
        <span className="ir-library__summary-sep">·</span>
        <span>新卡 <strong>{summary.newCount}</strong></span>
        <span className="ir-library__summary-sep">·</span>
        <span>Topic {summary.topics} / Extract {summary.extracts}</span>
      </div>

      <IRQueueHealthBar
        {...todayQueueInfo}
        isDeferring={isDeferringOverflow}
        onDeferOverflow={onDeferOverflow}
      />

      <IRLibraryToolbar
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
            <Button variant="solid" onClick={onRetry}>重试</Button>
          </div>
        </div>
      ) : (
        <IRLibraryList
          cards={filteredCards}
          titleMap={titleMap}
          expandedGroups={expandedGroups}
          selectedCardIds={selectedCardIds}
          advancingIds={advancingIds}
          groupDisplayCounts={groupDisplayCounts}
          listRef={listRef}
          onToggleGroup={onToggleGroup}
          onToggleCardSelection={onToggleCardSelection}
          onToggleGroupSelection={onToggleGroupSelection}
          onOpenDetails={onOpenDetails}
          onStartReading={onStartReading}
          onAdvanceLearn={onAdvanceLearn}
          onLoadMore={onLoadMore}
        />
      )}

      <IRBulkActionBar
        selectedCount={selectedCardIds.size}
        candidateBatchId={candidateBatchId}
        isBatchRemoving={isBatchRemoving}
        onSelectBatch={onSelectBatch}
        onClearSelection={onClearSelection}
        onBatchRemove={onBatchRemove}
      />
    </div>
  )
}
