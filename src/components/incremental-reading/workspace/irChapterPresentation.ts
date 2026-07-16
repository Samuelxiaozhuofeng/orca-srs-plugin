import type { IRCard } from "../../../srs/incrementalReadingCollector"
import type { IRChapterNode } from "./irSourceTreeBuilder"

export type IRChapterPresentation = {
  chapterCard: IRCard | null
  isContextOnly: boolean
  canExpand: boolean
  extractCountLabel: string | null
}

/**
 * A matched Topic is rendered directly by the chapter header. If only child
 * extracts match, the same header becomes structural context and must not show
 * or expose the filtered-out Topic's scheduling actions.
 */
export function getIRChapterPresentation(chapter: IRChapterNode): IRChapterPresentation {
  const chapterCard = chapter.card && chapter.cardMatches ? chapter.card : null
  const isContextOnly = chapterCard == null
  const extractCount = chapter.extracts.length

  return {
    chapterCard,
    isContextOnly,
    canExpand: extractCount > 0,
    extractCountLabel: isContextOnly
      ? `${extractCount} 个匹配摘录`
      : extractCount > 0
        ? `${extractCount} 摘录`
        : null
  }
}
