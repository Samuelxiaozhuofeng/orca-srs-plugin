/**
 * 资料库搜索与筛选工具栏
 */

import type {
  IRCardTypeFilter,
  IRDueStatusFilter,
  IRImportanceFilter,
  IRLibraryFilters,
  IRLibrarySortBy,
  IRSortDir,
  IRSourceBookOption
} from "./irLibraryFilters"
import { hasActiveIRLibraryFilters } from "./irLibraryFilters"

const { Button } = orca.components

type Props = {
  filters: IRLibraryFilters
  sourceBooks: IRSourceBookOption[]
  stages: string[]
  searchInputRef: { current: HTMLInputElement | null }
  onChange: (patch: Partial<IRLibraryFilters>) => void
  onClear: () => void
}

export default function IRLibraryToolbar({
  filters,
  sourceBooks,
  stages,
  searchInputRef,
  onChange,
  onClear
}: Props) {
  const active = hasActiveIRLibraryFilters(filters)

  return (
    <div className="ir-library-toolbar" role="search" aria-label="资料库搜索与筛选">
      <input
        ref={searchInputRef}
        className="ir-library-toolbar__search"
        type="search"
        value={filters.query}
        placeholder="搜索标题、来源、阶段…"
        aria-label="搜索渐进阅读卡片"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          onChange({ query: event.currentTarget.value })
        }}
      />
      <select
        aria-label="类型"
        value={filters.cardType}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ cardType: event.currentTarget.value as IRCardTypeFilter })
        }}
      >
        <option value="all">全部类型</option>
        <option value="topic">Topic</option>
        <option value="extracts">Extract</option>
      </select>
      <select
        aria-label="到期状态"
        value={filters.dueStatus}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ dueStatus: event.currentTarget.value as IRDueStatusFilter })
        }}
      >
        <option value="all">全部到期</option>
        <option value="overdue">已逾期</option>
        <option value="today">今天</option>
        <option value="tomorrow">明天</option>
        <option value="upcoming7">未来7天</option>
        <option value="new">新卡</option>
        <option value="later">7天后</option>
      </select>
      <select
        aria-label="来源书籍"
        value={filters.sourceBook}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ sourceBook: event.currentTarget.value })
        }}
      >
        <option value="all">全部来源</option>
        <option value="none">无来源</option>
        {sourceBooks.map(book => (
          <option key={book.id} value={book.id}>
            {book.title}（{book.count}）
          </option>
        ))}
      </select>
      <select
        aria-label="阶段"
        value={filters.stage}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ stage: event.currentTarget.value })
        }}
      >
        <option value="all">全部阶段</option>
        {stages.map(stage => (
          <option key={stage} value={stage}>{stage}</option>
        ))}
      </select>
      <select
        aria-label="重要性"
        value={filters.importance}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ importance: event.currentTarget.value as IRImportanceFilter })
        }}
      >
        <option value="all">全部重要性</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <select
        aria-label="排序字段"
        value={filters.sortBy}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ sortBy: event.currentTarget.value as IRLibrarySortBy })
        }}
      >
        <option value="due">按到期</option>
        <option value="priority">按重要性</option>
        <option value="readCount">按已读</option>
        <option value="type">按类型</option>
        <option value="stage">按阶段</option>
      </select>
      <select
        aria-label="排序方向"
        value={filters.sortDir}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange({ sortDir: event.currentTarget.value as IRSortDir })
        }}
      >
        <option value="asc">升序</option>
        <option value="desc">降序</option>
      </select>
      {active ? (
        <Button variant="plain" onClick={onClear} title="清除筛选">
          清除
        </Button>
      ) : null}
    </div>
  )
}
