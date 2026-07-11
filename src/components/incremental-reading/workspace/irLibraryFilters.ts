/**
 * 资料库筛选、排序与摘要（纯函数，无副作用）
 */

import type { IRCard } from "../../../srs/incrementalReadingCollector"
import {
  getIRDateGroup,
  IR_GROUP_ORDER,
  type IRCardGroup,
  type IRDateGroupKey
} from "../../../srs/incrementalReadingManagerUtils"
import { priorityToTier } from "../../../srs/incremental-reading/irQueuePolicy"

export type IRCardTypeFilter = "all" | "topic" | "extracts"
export type IRDueStatusFilter =
  | "all"
  | "overdue"
  | "today"
  | "tomorrow"
  | "upcoming7"
  | "later"
  | "new"
export type IRImportanceFilter = "all" | "low" | "medium" | "high"
export type IRLibrarySortBy = "due" | "priority" | "readCount" | "type" | "stage"
export type IRSortDir = "asc" | "desc"

export type IRLibraryFilters = {
  query: string
  cardType: IRCardTypeFilter
  /** "all" | "none" | sourceBookId 字符串 */
  sourceBook: string
  stage: string
  dueStatus: IRDueStatusFilter
  importance: IRImportanceFilter
  sortBy: IRLibrarySortBy
  sortDir: IRSortDir
}

export const DEFAULT_IR_LIBRARY_FILTERS: IRLibraryFilters = {
  query: "",
  cardType: "all",
  sourceBook: "all",
  stage: "all",
  dueStatus: "all",
  importance: "all",
  sortBy: "due",
  sortDir: "asc"
}

export type IRSourceBookOption = {
  id: string
  title: string
  count: number
}

export type IRLibrarySummary = {
  total: number
  filtered: number
  overdue: number
  today: number
  newCount: number
  topics: number
  extracts: number
}

const DUE_STATUS_TO_GROUP: Record<Exclude<IRDueStatusFilter, "all">, IRDateGroupKey | IRDateGroupKey[]> = {
  overdue: "已逾期",
  today: "今天",
  tomorrow: "明天",
  upcoming7: "未来7天",
  later: "7天后",
  new: "新卡"
}

export function createDefaultIRLibraryFilters(): IRLibraryFilters {
  return { ...DEFAULT_IR_LIBRARY_FILTERS }
}

export function hasActiveIRLibraryFilters(filters: IRLibraryFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.cardType !== "all" ||
    filters.sourceBook !== "all" ||
    filters.stage !== "all" ||
    filters.dueStatus !== "all" ||
    filters.importance !== "all" ||
    filters.sortBy !== DEFAULT_IR_LIBRARY_FILTERS.sortBy ||
    filters.sortDir !== DEFAULT_IR_LIBRARY_FILTERS.sortDir
  )
}

