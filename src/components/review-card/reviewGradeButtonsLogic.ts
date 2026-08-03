/**
 * 评分按钮列表与 UI 选项解析（纯逻辑，可单测，不依赖 React / orca）
 */

import type { Grade } from "../../srs/types"
import { formatDueDate, formatIntervalChinese } from "../../srs/algorithm"
import { getReviewUiDisplaySettings } from "../../srs/settings/reviewServiceSettings"

export type ReviewGradeButtonDef = {
  grade: Grade
  emoji: string
  label: string
  tone: string
}

/**
 * 评分语义色：Again=danger / Hard=warning / Good=primary / Easy=success。
 */
export const FOUR_GRADE_BUTTONS: readonly ReviewGradeButtonDef[] = [
  { grade: "again", emoji: "😞", label: "忘记", tone: "again" },
  { grade: "hard", emoji: "😐", label: "困难", tone: "hard" },
  { grade: "good", emoji: "😊", label: "良好", tone: "good" },
  { grade: "easy", emoji: "😄", label: "简单", tone: "easy" }
]

/** Pass/Fail：失败→again，通过→good */
export const PASS_FAIL_BUTTONS: readonly ReviewGradeButtonDef[] = [
  { grade: "again", emoji: "😞", label: "失败", tone: "again" },
  { grade: "good", emoji: "😊", label: "通过", tone: "good" }
]

export function resolveGradeButtonList(
  passFailButtons: boolean
): readonly ReviewGradeButtonDef[] {
  return passFailButtons ? PASS_FAIL_BUTTONS : FOUR_GRADE_BUTTONS
}

export function formatGradePreview(interval: number, dueDate: Date): string {
  const intervalText = formatIntervalChinese(interval)
  return dueDate.toDateString() === new Date().toDateString()
    ? intervalText
    : `${formatDueDate(dueDate)} ${intervalText}`
}

/**
 * 合并显式 props 与 plugin settings（props 优先）。
 * 未传 pluginName 且无 props 时两项均为 false。
 */
export function resolveReviewGradeUiOptions(input: {
  pluginName?: string
  passFailButtons?: boolean
  showNextReviewTime?: boolean
}): { passFailButtons: boolean; showNextReviewTime: boolean } {
  const fromSettings = input.pluginName
    ? getReviewUiDisplaySettings(input.pluginName)
    : { passFailButtons: false, showNextReviewTime: false }
  return {
    passFailButtons: input.passFailButtons ?? fromSettings.passFailButtons,
    showNextReviewTime:
      input.showNextReviewTime ?? fromSettings.showNextReviewTime
  }
}
