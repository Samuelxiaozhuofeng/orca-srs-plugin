import type { SrsState } from "../../srs/types"
import { State } from "ts-fsrs"

function formatCardState(state?: State): string {
  switch (state) {
    case State.Learning: return "学习中"
    case State.Review: return "复习中"
    case State.Relearning: return "重学中"
    case State.New:
    case undefined:
    case null:
      return "新卡"
    default:
      return "未知"
  }
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "从未"
  const value = new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  const hour = String(value.getHours()).padStart(2, "0")
  const minute = String(value.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export default function CardInfoPanel({ srsInfo }: { srsInfo?: Partial<SrsState> }) {
  const rows = [
    ["遗忘次数", String(srsInfo?.lapses ?? 0)],
    ["复习次数", String(srsInfo?.reps ?? 0)],
    ["最后复习", formatDateTime(srsInfo?.lastReviewed)],
    ["下次到期", formatDateTime(srsInfo?.due)],
    ["间隔天数", `${srsInfo?.interval ?? 0} 天`],
    ["稳定性", (srsInfo?.stability ?? 0).toFixed(2)],
    ["难度", (srsInfo?.difficulty ?? 0).toFixed(2)]
  ] as const

  const stateColor = srsInfo?.state === State.Review
    ? "var(--orca-color-success)"
    : srsInfo?.state === State.Learning || srsInfo?.state === State.Relearning
      ? "var(--orca-color-warning)"
      : "var(--orca-color-primary)"

  return (
    <div contentEditable={false} style={{
      marginBottom: "12px",
      padding: "12px 16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)"
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {rows.slice(0, 2).map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
        <InfoRow label="卡片状态" value={formatCardState(srsInfo?.state)} color={stateColor} />
        {rows.slice(2).map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  )
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span style={{ color: color ?? "var(--orca-color-text-1)" }}>{value}</span>
    </div>
  )
}
