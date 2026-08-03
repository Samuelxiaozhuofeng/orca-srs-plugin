/**
 * 卡片浏览器：搜索 / 状态 / 标签 / 卡型 / 来源牌组筛选与稳定排序。
 * 纯函数，无 React / 无后端，便于 deterministic Vitest。
 */

import type { ReviewCard } from "../../srs/types"
import type { FilterType } from "../../srs/cardFilterUtils"
import { filterCards } from "../../srs/cardFilterUtils"
import {
  cardKeyFromReviewCard,
  inferCardType
} from "../../srs/cardIdentity"
import type { CardType } from "../../srs/types"

/** 操作状态筛选（与到期 tabs 正交，组合为 AND） */
export type BrowserStatusFilter = "active" | "pending" | "suspended"

/** 排序键；default = 保持输入顺序 */
export type BrowserSortKey =
  | "default"
  | "due-asc"
  | "due-desc"
  | "front-az"
  | "deck-az"

export type BrowserQuery = {
  /** 既有到期 tabs：全部 / 已到期 / 今天 / 未来 / 新卡 */
  dueFilter: FilterType
  /** 默认 active，不把暂停卡混进「全部」 */
  status: BrowserStatusFilter
  /** 正文 + 标签名搜索；trim 后大小写不敏感；空串 = 不限 */
  search: string
  /** 标签名精确匹配；空串 = 不限 */
  tag: string
  /** 卡型（inferCardType）；空串 = 不限 */
  cardType: string
  /** 来源牌组 = ReviewCard.deck；空串 = 不限 */
  deck: string
  sort: BrowserSortKey
}

export const DEFAULT_BROWSER_QUERY: BrowserQuery = {
  dueFilter: "all",
  status: "active",
  search: "",
  tag: "",
  cardType: "",
  deck: "",
  sort: "default"
}

/** 操作状态：paused 优先于 pending */
export function resolveBrowserStatus(
  card: Pick<ReviewCard, "isPending" | "isSuspended">
): BrowserStatusFilter {
  if (card.isSuspended) return "suspended"
  if (card.isPending) return "pending"
  return "active"
}

/**
 * 合并同 scope 的 active + suspended 行。
 * 暂停行若未带 isSuspended，补 true（防御性，真实收集路径应已标记）。
 */
export function mergeBrowserSourceCards(
  activeCards: readonly ReviewCard[],
  suspendedCards: readonly ReviewCard[]
): ReviewCard[] {
  const merged: ReviewCard[] = activeCards.slice()
  for (const card of suspendedCards) {
    merged.push(card.isSuspended ? card : { ...card, isSuspended: true })
  }
  return merged
}

function normalizeSearchNeedle(raw: string): string {
  return raw.trim().toLowerCase()
}

/** 正文 front/back + 标签名，大小写不敏感 */
export function matchesBrowserSearch(
  card: Pick<ReviewCard, "front" | "back" | "tags">,
  rawSearch: string
): boolean {
  const needle = normalizeSearchNeedle(rawSearch)
  if (!needle) return true

  const front = (card.front ?? "").toLowerCase()
  const back = (card.back ?? "").toLowerCase()
  if (front.includes(needle) || back.includes(needle)) return true

  const tags = card.tags
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if ((tag.name ?? "").toLowerCase().includes(needle)) return true
    }
  }
  return false
}

export function matchesBrowserStatus(
  card: Pick<ReviewCard, "isPending" | "isSuspended">,
  status: BrowserStatusFilter
): boolean {
  return resolveBrowserStatus(card) === status
}

export function matchesBrowserTag(
  card: Pick<ReviewCard, "tags">,
  rawTag: string
): boolean {
  const wanted = rawTag.trim()
  if (!wanted) return true
  const tags = card.tags
  if (!tags || tags.length === 0) return false
  return tags.some((t) => t.name === wanted)
}

export function matchesBrowserCardType(
  card: Pick<
    ReviewCard,
    "cardType" | "clozeNumber" | "directionType" | "listItemId"
  >,
  rawType: string
): boolean {
  const wanted = rawType.trim()
  if (!wanted) return true
  return inferCardType(card) === wanted
}

export function matchesBrowserDeck(
  card: Pick<ReviewCard, "deck">,
  rawDeck: string
): boolean {
  const wanted = rawDeck.trim()
  if (!wanted) return true
  return card.deck === wanted
}

function localeCompareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

/**
 * 稳定排序：相等时保留原相对顺序。
 * default 返回浅拷贝，不改序。
 */
export function stableSortBrowserCards(
  cards: readonly ReviewCard[],
  sort: BrowserSortKey
): ReviewCard[] {
  if (sort === "default") return cards.slice()

  const indexed = cards.map((card, index) => ({ card, index }))
  indexed.sort((a, b) => {
    let cmp = 0
    switch (sort) {
      case "due-asc":
        cmp = a.card.srs.due.getTime() - b.card.srs.due.getTime()
        break
      case "due-desc":
        cmp = b.card.srs.due.getTime() - a.card.srs.due.getTime()
        break
      case "front-az":
        cmp = localeCompareText(a.card.front ?? "", b.card.front ?? "")
        break
      case "deck-az":
        cmp = localeCompareText(a.card.deck ?? "", b.card.deck ?? "")
        break
      default:
        cmp = 0
    }
    if (cmp !== 0) return cmp
    return a.index - b.index
  })
  return indexed.map((x) => x.card)
}

/**
 * 组合筛选（AND）+ 稳定排序。
 * 到期 tabs 复用 cardFilterUtils.filterCards。
 */
export function queryBrowserCards(
  sourceCards: readonly ReviewCard[],
  query: BrowserQuery
): ReviewCard[] {
  let list = sourceCards.filter((card) => matchesBrowserStatus(card, query.status))

  list = filterCards(list, query.dueFilter)

  if (normalizeSearchNeedle(query.search)) {
    list = list.filter((card) => matchesBrowserSearch(card, query.search))
  }
  if (query.tag.trim()) {
    list = list.filter((card) => matchesBrowserTag(card, query.tag))
  }
  if (query.cardType.trim()) {
    list = list.filter((card) => matchesBrowserCardType(card, query.cardType))
  }
  if (query.deck.trim()) {
    list = list.filter((card) => matchesBrowserDeck(card, query.deck))
  }

  return stableSortBrowserCards(list, query.sort)
}

/** 从源列表收集去重后的标签名（排序） */
export function collectBrowserTagOptions(
  cards: readonly ReviewCard[]
): string[] {
  const set = new Set<string>()
  for (const card of cards) {
    for (const tag of card.tags ?? []) {
      const name = (tag.name ?? "").trim()
      if (name) set.add(name)
    }
  }
  return Array.from(set).sort((a, b) => localeCompareText(a, b))
}

/** 从源列表收集去重后的卡型（排序） */
export function collectBrowserCardTypeOptions(
  cards: readonly ReviewCard[]
): CardType[] {
  const set = new Set<CardType>()
  for (const card of cards) {
    set.add(inferCardType(card))
  }
  return Array.from(set).sort((a, b) => localeCompareText(a, b))
}

/** 从源列表收集去重后的来源牌组名（Default 置顶，其余 localeCompare） */
export function collectBrowserDeckOptions(
  cards: readonly ReviewCard[]
): string[] {
  const set = new Set<string>()
  for (const card of cards) {
    const name = (card.deck ?? "").trim()
    if (name) set.add(name)
  }
  const names = Array.from(set)
  names.sort((a, b) => {
    if (a === "Default" && b !== "Default") return -1
    if (b === "Default" && a !== "Default") return 1
    return localeCompareText(a, b)
  })
  return names
}

/** 筛选结果中的 cardKey 集合 */
export function browserCardKeySet(cards: readonly ReviewCard[]): Set<string> {
  const set = new Set<string>()
  for (const card of cards) {
    set.add(cardKeyFromReviewCard(card))
  }
  return set
}

/**
 * 筛选变化后裁剪选择：去掉已不在结果中的幽灵 key。
 * 返回同一 Set 引用当无变化，便于 useEffect 短路。
 */
export function pruneBrowserSelection(
  selectedKeys: ReadonlySet<string>,
  visibleKeys: ReadonlySet<string>
): Set<string> {
  let changed = false
  const next = new Set<string>()
  for (const key of selectedKeys) {
    if (visibleKeys.has(key)) {
      next.add(key)
    } else {
      changed = true
    }
  }
  if (!changed && next.size === selectedKeys.size) {
    return selectedKeys instanceof Set
      ? (selectedKeys as Set<string>)
      : new Set(selectedKeys)
  }
  return next
}

