/**
 * 主页三数 → 全局卡片列表筛选映射。
 * 与 cardFilterUtils.FilterType 自然日语义对齐（积压 → overdue）。
 */

import type { FilterType } from "../../srs/cardFilterUtils"

/** 全局列表（跨牌组）的 selectedDeck 哨兵值 */
export const GLOBAL_DECK_SCOPE = "__all__"

export type HomeStatKind = "new" | "today" | "backlog"

export function homeStatToFilter(kind: HomeStatKind): FilterType {
  switch (kind) {
    case "new":
      return "new"
    case "today":
      return "today"
    case "backlog":
      return "overdue"
  }
}

export function homeStatListTitle(kind: HomeStatKind): string {
  switch (kind) {
    case "new":
      return "全部 · 新卡"
    case "today":
      return "全部 · 今日到期"
    case "backlog":
      return "全部 · 积压"
  }
}

export function isGlobalDeckScope(deckName: string | null | undefined): boolean {
  return deckName === GLOBAL_DECK_SCOPE
}

export function resolveCardListTitle(
  deckName: string,
  filter: FilterType
): string {
  if (!isGlobalDeckScope(deckName)) return deckName
  if (filter === "new") return homeStatListTitle("new")
  if (filter === "today") return homeStatListTitle("today")
  if (filter === "overdue") return homeStatListTitle("backlog")
  return "全部牌组"
}
