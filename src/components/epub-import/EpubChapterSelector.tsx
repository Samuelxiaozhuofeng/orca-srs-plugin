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
      <div className="srs-chapter-selector__toolbar">
        <Button
          variant="outline"
          onClick={disabled ? undefined : selectAll}
          aria-disabled={disabled}
          className={disabled ? "srs-ui-locked" : undefined}
        >
          {labels.selectAll}
        </Button>
        <Button
          variant="outline"
          onClick={disabled ? undefined : clearAll}
          aria-disabled={disabled}
          className={disabled ? "srs-ui-locked" : undefined}
        >
          {labels.clearAll}
        </Button>
        <span className="srs-chapter-selector__count">
          已选 {selectedKeys.length}/{chapters.length}
        </span>
      </div>
      <div className="srs-chapter-selector__list">
        {chapters.map((ch) => {
          const checked = selectedSet.has(ch.key)
          const itemDisabled = disabled || ch.disabled
          return (
            <label
              key={ch.key}
              className={`srs-chapter-selector__item${
                itemDisabled ? " srs-chapter-selector__item--disabled" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={itemDisabled}
                aria-label={ch.title}
                onChange={() => toggle(ch.key)}
              />
              <span className="srs-chapter-selector__label">
                <span className="srs-chapter-selector__index">
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