/** 按 block id 去重（保留首次出现的卡），用于牌组块级写入 / pending 激活 */
export function dedupeCardsByBlockId(
  cards: readonly ReviewCard[]
): ReviewCard[] {
  const seen = new Set<string>()
  const out: ReviewCard[] = []
  for (const card of cards) {
    const id = String(card.id)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(card)
  }
  return out
}

/** 从筛选结果里按 cardKey 取卡（稳定顺序 = keys 顺序） */
export function pickCardsByKeys(
  cards: readonly ReviewCard[],
  keys: ReadonlySet<string>
): ReviewCard[] {
  if (keys.size === 0) return []
  const map = new Map<string, ReviewCard>()
  for (const card of cards) {
    const key = cardKeyFromReviewCard(card)
    if (keys.has(key) && !map.has(key)) {
      map.set(key, card)
    }
  }
  const out: ReviewCard[] = []
  for (const key of keys) {
    const card = map.get(key)
    if (card) out.push(card)
  }
  return out
}

/**
 * 批量动作后的下一选择：
 * - 全成功 → 清空
 * - partial → 只保留 failed 的 cardKey（便于重试与看错误）
 * - 全失败 → 保持原选择
 */
export function nextSelectionAfterBatch(
  previousKeys: ReadonlySet<string>,
  result: {
    success: ReadonlyArray<{ cardKey: string }>
    failed: ReadonlyArray<{ cardKey: string }>
  }
): Set<string> {
  if (result.failed.length === 0) {
    return new Set()
  }
  if (result.success.length === 0) {
    return previousKeys instanceof Set
      ? (previousKeys as Set<string>)
      : new Set(previousKeys)
  }
  return new Set(result.failed.map((f) => f.cardKey))
}

/**
 * 可复习的到期计数：仅 active 非 pending 卡（复习队列不收 pending/suspended）。
 * overdue+today 口径与到期 tabs 自然日一致。
 */
export function countReviewableDueCards(
  activeCards: readonly ReviewCard[],
  now: Date = new Date()
): { overdue: number; today: number; hasDue: boolean } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  let overdue = 0
  let todayCount = 0
  for (const card of activeCards) {
    if (card.isPending || card.isSuspended || card.isNew) continue
    const due = card.srs.due
    if (due < today) overdue += 1
    else if (due < tomorrow) todayCount += 1
  }
  return {
    overdue,
    today: todayCount,
    hasDue: overdue + todayCount > 0
  }
}

/** 到期 tabs 计数：先按操作状态收窄，再按自然日分桶 */
export function countDueFilterTabs(
  sourceCards: readonly ReviewCard[],
  status: BrowserStatusFilter,
  now: Date = new Date()
): Record<"all" | "overdue" | "today" | "future" | "new", number> {
  const statusScoped = sourceCards.filter((c) => matchesBrowserStatus(c, status))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return {
    all: statusScoped.length,
    overdue: statusScoped.filter((c) => !c.isNew && c.srs.due < today).length,
    today: statusScoped.filter(
      (c) => !c.isNew && c.srs.due >= today && c.srs.due < tomorrow
    ).length,
    future: statusScoped.filter((c) => !c.isNew && c.srs.due >= tomorrow).length,
    new: statusScoped.filter((c) => c.isNew).length
  }
}

export const CARD_TYPE_LABELS: Record<string, string> = {
  basic: "基础",
  cloze: "填空",
  direction: "方向",
  list: "列表",
  choice: "选择",
  excerpt: "摘录",
  extracts: "渐进摘录",
  topic: "主题",
  "image-occlusion": "图片遮罩"
}

export function cardTypeLabel(type: string): string {
  return CARD_TYPE_LABELS[type] ?? type
}

export const BROWSER_STATUS_LABELS: Record<BrowserStatusFilter, string> = {
  active: "正常",
  pending: "待激活",
  suspended: "已暂停"
}

export const BROWSER_SORT_LABELS: Record<BrowserSortKey, string> = {
  default: "默认顺序",
  "due-asc": "到期时间 ↑",
  "due-desc": "到期时间 ↓",
  "front-az": "正文 A-Z",
  "deck-az": "牌组 A-Z"
}
