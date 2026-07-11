/**
 * Chapter multi-select list for EPUB import / IR subset.
 */

import type { EpubChapter } from "../../importers/epub/types"
import { accessibilityLabels } from "./epubImportViewModel"

const { Button } = orca.components

export type EpubChapterSelectorProps = {
  chapters: Array<Pick<EpubChapter, "key" | "title" | "spineIndex"> & { disabled?: boolean }>
  selectedKeys: string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
  label?: string
}

export default function EpubChapterSelector({
  chapters,
  selectedKeys,
  onChange,
  disabled,
  label
}: EpubChapterSelectorProps) {
  const labels = accessibilityLabels()
  const selectedSet = new Set(selectedKeys)

  const toggle = (key: string) => {
    if (disabled) return
    if (selectedSet.has(key)) {
      onChange(selectedKeys.filter((k) => k !== key))
    } else {
      onChange([...selectedKeys, key])
    }
  }

  const selectAll = () => {
    if (disabled) return
    onChange(chapters.filter((c) => !c.disabled).map((c) => c.key))
  }

  const clearAll = () => {
    if (disabled) return
    onChange([])
  }

  return (
    <div role="group" aria-label={label || labels.chapterList}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Button
          variant="outline"
          onClick={disabled ? undefined : selectAll}
          aria-disabled={disabled}
          style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          {labels.selectAll}
        </Button>
        <Button
          variant="outline"
          onClick={disabled ? undefined : clearAll}
          aria-disabled={disabled}
          style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          {labels.clearAll}
        </Button>
        <span style={{ fontSize: 12, color: "var(--orca-color-text-2)", alignSelf: "center" }}>
          已选 {selectedKeys.length}/{chapters.length}
        </span>
      </div>
      <div
        style={{
          maxHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--orca-color-border-1, #ddd)",
          borderRadius: 8,
          padding: 8
        }}
      >
        {chapters.map((ch) => {
          const checked = selectedSet.has(ch.key)
          const itemDisabled = disabled || ch.disabled
          return (
            <label
              key={ch.key}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                padding: "6px 4px",
                opacity: itemDisabled ? 0.5 : 1,
                cursor: itemDisabled ? "not-allowed" : "pointer"
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={itemDisabled}
                aria-label={ch.title}
                onChange={() => toggle(ch.key)}
              />
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>
                <span style={{ color: "var(--orca-color-text-3)", marginRight: 6 }}>
                  {ch.spineIndex + 1}.
                </span>
                {ch.title}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
