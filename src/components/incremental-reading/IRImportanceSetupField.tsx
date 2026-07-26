/**
 * Three-tier importance picker for IR book / EPUB setup dialogs.
 * Storage remains continuous `ir.priority` (20 / 50 / 80 via setup helpers).
 */

import {
  importanceSetupOptions,
  importanceToTier
} from "../../srs/incremental-reading/irImportance"

export type IRImportanceSetupFieldProps = {
  valuePriority: number
  onChange: (priority: number) => void
  disabled?: boolean
  /** Unique radio group name when multiple fields may mount (optional). */
  name?: string
}

export default function IRImportanceSetupField({
  valuePriority,
  onChange,
  disabled,
  name = "ir-importance-setup"
}: IRImportanceSetupFieldProps) {
  const selectedTier = importanceToTier(valuePriority)
  const options = importanceSetupOptions()

  return (
    <div
      role="radiogroup"
      aria-label="重要性"
      className="ir-importance-field"
    >
      <div className="ir-importance-field__label">
        重要性
      </div>
      <div className="ir-importance-field__hint">
        越高越容易进今天的队列，之后也会更频繁再推；可随时在阅读中改。
      </div>
      <div className="ir-importance-field__options">
        {options.map((opt) => {
          const checked = selectedTier === opt.tier
          return (
            <label
              key={opt.tier}
              className={[
                "ir-importance-option",
                checked ? "ir-importance-option--checked" : "",
                disabled ? "ir-importance-option--disabled" : ""
              ].filter(Boolean).join(" ")}
            >
              <input
                type="radio"
                name={name}
                value={opt.tier}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  if (disabled) return
                  onChange(opt.priority)
                }}
                className="ir-importance-option__radio"
                aria-label={opt.title}
              />
              <span className="ir-importance-option__body">
                <span className="ir-importance-option__title">
                  {opt.title}
                  {opt.recommended ? (
                    <span className="ir-importance-option__recommended">
                      推荐
                    </span>
                  ) : null}
                </span>
                <span className="ir-importance-option__scene">
                  {opt.scene}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
