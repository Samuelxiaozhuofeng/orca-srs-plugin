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
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--orca-color-text-2)",
          fontWeight: 600,
          letterSpacing: "0.02em"
        }}
      >
        重要性
      </div>
      <div style={{ fontSize: 12, color: "var(--orca-color-text-3)", lineHeight: 1.45 }}>
        越高越容易进今天的队列，之后也会更频繁再推；可随时在阅读中改。
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt) => {
          const checked = selectedTier === opt.tier
          return (
            <label
              key={opt.tier}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: checked
                  ? "1px solid var(--orca-color-primary-6, #3b82f6)"
                  : "1px solid var(--orca-color-border-1, #ddd)",
                backgroundColor: checked
                  ? "var(--orca-color-bg-2, #f8fafc)"
                  : "transparent",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1
              }}
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
                style={{ marginTop: 3 }}
                aria-label={opt.title}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--orca-color-text-1)" }}>
                  {opt.title}
                  {opt.recommended ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        color: "var(--orca-color-primary-6, #3b82f6)"
                      }}
                    >
                      推荐
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: 12, color: "var(--orca-color-text-3)", lineHeight: 1.4 }}>
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
