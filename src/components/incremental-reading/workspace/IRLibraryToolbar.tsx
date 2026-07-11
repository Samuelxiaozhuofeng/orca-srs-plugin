/**
 * 资料库搜索、排序与渐进式筛选工具栏
 */

import type {
  IRCardTypeFilter,
  IRDueStatusFilter,
  IRImportanceFilter,
  IRLibraryFilters,
  IRLibrarySortBy,
  IRSourceBookOption
} from "./irLibraryFilters"
import { formatIRStageLabel, hasActiveIRLibraryFilters } from "./irLibraryFilters"

const { useState } = window.React

type Props = {
  workspaceId: string
  filters: IRLibraryFilters
  sourceBooks: IRSourceBookOption[]
  stages: string[]
  searchInputRef: { current: HTMLInputElement | null }
  onChange: (patch: Partial<IRLibraryFilters>) => void
  onClear: () => void
}

function countAdvancedFilters(filters: IRLibraryFilters): number {
  return [
    filters.cardType !== "all",
    filters.dueStatus !== "all",
    filters.sourceBook !== "all",
    filters.stage !== "all",
    filters.importance !== "all"
  ].filter(Boolean).length
}

export default function IRLibraryToolbar({
  workspaceId,
  filters,
  sourceBooks,
  stages,
  searchInputRef,
  onChange,
  onClear
}: Props) {
  const active = hasActiveIRLibraryFilters(filters)
  const activeFilterCount = countAdvancedFilters(filters)
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0)
  const filtersId = `${workspaceId}-library-filters`

  return (
    <div className="ir-library-toolbar" role="search" aria-label="资料库搜索与筛选">
      <div className="ir-library-toolbar__primary">
        <div className="ir-search-wrapper">
          <i className="ti ti-search ir-search-wrapper__icon" aria-hidden="true" />
          <input
            ref={searchInputRef}
            className="ir-library-toolbar__search"
            type="search"
            value={filters.query}
            placeholder="搜索标题、来源或阶段"
            aria-label="搜索渐进阅读卡片"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              onChange({ query: event.currentTarget.value })
            }}
          />
          {filters.query ? (
            <button
              type="button"
              className="ir-search-wrapper__clear"
              title="清空搜索"
              aria-label="清空搜索"
              onClick={() => onChange({ query: "" })}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={`ir-toolbar-btn${filtersOpen ? " ir-toolbar-btn--active" : ""}`}
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen((value: boolean) => !value)}
        >
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
          <span>筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}</span>
        </button>

        <div className="ir-library-toolbar__sort">
          <label className="ir-sort-field">
            <span className="ir-sr-only">排序字段</span>
            <select
              aria-label="排序字段"
              value={filters.sortBy}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                onChange({ sortBy: event.currentTarget.value as IRLibrarySortBy })
              }}
            >
              <option value="due">按到期时间</option>
              <option value="priority">按重要性</option>
              <option value="readCount">按阅读次数</option>
              <option value="type">按类型</option>
              <option value="stage">按阶段</option>
            </select>
          </label>
          <button
            type="button"
            className="ir-toolbar-icon-btn"
            title={filters.sortDir === "asc" ? "当前升序，点击切换为降序" : "当前降序，点击切换为升序"}
            aria-label={filters.sortDir === "asc" ? "切换为降序" : "切换为升序"}
            onClick={() => onChange({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" })}
          >
            <i className={`ti ${filters.sortDir === "asc" ? "ti-sort-ascending" : "ti-sort-descending"}`} aria-hidden="true" />
          </button>
        </div>

        {active ? (
          <button
            type="button"
            className="ir-toolbar-reset"
            onClick={() => {
              onClear()
              setFiltersOpen(false)
            }}
          >
            重置
          </button>
        ) : null}
      </div>

      <div id={filtersId} className="ir-library-toolbar__filters" hidden={!filtersOpen}>
        <label className="ir-filter-item">
          <span className="ir-filter-label">类型</span>
          <select
            value={filters.cardType}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              onChange({ cardType: event.currentTarget.value as IRCardTypeFilter })
            }}
          >
            <option value="all">全部类型</option>
            <option value="topic">主题</option>
            <option value="extracts">摘录</option>
          </select>
        </label>

        <label className="ir-filter-item">
          <span className="ir-filter-label">到期</span>
          <select
            value={filters.dueStatus}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              onChange({ dueStatus: event.currentTarget.value as IRDueStatusFilter })
            }}
          >
            <option value="all">全部时间</option>
            <option value="overdue">已逾期</option>
            <option value="today">今天</option>
            <option value="tomorrow">明天</option>
            <option value="upcoming7">未来 7 天</option>
            <option value="new">新卡</option>
            <option value="later">7 天后</option>
          </select>
        </label>

        <label className="ir-filter-item">
          <span className="ir-filter-label">来源</span>
          <select
            value={filters.sourceBook}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange({ sourceBook: event.currentTarget.value })}
          >
            <option value="all">全部来源</option>
            <option value="none">无来源</option>
            {sourceBooks.map(book => <option key={book.id} value={book.id}>{book.title}（{book.count}）</option>)}
          </select>
        </label>

        <label className="ir-filter-item">
          <span className="ir-filter-label">阶段</span>
          <select
            value={filters.stage}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange({ stage: event.currentTarget.value })}
          >
            <option value="all">全部阶段</option>
            {stages.map(stage => <option key={stage} value={stage}>{formatIRStageLabel(stage)}</option>)}
          </select>
        </label>

        <label className="ir-filter-item">
          <span className="ir-filter-label">重要性</span>
          <select
            value={filters.importance}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              onChange({ importance: event.currentTarget.value as IRImportanceFilter })
            }}
          >
            <option value="all">全部级别</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
    </div>
  )
}
