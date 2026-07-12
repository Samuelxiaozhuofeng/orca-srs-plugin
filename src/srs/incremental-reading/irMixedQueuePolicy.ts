/**
 * 阅读与复习混合会话队列策略（纯函数、可测试）
 */

import type { IRCard } from "../incrementalReadingCollector"
import { getCardKey } from "../childCardCollector"
import type { ReviewCard } from "../types"
import { stableUnitRandom } from "./irQueuePolicy"

export type IRSessionEntry =
  | { kind: "reading"; card: IRCard; key: string }
  | { kind: "review"; card: ReviewCard; key: string }

export const MIXED_LEARNING_RATIO_OPTIONS = [20, 30, 40] as const
export type MixedLearningReviewRatio = (typeof MIXED_LEARNING_RATIO_OPTIONS)[number]

export const DEFAULT_MIXED_LEARNING_REVIEW_RATIO: MixedLearningReviewRatio = 30

/** 单张复习卡默认耗时估算（秒），用于时间盒预算 */
export const DEFAULT_REVIEW_CARD_COST_SECONDS = 45

/** 混合会话中复习评分成功后的自动前进停留时长（毫秒） */
export const IR_MIXED_REVIEW_AUTO_ADVANCE_MS = 800

export function normalizeMixedLearningRatio(value: unknown): MixedLearningReviewRatio {
  if (value === 20 || value === 30 || value === 40) return value
  return DEFAULT_MIXED_LEARNING_REVIEW_RATIO
}

export function readingEntryKey(card: IRCard): string {
  return `reading-${card.id}`
}

export function reviewEntryKey(card: ReviewCard): string {
  return `review-${getCardKey(card)}`
}

export function readingCardsToEntries(cards: IRCard[]): IRSessionEntry[] {
  return cards.map(card => ({
    kind: "reading" as const,
    card,
    key: readingEntryKey(card)
  }))
}

/**
 * 过滤会话启动时可混入的复习卡：已到期、非新卡（collectReviewCards 已排除暂停卡）
 */
export function filterEligibleReviewCards(cards: ReviewCard[], now: Date = new Date()): ReviewCard[] {
  const nowTime = now.getTime()
  return cards.filter(card => {
    if (card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })
}

/**
 * 目标复习数量：p 为占比（0-1），R 为阅读条目数
 * targetReviewCount = floor(R * p / (1 - p))
 */
export function computeTargetReviewCount(readingCount: number, ratioPercent: number): number {
  if (readingCount <= 0 || ratioPercent <= 0 || ratioPercent >= 100) return 0
  const p = ratioPercent / 100
  return Math.floor((readingCount * p) / (1 - p))
}

export function estimateReviewCardCostSeconds(_card?: ReviewCard): number {
  return DEFAULT_REVIEW_CARD_COST_SECONDS
}

function compareReviewCardsStable(a: ReviewCard, b: ReviewCard, seed: string): number {
  const keyA = getCardKey(a)
  const keyB = getCardKey(b)
  if (keyA !== keyB) {
    return stableUnitRandom(seed, hashString(keyA)) - stableUnitRandom(seed, hashString(keyB))
  }
  return 0
}

function hashString(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * 在预算内选取复习卡（确定性排序，不随机）
 */
export function selectReviewCardsForMixedQueue(
  cards: ReviewCard[],
  targetCount: number,
  remainingBudgetSeconds: number,
  seed: string
): ReviewCard[] {
  if (targetCount <= 0 || cards.length === 0) return []

  const sorted = [...cards].sort((a, b) => compareReviewCardsStable(a, b, seed))
  const selected: ReviewCard[] = []
  let cost = 0

  for (const card of sorted) {
    if (selected.length >= targetCount) break
    const cardCost = estimateReviewCardCostSeconds(card)
    if (cost + cardCost > remainingBudgetSeconds) break
    selected.push(card)
    cost += cardCost
  }

  return selected
}

/**
 * 计算复习卡应插入在哪张阅读卡之后（0-based reading index）
 * 保证不连续复习、首项必为阅读
 */
export function computeReviewInsertAfterIndices(readingCount: number, reviewCount: number): number[] {
  if (reviewCount <= 0 || readingCount <= 0) return []

  const indices: number[] = []
  const used = new Set<number>()

  for (let k = 0; k < reviewCount; k++) {
    let after = Math.floor(((k + 1) * readingCount) / (reviewCount + 1)) - 1
    after = Math.max(0, Math.min(readingCount - 1, after))

    while (used.has(after) && after < readingCount - 1) after += 1
    if (used.has(after)) {
      after = Math.max(0, after - 1)
      while (used.has(after) && after > 0) after -= 1
    }

    if (!used.has(after)) {
      used.add(after)
      indices.push(after)
    }
  }

  return indices.sort((a, b) => a - b)
}

export function interleaveReadingAndReviews(
  readings: IRCard[],
  reviews: ReviewCard[]
): IRSessionEntry[] {
  if (readings.length === 0) return []
  if (reviews.length === 0) return readingCardsToEntries(readings)

  const insertAfter = computeReviewInsertAfterIndices(readings.length, reviews.length)
  const entries: IRSessionEntry[] = []
  let reviewIdx = 0

  for (let r = 0; r < readings.length; r++) {
    entries.push({
      kind: "reading",
      card: readings[r],
      key: readingEntryKey(readings[r])
    })
    while (reviewIdx < insertAfter.length && insertAfter[reviewIdx] === r) {
      entries.push({
        kind: "review",
        card: reviews[reviewIdx],
        key: reviewEntryKey(reviews[reviewIdx])
      })
      reviewIdx += 1
    }
  }

  return entries
}

export function hasConsecutiveReviews(entries: IRSessionEntry[]): boolean {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].kind === "review" && entries[i - 1].kind === "review") return true
  }
  return false
}

export type BuildMixedSessionQueueInput = {
  enabled: boolean
  readingQueue: IRCard[]
  reviewCards: ReviewCard[]
  reviewRatioPercent: number
  budgetSeconds: number
  readingCostSeconds: number
  seed: string
  now?: Date
}

export type BuildMixedSessionQueueResult = {
  entries: IRSessionEntry[]
  selectedReviewCount: number
  targetReviewCount: number
}

export function buildMixedSessionQueue(input: BuildMixedSessionQueueInput): BuildMixedSessionQueueResult {
  const {
    enabled,
    readingQueue,
    reviewCards,
    reviewRatioPercent,
    budgetSeconds,
    readingCostSeconds,
    seed,
    now = new Date()
  } = input

  if (!enabled || readingQueue.length === 0) {
    return {
      entries: readingCardsToEntries(readingQueue),
      selectedReviewCount: 0,
      targetReviewCount: 0
    }
  }

  const ratio = normalizeMixedLearningRatio(reviewRatioPercent)
  const eligible = filterEligibleReviewCards(reviewCards, now)
  const targetReviewCount = computeTargetReviewCount(readingQueue.length, ratio)
  const remainingBudget = Math.max(0, budgetSeconds - readingCostSeconds)

  const selectedReviews = selectReviewCardsForMixedQueue(
    eligible,
    targetReviewCount,
    remainingBudget,
    seed
  )

  const entries = interleaveReadingAndReviews(readingQueue, selectedReviews)

  return {
    entries,
    selectedReviewCount: selectedReviews.length,
    targetReviewCount
  }
}
