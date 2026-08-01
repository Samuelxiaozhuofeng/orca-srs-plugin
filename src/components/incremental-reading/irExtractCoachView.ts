/**
 * 摘录处理建议虚拟块的纯展示模型（DOM-free，便于单测）。
 * 与 IRExtractCoach.tsx 分离：后者只做 React 接线，这里做可测的判定与映射。
 */

import type {
  ExtractCoachAction,
  ExtractCoachSuggestion
} from "../../srs/ai/aiExtractCoach"

/**
 * 仅 Extract 且 extract_focus 模式下显示虚拟块；Topic / 章节浏览隐藏。
 */
export function canShowExtractCoach(options: {
  cardType: "topic" | "extracts"
  mode: "extract_focus" | "chapter_browse"
}): boolean {
  return options.cardType === "extracts" && options.mode === "extract_focus"
}

export type ExtractCoachView =
  | { status: "done"; insight: string }
  | { status: "ready"; insight: string; actions: ExtractCoachAction[] }

/**
 * 将解析后的建议映射为展示视图：actions 为空 = 无需加工（done）。
 */
export function resolveExtractCoachView(
  suggestion: ExtractCoachSuggestion
): ExtractCoachView {
  return suggestion.actions.length === 0
    ? { status: "done", insight: suggestion.insight }
    : { status: "ready", insight: suggestion.insight, actions: suggestion.actions }
}
