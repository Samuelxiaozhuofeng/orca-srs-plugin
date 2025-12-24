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
 * - Requirements: 5.1, 5.2, 5.3, 5.4
 */

import type { Grade, ChoiceMode } from "../srs/types"

const { useEffect, useCallback } = window.React

/**
 * 快捷键配置
 */
const SHORTCUTS: Record<string, Grade | "showAnswer" | "bury" | "suspend"> = {
  " ": "showAnswer",  // 空格显示答案
  "1": "again",       // 忘记
  "2": "hard",        // 困难
  "3": "good",        // 良好
  "4": "easy",        // 简单
  "b": "bury",        // 推迟到明天（内部仍使用bury以保持兼容）
  "s": "suspend",     // 暂停卡片
}

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
  /** 选择题卡片配置（可选） */
  choiceCard?: ChoiceCardOptions
}

/**
 * 使用复习快捷键
 *
 * @param options - 快捷键配置选项
 *
 * @example
 * ```tsx
 * // 普通卡片
 * useReviewShortcuts({
 *   showAnswer,
 *   isGrading,
 *   onShowAnswer: () => setShowAnswer(true),
 *   onGrade: handleGrade,
 *   onBury: handleBury,
 *   onSuspend: handleSuspend,
 * })
 * 
 * // 选择题卡片
 * useReviewShortcuts({
 *   showAnswer: isAnswerRevealed,
 *   isGrading,
 *   onGrade: handleGrade,
 *   onBury: handleBury,
 *   onSuspend: handleSuspend,
 *   choiceCard: {
 *     mode: "single",
 *     optionCount: options.length,
 *     onSelectOption: (index) => handleOptionClick(options[index].blockId),
 *     onSubmit: handleSubmit,
 *   },
 * })
 * ```
 */
export function useReviewShortcuts({
  showAnswer,
  isGrading,
  onShowAnswer,
  onGrade,
  onBury,
  onSuspend,
  enabled = true,
  choiceCard,
}: UseReviewShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // 如果快捷键被禁用，直接返回
      if (!enabled) return

      // 忽略来自输入框的按键事件
      const target = event.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      // 选择题卡片特殊处理
      if (choiceCard && !showAnswer && !isGrading) {
        // 数字键 1-9 选择选项（Requirements 5.1, 5.2）
        const num = parseInt(event.key)
        if (num >= 1 && num <= 9 && num <= choiceCard.optionCount) {
          event.preventDefault()
          event.stopPropagation()
          choiceCard.onSelectOption(num - 1)
          return
        }

        // Enter 键提交答案（多选模式）（Requirements 5.3）
        if (event.key === "Enter" && choiceCard.mode === "multiple") {
          event.preventDefault()
          event.stopPropagation()
          choiceCard.onSubmit()
          return
        }
      }

      const action = SHORTCUTS[event.key]
      if (!action) return

      // 阻止默认行为（如空格滚动页面）
      event.preventDefault()
      event.stopPropagation()

      if (action === "showAnswer") {
        // 空格键：显示答案（答案未显示时）或评分为良好（答案已显示时）
        if (!showAnswer && !isGrading) {
          // 选择题多选模式：空格提交答案
          if (choiceCard && choiceCard.mode === "multiple") {
            choiceCard.onSubmit()
          } else if (onShowAnswer) {
            onShowAnswer()
          }
        } else if (showAnswer && !isGrading) {
          onGrade("good")
        }
      } else if (action === "bury") {
        // b 键：推迟卡片（任何时候都可以）
        if (!isGrading && onBury) {
          onBury()
        }
      } else if (action === "suspend") {
        // s 键：暂停卡片（任何时候都可以）
        if (!isGrading && onSuspend) {
          onSuspend()
        }
      } else {
        // 数字键 1-4：评分（仅在答案已显示且未在评分中时有效）（Requirements 5.4）
        if (showAnswer && !isGrading) {
          onGrade(action)
        }
      }
    },
    [showAnswer, isGrading, onShowAnswer, onGrade, onBury, onSuspend, enabled, choiceCard]
  )

  useEffect(() => {
    if (!enabled) return

    // 添加全局键盘事件监听
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown, enabled])
}

export default useReviewShortcuts

