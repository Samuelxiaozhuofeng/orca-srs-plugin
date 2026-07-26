import type { Grade } from "../../srs/types"
import { formatDueDate, formatIntervalChinese } from "../../srs/algorithm"

const { Button } = orca.components

type ReviewGradeButtonsProps = {
  intervals: Record<Grade, number>
  dueDates: Record<Grade, Date>
  onGrade: (grade: Grade) => void | Promise<void>
  onSkip?: () => void
  readOnly?: boolean
}

/**
 * 评分语义色（见 模块文档/SRS_UI设计规范.md 一致性原则）：
 * Again=danger / Hard=warning / Good=primary / Easy=success。
 * 具体取色在 `srs-review.css` 的 `.srs-grade-btn--*` 中由 Orca 主题变量派生。
 */
const GRADE_BUTTONS: Array<{
  grade: Grade
  emoji: string
  label: string
  tone: string
}> = [
  { grade: "again", emoji: "😞", label: "忘记", tone: "again" },
  { grade: "hard", emoji: "😐", label: "困难", tone: "hard" },
  { grade: "good", emoji: "😊", label: "良好", tone: "good" },
  { grade: "easy", emoji: "😄", label: "简单", tone: "easy" }
]

function formatPreview(interval: number, dueDate: Date): string {
  const intervalText = formatIntervalChinese(interval)
  return dueDate.toDateString() === new Date().toDateString()
    ? intervalText
    : `${formatDueDate(dueDate)} ${intervalText}`
}

export default function ReviewGradeButtons({
  intervals,
  dueDates,
  onGrade,
  onSkip,
  readOnly = false
}: ReviewGradeButtonsProps) {
  if (readOnly) {
    return (
      <div contentEditable={false} className="srs-review-actions">
        {onSkip && (
          <Button
            variant="solid"
            onClick={onSkip}
            title="继续复习"
            className="srs-review-cta"
          >
            继续
          </Button>
        )}
      </div>
    )
  }

  return (
    <div contentEditable={false} className="srs-card-grade-buttons srs-grade-buttons">
      {onSkip && (
        <GradeButton
          preview="不评分"
          emoji="⏭️"
          label="跳过"
          tone="skip"
          onClick={onSkip}
        />
      )}
      {GRADE_BUTTONS.map(({ grade, emoji, label, tone }) => (
        <GradeButton
          key={grade}
          preview={formatPreview(intervals[grade], dueDates[grade])}
          emoji={emoji}
          label={label}
          tone={tone}
          onClick={() => onGrade(grade)}
        />
      ))}
    </div>
  )
}

function GradeButton({
  preview,
  emoji,
  label,
  tone,
  onClick
}: {
  preview: string
  emoji: string
  label: string
  tone: string
  onClick: () => void | Promise<void>
}) {
  return (
    <button
      onClick={onClick}
      className={`srs-grade-btn srs-grade-btn--${tone}`}
    >
      <div className="srs-grade-btn__preview">
        {preview}
      </div>
      <span className="srs-grade-btn__emoji">{emoji}</span>
      <span className="srs-grade-btn__label">
        {label}
      </span>
    </button>
  )
}
