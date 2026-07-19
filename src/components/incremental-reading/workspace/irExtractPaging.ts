/** Expanded extract list page size (aligned with IR library flat list). */
export const IR_CHAPTER_EXTRACT_PAGE_SIZE = 30

/** Pure extract list slice for chapter expansion. */
export function pageExtracts<T>(
  extracts: readonly T[],
  displayCount: number
): T[] {
  const n = Math.max(0, Math.floor(displayCount))
  return extracts.slice(0, Math.min(n, extracts.length))
}

export function nextExtractDisplayCount(
  current: number,
  total: number,
  pageSize: number = IR_CHAPTER_EXTRACT_PAGE_SIZE
): number {
  return Math.min(Math.max(0, current) + pageSize, Math.max(0, total))
}
