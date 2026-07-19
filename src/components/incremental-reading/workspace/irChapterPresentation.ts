import type { IRCard } from "../../../srs/incrementalReadingCollector"
import type { IRChapterNode, IRSequentialChapterStatus } from "./irSourceTreeBuilder"

export type IRChapterPresentation = {
  chapterCard: IRCard | null
  isContextOnly: boolean
  canExpand: boolean
  extractCountLabel: string | null
  /**
   * Effective status for badge/CSS. Prefer chapter.sequentialStatus; when only
   * `isCompletedContext` is set, this is `"completed"`.
   */
  sequentialStatus: IRSequentialChapterStatus | null
  sequentialStatusLabel: string | null
  isSequentialPlaceholder: boolean
  /**
   * True for structural-only completed outline rows (no matching chapter card),
   * whether marked via sequentialStatus completed or isCompletedContext.
   */
  isCompletedContext: boolean
  /** True when the row must not expose IR card actions / selection. */
  isNonActionable: boolean
}

const SEQUENTIAL_STATUS_LABELS: Record<IRSequentialChapterStatus, string> = {
  active: "当前激活",
  pending: "未激活",
  completed: "已完成",
  skipped: "已跳过"
}

export function getSequentialStatusLabel(
  status: IRSequentialChapterStatus | null | undefined
): string | null {
  if (!status) return null
  return SEQUENTIAL_STATUS_LABELS[status] ?? null
}

/**
 * A matched Topic is rendered directly by the chapter header. If only child
 * extracts match, the same header becomes structural context and must not show
 * or expose the filtered-out Topic's scheduling actions.
 *
 * Sequential placeholders (plan outline without IR card) are also non-actionable.
 * Completed context chapters (card null + sequentialStatus completed, or
 * isCompletedContext) show 「已完成」 and stay non-actionable while extracts remain expandable.
 */
export function getIRChapterPresentation(chapter: IRChapterNode): IRChapterPresentation {
  const rawSequentialStatus = chapter.sequentialStatus ?? null
  const isSequentialPlaceholder = chapter.isSequentialPlaceholder === true && !chapter.card
  const chapterCard =
    !isSequentialPlaceholder && chapter.card && chapter.cardMatches ? chapter.card : null
  const isContextOnly = chapterCard == null
  const extractCount = chapter.extracts.length

  // Tree builder may set sequentialStatus "completed" and/or isCompletedContext.
  const flaggedCompletedContext = chapter.isCompletedContext === true
  const isCompletedContext =
    flaggedCompletedContext || (rawSequentialStatus === "completed" && isContextOnly)

  // Unified display status: sequential wins; bare isCompletedContext → completed.
  const sequentialStatus: IRSequentialChapterStatus | null =
    rawSequentialStatus ?? (flaggedCompletedContext ? "completed" : null)
  const sequentialStatusLabel = getSequentialStatusLabel(sequentialStatus)

  return {
    chapterCard,
    isContextOnly,
    canExpand: extractCount > 0,
    extractCountLabel: isContextOnly
      ? extractCount > 0
        ? `${extractCount} 个匹配摘录`
        : null
      : extractCount > 0
        ? `${extractCount} 摘录`
        : null,
    sequentialStatus,
    sequentialStatusLabel,
    isSequentialPlaceholder,
    isCompletedContext,
    isNonActionable: chapterCard == null
  }
}
