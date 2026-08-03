/**
 * 卡片浏览器展示控件：搜索/筛选工具栏 + 管理批量条。
 * 状态与 mutation 仍由 CardListView 持有；本文件只渲染与转发事件。
 */

import type { FilterType } from "../../srs/cardFilterUtils"
import type {
  BrowserSortKey,
  BrowserStatusFilter
} from "./cardBrowserQuery"
import {
  BROWSER_SORT_LABELS,
  BROWSER_STATUS_LABELS,
  cardTypeLabel
} from "./cardBrowserQuery"

const { Button } = orca.components

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "overdue", label: "已到期" },
  { key: "today", label: "今天" },
  { key: "future", label: "未来" },
  { key: "new", label: "新卡" }
]

export type CardListChromeProps = {
  title: string
  batchBusy: boolean
  ttsBatchMode: boolean
  ttsBatchRunning: boolean
  showReviewCta: boolean
  onBack: () => void
  onEnterTts: () => void
  onExitTts: () => void
  onReviewDeck: () => void
  currentFilter: FilterType
  onFilterChange: (filter: FilterType) => void
  filterCounts: Record<FilterType, number>
  controlsDisabled: boolean
}

/** 顶栏 + 到期 tabs */
export function CardListChrome(props: CardListChromeProps) {
  const {
    title,
    batchBusy,
    ttsBatchMode,
    ttsBatchRunning,
    showReviewCta,
    onBack,
    onEnterTts,
    onExitTts,
    onReviewDeck,
    currentFilter,
    onFilterChange,
    filterCounts,
    controlsDisabled
  } = props

  return (
    <>
      <div className="srs-card-list-view__header">
        <Button
          variant="plain"
          onClick={batchBusy ? undefined : onBack}
          className={`srs-card-list-view__back${batchBusy ? " srs-btn-disabled" : ""}`}
        >
          ← 返回
        </Button>
        <div className="srs-card-list-view__title">{title}</div>
        <div className="srs-card-list-view__header-actions">
          {!ttsBatchMode ? (
            <Button
              variant="outline"
              onClick={batchBusy ? undefined : onEnterTts}
              className={`srs-card-list-view__tts-batch${batchBusy ? " srs-btn-disabled" : ""}`}
              title="为当前列表中的 Basic 卡批量添加语音"
            >
              <i className="ti ti-volume" aria-hidden="true" /> 批量语音
            </Button>
          ) : (
            <Button
              variant="plain"
              onClick={ttsBatchRunning ? undefined : onExitTts}
              className="srs-card-list-view__tts-batch"
            >
              退出批量
            </Button>
          )}
          {showReviewCta && !ttsBatchMode && (
            <Button
              variant="solid"
              onClick={batchBusy ? undefined : onReviewDeck}
              className={`srs-card-list-view__review${batchBusy ? " srs-btn-disabled" : ""}`}
            >
              复习此牌组
            </Button>
          )}
        </div>
      </div>

      <div className="srs-card-list-view__filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onFilterChange(tab.key)}
            className={
              currentFilter === tab.key
                ? "srs-filter-chip srs-filter-chip--active"
                : "srs-filter-chip"
            }
            disabled={controlsDisabled}
          >
            {tab.label} ({filterCounts[tab.key]})
          </button>
        ))}
      </div>
    </>
  )
}

const STATUS_OPTIONS: BrowserStatusFilter[] = [
  "active",
  "pending",
  "suspended"
]

const SORT_OPTIONS: BrowserSortKey[] = [
  "default",
  "due-asc",
  "due-desc",
  "front-az",
  "deck-az"
]

export type CardBrowserToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: BrowserStatusFilter
  onStatusChange: (value: BrowserStatusFilter) => void
  cardTypeFilter: string
  onCardTypeChange: (value: string) => void
  tagFilter: string
  onTagChange: (value: string) => void
  deckFilter: string
  onDeckFilterChange: (value: string) => void
  sortKey: BrowserSortKey
  onSortChange: (value: BrowserSortKey) => void
  tagOptions: string[]
  typeOptions: string[]
  /** 来源牌组筛选选项（当前 scope） */
  deckFilterOptions: string[]
  controlsDisabled: boolean
}

export function CardBrowserToolbar(props: CardBrowserToolbarProps) {
  const {
    search,
    onSearchChange,
    statusFilter,
    onStatusChange,
    cardTypeFilter,
    onCardTypeChange,
    tagFilter,
    onTagChange,
    deckFilter,
    onDeckFilterChange,
    sortKey,
    onSortChange,
    tagOptions,
    typeOptions,
    deckFilterOptions,
    controlsDisabled
  } = props

  return (
    <div className="srs-card-browser-toolbar">
      <div className="srs-card-browser-toolbar__search">
        <i className="ti ti-search" aria-hidden="true" />
        <input
          type="search"
          className="srs-card-browser-toolbar__search-input"
          placeholder="搜索正文 / 标签…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onSearchChange(e.target.value)
          }
          disabled={controlsDisabled}
          aria-label="搜索正文与标签"
        />
      </div>

      <label className="srs-card-browser-toolbar__field">
        <span className="srs-card-browser-toolbar__label">状态</span>
        <select
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onStatusChange(e.target.value as BrowserStatusFilter)
          }
          disabled={controlsDisabled}
        >
          {STATUS_OPTIONS.map((s: BrowserStatusFilter) => (
            <option key={s} value={s}>
              {BROWSER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="srs-card-browser-toolbar__field">
        <span className="srs-card-browser-toolbar__label">卡型</span>
        <select
          value={cardTypeFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onCardTypeChange(e.target.value)
          }
          disabled={controlsDisabled}
        >
          <option value="">全部</option>
          {typeOptions.map((t: string) => (
            <option key={t} value={t}>
              {cardTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>

      <label className="srs-card-browser-toolbar__field">
        <span className="srs-card-browser-toolbar__label">标签</span>
        <select
          value={tagFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onTagChange(e.target.value)
          }
          disabled={controlsDisabled || tagOptions.length === 0}
        >
          <option value="">全部</option>
          {tagOptions.map((t: string) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="srs-card-browser-toolbar__field">
        <span className="srs-card-browser-toolbar__label">来源牌组</span>
        <select
          value={deckFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onDeckFilterChange(e.target.value)
          }
          disabled={controlsDisabled}
        >
          <option value="">全部</option>
          {deckFilterOptions.map((d: string) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <label className="srs-card-browser-toolbar__field">
        <span className="srs-card-browser-toolbar__label">排序</span>
        <select
          value={sortKey}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onSortChange(e.target.value as BrowserSortKey)
          }
          disabled={controlsDisabled}
        >
          {SORT_OPTIONS.map((s: BrowserSortKey) => (
            <option key={s} value={s}>
              {BROWSER_SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
