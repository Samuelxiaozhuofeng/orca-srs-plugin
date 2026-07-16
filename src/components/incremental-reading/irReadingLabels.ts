import type { IRCard } from "../../srs/incrementalReadingCollector"

type ReadingLabelCard = Pick<IRCard, "cardType" | "sourceBookTitle">

/**
 * Book topics are presented to users as chapters. The underlying Topic type is
 * intentionally retained for scheduling and conversion behavior.
 */
export function formatIRReadingSourceLabel(card: ReadingLabelCard): string {
  const source = card.sourceBookTitle?.trim()
  const typeLabel = card.cardType === "extracts"
    ? "摘录"
    : source
      ? "章节"
      : "主题"

  return [source, typeLabel].filter(Boolean).join(" · ")
}
