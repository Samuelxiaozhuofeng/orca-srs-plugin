/**
 * 复习快捷键 Hook
 *
 * 为 SRS 复习界面提供键盘快捷键支持（与 Anki 一致）：
 * - 空格：显示答案（答案未显示时）/ 评分为良好（答案已显示时）
 * - 1：again（忘记）
 * - 2：hard（困难）
 * - 3：good（良好）
 * - 4：easy（简单）
 * - b：postpone（推迟到明天）
 * - s：suspend（暂停卡片）
 *
 * 选择题卡片额外支持：
 * - 1-9：选择对应选项（答案未显示时）
 * - Enter：提交答案（多选模式）
 *
 * FC-06：readOnly 时禁用评分、bury、suspend、choice 选择/提交；
 * 仍允许显示答案（只读回看）。
 */

import type { Grade, ChoiceMode } from "../srs/types"
import { resolveReviewShortcut } from "./reviewShortcutRules"

export {
  resolveReviewShortcut,
  type ResolvedReviewShortcut,
  type ResolveReviewShortcutInput
} from "./reviewShortcutRules"

const { useEffect, useCallback } = window.React

/**
 * 选择题卡片配置
 */
type ChoiceCardOptions = {
  /** 选择题模式 */
  mode: ChoiceMode
  /** 选项数量 */
  optionCount: number
  /** 选择选项回调（索引从0开始） */
  onSelectOption: (index: number) => void
  /** 提交答案回调（多选模式） */
  onSubmit: () => void
}

type UseReviewShortcutsOptions = {
  /** 答案是否已显示 */
  showAnswer: boolean
  /** 是否正在评分中（防止重复触发） */
  isGrading: boolean
  /** 显示答案的回调 */
  onShowAnswer?: () => void
  /** 评分回调 */
  onGrade: (grade: Grade) => void
  /** 推迟卡片回调 */
  onBury?: () => void
  /** 暂停卡片回调 */
  onSuspend?: () => void
  /** 是否启用快捷键（默认 true） */
  enabled?: boolean
  /**
   * FC-06 只读回看：禁用评分 / 推迟 / 暂停 / 选择题提交与选项选择。
   * 仍允许显示答案以便回看。
   */
  readOnly?: boolean
  /** 选择题卡片配置（可选） */
  choiceCard?: ChoiceCardOptions
}

/**
 * 使用复习快捷键
 */
export function useReviewShortcuts({
  showAnswer,
  isGrading,
  onShowAnswer,
  onGrade,
  onBury,
  onSuspend,
  enabled = true,
  readOnly = false,
  choiceCard
}: UseReviewShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const target = event.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      const resolved = resolveReviewShortcut({
        key: event.key,
        showAnswer,
        isGrading,
        enabled,
        readOnly,
        choiceCard: choiceCard
          ? { mode: choiceCard.mode, optionCount: choiceCard.optionCount }
          : undefined,
        hasShowAnswer: !!onShowAnswer,
        hasBury: !!onBury,
        hasSuspend: !!onSuspend
      })

      if (resolved.type === "none") return

      event.preventDefault()
      event.stopPropagation()

      switch (resolved.type) {
        case "showAnswer":
          onShowAnswer?.()
          break
        case "grade":
          onGrade(resolved.grade)
          break
        case "bury":
          onBury?.()
          break
        case "suspend":
          onSuspend?.()
          break
        case "choiceSelect":
          choiceCard?.onSelectOption(resolved.index)
          break
        case "choiceSubmit":
          choiceCard?.onSubmit()
          break
      }
    },
    [
      showAnswer,
      isGrading,
      onShowAnswer,
      onGrade,
      onBury,
      onSuspend,
      enabled,
      readOnly,
      choiceCard
    ]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown, enabled])
}

export default useReviewShortcuts
