import type { SrsState } from "../../srs/types"
import { State } from "ts-fsrs"

export function formatCardState(state?: State): string {
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

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "从未"
  const value = new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  const hour = String(value.getHours()).padStart(2, "0")
  const minute = String(value.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export default function CardInfoPanel({
  srsInfo,
  showSchedulingDetails = true
}: {
  srsInfo?: Partial<SrsState>
  /** 是否显示间隔天数/稳定性/难度三行（选择题卡历史上不展示） */
  showSchedulingDetails?: boolean
}) {
  const rows: Array<[string, string]> = [
    ["遗忘次数", String(srsInfo?.lapses ?? 0)],
    ["复习次数", String(srsInfo?.reps ?? 0)],
    ["最后复习", formatDateTime(srsInfo?.lastReviewed)],
    ["下次到期", formatDateTime(srsInfo?.due)]
  ]
  if (showSchedulingDetails) {
    rows.push(
      ["间隔天数", `${srsInfo?.interval ?? 0} 天`],
      ["稳定性", (srsInfo?.stability ?? 0).toFixed(2)],
      ["难度", (srsInfo?.difficulty ?? 0).toFixed(2)]
    )
  }

  // 语义色取自设计令牌层（`srs-design-tokens.css`）。
  // 原实现用的 `--orca-color-success/warning/primary`（无数字后缀）在 Orca 里并不存在，
  // 且未写 fallback —— 卡片状态色实际一直静默继承父级颜色，从未生效。
  const stateColor = srsInfo?.state === State.Review
    ? "var(--srs-accent-success)"
    : srsInfo?.state === State.Learning || srsInfo?.state === State.Relearning
      ? "var(--srs-accent-warn)"
      : "var(--srs-accent-new)"

  return (
    <div contentEditable={false} className="srs-review-info-panel">
      <div className="srs-review-info-panel__rows">
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
  // 卡片状态色为语义色（回归测试 CardInfoPanel.test.ts 固定其取值），
  // 属运行时动态值，按规范允许留在内联 style；其余视觉表现全部由 CSS 类承担。
  return (
    <div className="srs-review-info-row">
      <span>{label}</span>
      <span
        className="srs-review-info-row__value"
        style={{ color: color ?? "var(--orca-color-text-1)" }}
      >
        {value}
      </span>
    </div>
  )
}
