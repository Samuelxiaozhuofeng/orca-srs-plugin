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

const GRADE_BUTTONS: Array<{
  grade: Grade
  emoji: string
  label: string
  color: string
}> = [
  { grade: "again", emoji: "😞", label: "忘记", color: "239, 68, 68" },
  { grade: "hard", emoji: "😐", label: "困难", color: "251, 191, 36" },
  { grade: "good", emoji: "😊", label: "良好", color: "34, 197, 94" },
  { grade: "easy", emoji: "😄", label: "简单", color: "59, 130, 246" }
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
      <div contentEditable={false} style={{
        display: "flex",
        justifyContent: "center",
        marginTop: "8px"
      }}>
        {onSkip && (
          <Button
            variant="solid"
            onClick={onSkip}
            title="继续复习"
            style={{ padding: "12px 32px", fontSize: "16px" }}
          >
            继续
          </Button>
        )}
      </div>
    )
  }

  return (
    <div contentEditable={false} className="srs-card-grade-buttons" style={{
      display: "grid",
      gridTemplateColumns: onSkip ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
      gap: "8px"
    }}>
      {onSkip && (
        <GradeButton
          preview="不评分"
          emoji="⏭️"
          label="跳过"
          color="156, 163, 175"
          onClick={onSkip}
        />
      )}
      {GRADE_BUTTONS.map(({ grade, emoji, label, color }) => (
        <GradeButton
          key={grade}
          preview={formatPreview(intervals[grade], dueDates[grade])}
          emoji={emoji}
          label={label}
          color={color}
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
  color,
  onClick
}: {
  preview: string
  emoji: string
  label: string
  color: string
  onClick: () => void | Promise<void>
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "16px 8px",
        fontSize: "14px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        backgroundColor: `rgba(${color}, 0.12)`,
        border: `1px solid rgba(${color}, 0.2)`,
        borderRadius: "8px",
        cursor: "pointer",
        transition: "all 0.2s"
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = `rgba(${color}, 0.18)`
        event.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = `rgba(${color}, 0.12)`
        event.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
        {preview}
      </div>
      <span style={{ fontSize: "32px", lineHeight: "1" }}>{emoji}</span>
      <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>
        {label}
      </span>
    </button>
  )
}
