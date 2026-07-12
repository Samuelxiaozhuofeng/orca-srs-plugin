/**
 * 复习快捷键纯解析逻辑（可单测，不依赖 React / window）
 *
 * FC-06：readOnly 时禁用评分、bury、suspend、choice 选择/提交；
 * 仍允许显示答案以便只读回看。
 */

import type { Grade, ChoiceMode } from "../srs/types"

const SHORTCUTS: Record<string, Grade | "showAnswer" | "bury" | "suspend"> = {
  " ": "showAnswer",
  "1": "again",
  "2": "hard",
  "3": "good",
  "4": "easy",
  b: "bury",
  s: "suspend"
}

export type ResolvedReviewShortcut =
  | { type: "showAnswer" }
  | { type: "grade"; grade: Grade }
  | { type: "bury" }
  | { type: "suspend" }
  | { type: "choiceSelect"; index: number }
  | { type: "choiceSubmit" }
  | { type: "none" }

export type ResolveReviewShortcutInput = {
  key: string
  showAnswer: boolean
  isGrading: boolean
  enabled?: boolean
  readOnly?: boolean
  choiceCard?: {
    mode: ChoiceMode
    optionCount: number
  }
  hasShowAnswer?: boolean
  hasBury?: boolean
  hasSuspend?: boolean
}

/**
 * 解析按键应触发的动作
 */
export function resolveReviewShortcut(
  input: ResolveReviewShortcutInput
): ResolvedReviewShortcut {
  const {
    key,
    showAnswer,
    isGrading,
    enabled = true,
    readOnly = false,
    choiceCard,
    hasShowAnswer = true,
    hasBury = true,
    hasSuspend = true
  } = input

  if (!enabled || isGrading) {
    return { type: "none" }
  }

  if (choiceCard && !showAnswer) {
    const num = parseInt(key, 10)
    if (num >= 1 && num <= 9 && num <= choiceCard.optionCount) {
      if (readOnly) return { type: "none" }
      return { type: "choiceSelect", index: num - 1 }
    }
    if (key === "Enter" && choiceCard.mode === "multiple") {
      if (readOnly) return { type: "none" }
      return { type: "choiceSubmit" }
    }
  }

  const action = SHORTCUTS[key]
  if (!action) return { type: "none" }

  if (action === "showAnswer") {
    if (!showAnswer) {
      if (choiceCard && choiceCard.mode === "multiple") {
        if (readOnly) return { type: "none" }
        return { type: "choiceSubmit" }
      }
      if (hasShowAnswer) return { type: "showAnswer" }
      return { type: "none" }
    }
    if (readOnly) return { type: "none" }
    return { type: "grade", grade: "good" }
  }

  if (action === "bury") {
    if (readOnly || !hasBury) return { type: "none" }
    return { type: "bury" }
  }

  if (action === "suspend") {
    if (readOnly || !hasSuspend) return { type: "none" }
    return { type: "suspend" }
  }

  if (showAnswer) {
    if (readOnly) return { type: "none" }
    return { type: "grade", grade: action }
  }

  return { type: "none" }
}
