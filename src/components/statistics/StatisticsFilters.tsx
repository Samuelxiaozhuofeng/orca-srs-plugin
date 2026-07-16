/**
 * 统计页筛选器：时间范围 + 牌组
 */

import type { TimeRange, DeckInfo } from "../../srs/types"

// ========================================
// 时间范围选项
// ========================================

export const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "1month", label: "1个月" },
  { key: "3months", label: "3个月" },
  { key: "1year", label: "1年" },
  { key: "all", label: "全部" }
]

// ========================================
// 子组件：时间范围选择器
// Requirements: 8.1, 8.2
// ========================================

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div style={{
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    }}>
      {TIME_RANGE_OPTIONS.map(option => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          style={{
            padding: "6px 12px",
            borderRadius: "16px",
            border: "1px solid",
            borderColor: value === option.key
              ? "var(--orca-color-primary-5)"
              : "var(--orca-color-border-1)",
            backgroundColor: value === option.key
              ? "var(--orca-color-primary-1)"
              : "transparent",
            color: value === option.key
              ? "var(--orca-color-primary-6)"
              : "var(--orca-color-text-2)",
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ========================================
// 子组件：牌组筛选器
// Requirements: 9.1, 9.2, 9.3
// ========================================

interface DeckFilterProps {
  decks: DeckInfo[]
  selectedDeck: string | undefined
  onChange: (deckName: string | undefined) => void
}

export function DeckFilter({ decks, selectedDeck, onChange }: DeckFilterProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }}>
      <span style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>牌组:</span>
      <select
        value={selectedDeck || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-1)",
          color: "var(--orca-color-text-1)",
          fontSize: "13px",
          cursor: "pointer",
          minWidth: "120px"
        }}
      >
        <option value="">全部牌组</option>
        {decks.map(deck => (
          <option key={deck.name} value={deck.name}>{deck.name}</option>
        ))}
      </select>
    </div>
  )
}