export function collectIRSourceBookOptions(cards: IRCard[]): IRSourceBookOption[] {
  const map = new Map<string, IRSourceBookOption>()
  for (const card of cards) {
    if (card.sourceBookId == null) continue
    const id = String(card.sourceBookId)
    const existing = map.get(id)
    if (existing) {
      existing.count += 1
    } else {
      map.set(id, {
        id,
        title: card.sourceBookTitle?.trim() || `书籍 #${id}`,
        count: 1
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, "zh"))
}

export function collectIRStageOptions(cards: IRCard[]): string[] {
  const stages = new Set<string>()
  for (const card of cards) {
    if (card.stage) stages.add(card.stage)
  }
  return Array.from(stages).sort()
}

function matchesQuery(card: IRCard, query: string, titleMap?: Record<string, string>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const title = (titleMap?.[String(card.id)] ?? "").toLowerCase()
  const book = (card.sourceBookTitle ?? "").toLowerCase()
  const stage = (card.stage ?? "").toLowerCase()
  const type = card.cardType.toLowerCase()
  const batch = (card.batchId ?? "").toLowerCase()
  return (
    title.includes(q) ||
    book.includes(q) ||
    stage.includes(q) ||
    type.includes(q) ||
    batch.includes(q) ||
    String(card.id).includes(q)
  )
}

function matchesDueStatus(card: IRCard, dueStatus: IRDueStatusFilter, now: Date): boolean {
  if (dueStatus === "all") return true
  const group = getIRDateGroup(card, now)
  const expected = DUE_STATUS_TO_GROUP[dueStatus]
  if (Array.isArray(expected)) return expected.includes(group)
  return group === expected
}

function matchesSourceBook(card: IRCard, sourceBook: string): boolean {
  if (sourceBook === "all") return true
  if (sourceBook === "none") return card.sourceBookId == null
  return String(card.sourceBookId ?? "") === sourceBook
}

function compareCards(
  a: IRCard,
  b: IRCard,
  sortBy: IRLibrarySortBy,
  sortDir: IRSortDir,
  titleMap?: Record<string, string>
): number {
  const dir = sortDir === "asc" ? 1 : -1
  let result = 0
  switch (sortBy) {
    case "priority":
      result = a.priority - b.priority
      break
    case "readCount":
      result = a.readCount - b.readCount
      break
    case "type":
      result = a.cardType.localeCompare(b.cardType)
      break
    case "stage":
      result = (a.stage ?? "").localeCompare(b.stage ?? "")
      break
    case "due":
    default:
      result = a.due.getTime() - b.due.getTime()
      break
  }
  if (result === 0 && titleMap) {
    const ta = titleMap[String(a.id)] ?? ""
    const tb = titleMap[String(b.id)] ?? ""
    result = ta.localeCompare(tb, "zh")
  }
  if (result === 0) {
    result = Number(a.id) - Number(b.id)
  }
  return result * dir
}

export function filterAndSortIRCards(
  cards: IRCard[],
  filters: IRLibraryFilters,
  options: { now?: Date; titleMap?: Record<string, string> } = {}
): IRCard[] {
  const now = options.now ?? new Date()
  const titleMap = options.titleMap

  const filtered = cards.filter(card => {
    if (!matchesQuery(card, filters.query, titleMap)) return false
    if (filters.cardType !== "all" && card.cardType !== filters.cardType) return false
    if (!matchesSourceBook(card, filters.sourceBook)) return false
    if (filters.stage !== "all" && card.stage !== filters.stage) return false
    if (!matchesDueStatus(card, filters.dueStatus, now)) return false
    if (filters.importance !== "all" && priorityToTier(card.priority) !== filters.importance) {
      return false
    }
    return true
  })

  return filtered.slice().sort((a, b) => compareCards(a, b, filters.sortBy, filters.sortDir, titleMap))
}

export function groupSortedIRLibraryCards(
  cards: IRCard[],
  now: Date = new Date()
): IRCardGroup[] {
  const groups = new Map<IRDateGroupKey, IRCard[]>(
    IR_GROUP_ORDER.map(key => [key, []])
  )
  for (const card of cards) {
    groups.get(getIRDateGroup(card, now))?.push(card)
  }
  return IR_GROUP_ORDER
    .map(key => ({ key, title: key, cards: groups.get(key) ?? [] }))
    .filter(group => group.cards.length > 0)
}

export function summarizeIRLibrary(
  allCards: IRCard[],
  filteredCards: IRCard[],
  now: Date = new Date()
): IRLibrarySummary {
  let overdue = 0
  let today = 0
  let newCount = 0
  let topics = 0
  let extracts = 0

  for (const card of allCards) {
    const group = getIRDateGroup(card, now)
    if (group === "已逾期") overdue += 1
    if (group === "今天") today += 1
    if (group === "新卡") newCount += 1
    if (card.cardType === "topic") topics += 1
    else extracts += 1
  }

  return {
    total: allCards.length,
    filtered: filteredCards.length,
    overdue,
    today,
    newCount,
    topics,
    extracts
  }
}

export function formatIRDueDate(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}/${month}/${day}`
}

export function formatIRDueDateTime(date: Date): string {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${formatIRDueDate(date)} ${hours}:${minutes}:${seconds}`
}

export function formatIRDueStatus(card: IRCard, now: Date = new Date()): string {
  return getIRDateGroup(card, now)
}

export function formatIRImportanceLabel(priority: number): string {
  const tier = priorityToTier(priority)
  if (tier === "high") return "高"
  if (tier === "medium") return "中"
  return "低"
}

export function formatIRCardTypeLabel(cardType: IRCard["cardType"]): string {
  return cardType === "topic" ? "主题" : "摘录"
}

const IR_STAGE_LABELS: Record<string, string> = {
  "topic.preview": "预览",
  "topic.work": "阅读",
  "extract.raw": "待整理",
  "extract.refined": "已整理",
  "extract.item_candidate": "待制卡"
}

export function formatIRStageLabel(stage: string): string {
  return IR_STAGE_LABELS[stage] ?? stage
}

export function getIRDueTone(card: IRCard, now: Date = new Date()): string {
  const group = getIRDateGroup(card, now)
  if (group === "新卡") return "new"
  if (group === "已逾期") return "overdue"
  if (group === "今天") return "today"
  return "upcoming"
}
