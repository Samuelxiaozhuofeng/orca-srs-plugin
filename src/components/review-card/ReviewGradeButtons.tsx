import type { Grade } from "../../srs/types"
import { subscribeReviewUiDisplaySettings } from "../../srs/settings/reviewServiceSettings"
import {
  formatGradePreview,
  resolveGradeButtonList,
  resolveReviewGradeUiOptions
} from "./reviewGradeButtonsLogic"

export {
  FOUR_GRADE_BUTTONS,
  PASS_FAIL_BUTTONS,
  formatGradePreview,
  resolveGradeButtonList,
  resolveReviewGradeUiOptions,
  type ReviewGradeButtonDef
} from "./reviewGradeButtonsLogic"

const { Button } = orca.components
const { useEffect, useState } = window.React

type ReviewGradeButtonsProps = {
  intervals: Record<Grade, number>
  dueDates: Record<Grade, Date>
  onGrade: (grade: Grade) => void | Promise<void>
  onSkip?: () => void
  readOnly?: boolean
  /**
   * 用于读取 `review.passFailButtons` / `review.showNextReviewTime`。
   * 缺省时两项均为默认关闭。保存设置后经 revision 订阅重读。
   */
  pluginName?: string
  /**
   * 覆盖设置：Pass/Fail 仅失败+通过（again/good）。
   * 选择题应显式传 `false`（始终四级，含建议 hard）。
   */
  passFailButtons?: boolean
  /** 覆盖设置：是否显示按钮上方下次复习时间 */
  showNextReviewTime?: boolean
  /** 选择题建议评分高亮 */
  suggestedGrade?: Grade | null
  /** 评分进行中（视觉 busy；点击仍由上层 handleGrade 门闩） */
  isGrading?: boolean
}

export default function ReviewGradeButtons({
  intervals,
  dueDates,
  onGrade,
  onSkip,
  readOnly = false,
  pluginName,
  passFailButtons: passFailProp,
  showNextReviewTime: showTimeProp,
  suggestedGrade = null,
  isGrading = false
}: ReviewGradeButtonsProps) {
  // 设置保存后 bump revision → 重读 settings，避免答案已显示时按钮与快捷键分叉
  const [, setRevision] = useState(0)
  useEffect(() => {
    return subscribeReviewUiDisplaySettings(() => {
      setRevision((n: number) => n + 1)
    })
  }, [])

  const { passFailButtons, showNextReviewTime } = resolveReviewGradeUiOptions({
    pluginName,
    passFailButtons: passFailProp,
    showNextReviewTime: showTimeProp
  })

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

  const buttons = resolveGradeButtonList(passFailButtons)

  return (
    <div contentEditable={false} className="srs-card-grade-buttons srs-grade-buttons">
      {onSkip && (
        <GradeButton
          preview={showNextReviewTime ? "不评分" : null}
          emoji="⏭️"
          label="跳过"
          tone="skip"
          busy={isGrading}
          onClick={onSkip}
        />
      )}
      {buttons.map(({ grade, emoji, label, tone }) => (
        <GradeButton
          key={grade}
          preview={
            showNextReviewTime
              ? formatGradePreview(intervals[grade], dueDates[grade])
              : null
          }
          emoji={emoji}
          label={label}
          tone={tone}
          suggested={suggestedGrade === grade}
          busy={isGrading}
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
  suggested = false,
  busy = false,
  onClick
}: {
  preview: string | null
  emoji: string
  label: string
  tone: string
  suggested?: boolean
  busy?: boolean
  onClick: () => void | Promise<void>
}) {
  const classes = [
    "srs-grade-btn",
    `srs-grade-btn--${tone}`,
    suggested ? "srs-grade-btn--suggested" : "",
    busy ? "srs-grade-btn--busy" : ""
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button onClick={onClick} className={classes}>
      {preview != null ? (
        <div className="srs-grade-btn__preview">{preview}</div>
      ) : null}
      <span className="srs-grade-btn__emoji">{emoji}</span>
      <span className="srs-grade-btn__label">{label}</span>
    </button>
  )
}
