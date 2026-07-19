/** Page size for infinite scroll (matches CardListView). */
export const DIFFICULT_CARDS_PAGE_SIZE = 20
/** Hard UI cap to avoid multi-thousand DOM + Block preview mounts. */
export const DIFFICULT_CARDS_HARD_CAP = 500

/** Pure paging helper shared by view + tests. */
export function pageSlice<T>(items: readonly T[], displayCount: number): T[] {
  const n = Math.max(0, Math.floor(displayCount))
  return items.slice(0, Math.min(n, items.length))
}

/** Pure hard-cap helper shared by view + tests. */
export function applyHardCap<T>(
  items: readonly T[],
  cap: number = DIFFICULT_CARDS_HARD_CAP
): T[] {
  const n = Math.max(0, Math.floor(cap))
  return items.slice(0, n)
}
