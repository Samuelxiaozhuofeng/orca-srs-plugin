/**
 * 阅读与复习统一会话队列策略（纯函数、可测试）
 *
 * 统一推送语义（2026-07-27）：
 * - **没有时间盒**：今天到期的就是今天该学的，队列长度只由各自的每日上限决定
 *   （SRS `newCardsPerDay`/`reviewCardsPerDay` 由 `irMixedDailyBudget` 先扣；
 *   IR 由 `dailyLimit` 在 `selectQueueWithPolicy` 里截断）。
 *   旧口径先按分钟数换算预算、再 `floor(R*p/(1-p))` 由阅读条目数反推复习张数，
 *   阅读队列短时会把到期卡整体挤出会话，用户必须回首页另开 SRS 复习面板。
 * - 阅读队列为空时产出纯复习队列（同一面板继续学习）
 * - 交错保证：条目一张都不丢；阅读条目数 ≥ 复习数时不出现连续复习
 */

import type { IRCard } from "../incrementalReadingCollector"
import { getCardKey } from "../childCardCollector"
import { shouldTrackFormalShortRelearn } from "../pendingDueRequeue"
import type { ReviewCard } from "../types"

export type IRSessionEntry =
  | { kind: "reading"; card: IRCard; key: string }
  | { kind: "review"; card: ReviewCard; key: string }

/**
 * 单张复习卡默认耗时估算（秒）。
 * 仅用于「今日学习」摘要的 ETA 展示，**不**再参与队列长度决策。
 */
export const DEFAULT_REVIEW_CARD_COST_SECONDS = 45

/** 混合会话中复习评分成功后的自动前进停留时长（毫秒） */
export const IR_MIXED_REVIEW_AUTO_ADVANCE_MS = 800

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

export function reviewCardsToEntries(cards: ReviewCard[]): IRSessionEntry[] {
  return cards.map(card => ({
    kind: "review" as const,
    card,
    key: reviewEntryKey(card)
  }))
}

/**
 * 过滤统一会话可推送的复习卡：已到期即可（含新卡）。
 * 新卡/旧卡的每日额度与 2:1 交织由上游 `buildReviewQueue` 完成，
 * 此处只做「未到期不推」这一条判定；collectReviewCards 已排除暂停卡。
 */
export function filterEligibleReviewCards(
  cards: readonly ReviewCard[],
  now: Date = new Date()
): ReviewCard[] {
  const nowTime = now.getTime()
  return cards.filter(card => card.srs.due.getTime() <= nowTime)
}

/**
 * 均匀交错阅读与复习：两侧各自按 [0,1) 归一化位置摊开后合并。
 *
 * - 阅读位置 i/R 使首项在有阅读条目时必为阅读
 * - 复习位置 (j+1)/(V+1) 保证复习均匀落在阅读之间
 * - 位置相同时阅读优先
 * - 任一侧为空时直接返回另一侧；**任何情况下都不丢条目**
 *   （复习数 > 阅读数时必然出现连续复习，这是队列构成决定的，不再截断）
 */
export function interleaveReadingAndReviews(
  readings: IRCard[],
  reviews: ReviewCard[]
): IRSessionEntry[] {
  if (reviews.length === 0) return readingCardsToEntries(readings)
  if (readings.length === 0) return reviewCardsToEntries(reviews)

  const slots: { position: number; readingIndex: number; reviewIndex: number }[] = []
  for (let i = 0; i < readings.length; i++) {
    slots.push({ position: i / readings.length, readingIndex: i, reviewIndex: -1 })
  }
  for (let j = 0; j < reviews.length; j++) {
    slots.push({ position: (j + 1) / (reviews.length + 1), readingIndex: -1, reviewIndex: j })
  }
  slots.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    // 同位置阅读优先，保证首项与整体节奏以阅读为骨架
    return a.readingIndex >= 0 ? -1 : 1
  })

  return slots.map(slot =>
    slot.readingIndex >= 0
      ? {
        kind: "reading" as const,
        card: readings[slot.readingIndex],
        key: readingEntryKey(readings[slot.readingIndex])
      }
      : {
        kind: "review" as const,
        card: reviews[slot.reviewIndex],
        key: reviewEntryKey(reviews[slot.reviewIndex])
      }
  )
}

/**
 * 统一会话内的短期重学回流：Again/Hard 后 due 落在短期窗口内的卡，
 * 追加到当前队列尾部，本次会话内再出现一次（与独立复习会话同一口径）。
 * 仅评分路径调用；推迟 / 暂停不得回流。
 */
export function shouldRequeueReviewInSession(params: {
  grade: string
  updatedCard: ReviewCard
  nowMs: number
}): boolean {
  return shouldTrackFormalShortRelearn({
    grade: params.grade,
    dueTimeMs: params.updatedCard.srs.due.getTime(),
    nowMs: params.nowMs,
    isAuxiliaryPreview: params.updatedCard.isAuxiliaryPreview === true
  })
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
  /** 已扣完 SRS 今日 new/review 额度的复习候选（见 irMixedDailyBudget） */
  reviewCards: ReviewCard[]
  now?: Date
}

export type BuildMixedSessionQueueResult = {
  entries: IRSessionEntry[]
  selectedReviewCount: number
  /** 到期且可推送的复习卡总数；无时间盒后恒等于 selectedReviewCount */
  eligibleReviewCount: number
}

export function buildMixedSessionQueue(input: BuildMixedSessionQueueInput): BuildMixedSessionQueueResult {
  const { enabled, readingQueue, reviewCards, now = new Date() } = input

  if (!enabled) {
    return {
      entries: readingCardsToEntries(readingQueue),
      selectedReviewCount: 0,
      eligibleReviewCount: 0
    }
  }

  // 不再按时间预算截断：今日额度内的到期卡全部进队列，用户想停随时可停
  const eligible = filterEligibleReviewCards(reviewCards, now)
  const entries = interleaveReadingAndReviews(readingQueue, eligible)

  return {
    entries,
    selectedReviewCount: eligible.length,
    eligibleReviewCount: eligible.length
  }
}
