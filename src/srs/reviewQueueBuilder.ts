/**
 * 复习根卡队列的纯构建算法。
 *
 * 本模块不读取 Orca 状态或插件设置；调用方必须显式传入额度。
 */

import type { ReviewCard } from "./types"
import type { ReviewQueueLimits } from "./reviewSessionBudget"
import { compareReviewCardIdentity } from "./cardIdentity"

/** 筛选当前已到期的旧卡 / 新卡（精确到时分秒），保持输入相对顺序。 */
export function partitionDueAndNewCards(
  cards: readonly ReviewCard[],
  now: Date = new Date()
): { dueCards: ReviewCard[]; newCards: ReviewCard[] } {
  const nowTime = now.getTime()

  const dueCards = cards.filter((card) => {
    if (card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

  const newCards = cards.filter((card) => {
    if (!card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

  return { dueCards, newCards }
}

/** due 升序；相同 due 使用结构化卡片身份保证顺序稳定。 */
export function compareReviewCardsForQueue(a: ReviewCard, b: ReviewCard): number {
  const dueA = a.srs.due.getTime()
  const dueB = b.srs.due.getTime()
  if (dueA !== dueB) return dueA - dueB
  return compareReviewCardIdentity(a, b)
}

export function sortCardsForReviewQueue(
  cards: readonly ReviewCard[]
): ReviewCard[] {
  return [...cards].sort(compareReviewCardsForQueue)
}

/** 在已排序的旧卡/新卡序列上应用每日正式根卡额度。 */
export function applyDailyRootLimits(
  dueCards: readonly ReviewCard[],
  newCards: readonly ReviewCard[],
  limits?: ReviewQueueLimits | null
): { dueCards: ReviewCard[]; newCards: ReviewCard[] } {
  if (limits == null) {
    return { dueCards: [...dueCards], newCards: [...newCards] }
  }
  return {
    dueCards: dueCards.slice(0, limits.reviewCardsPerDay),
    newCards: newCards.slice(0, limits.newCardsPerDay)
  }
}

/** 2 旧 : 1 新交织，保持两个输入序列各自的相对顺序。 */
export function interleaveDueAndNew(
  dueCards: readonly ReviewCard[],
  newCards: readonly ReviewCard[]
): ReviewCard[] {
  const queue: ReviewCard[] = []
  let dueIndex = 0
  let newIndex = 0

  while (dueIndex < dueCards.length || newIndex < newCards.length) {
    for (let i = 0; i < 2 && dueIndex < dueCards.length; i++) {
      queue.push(dueCards[dueIndex++])
    }
    if (newIndex < newCards.length) queue.push(newCards[newIndex++])
  }

  return queue
}

/**
 * 构建只包含正式根卡的复习队列：分区 → 稳定排序 → 限额 → 2:1 交织。
 */
export function buildReviewQueue(
  cards: readonly ReviewCard[],
  limits?: ReviewQueueLimits | null
): ReviewCard[] {
  const { dueCards, newCards } = partitionDueAndNewCards(cards)
  const sortedDue = sortCardsForReviewQueue(dueCards)
  const sortedNew = sortCardsForReviewQueue(newCards)
  const limited = applyDailyRootLimits(sortedDue, sortedNew, limits)
  return interleaveDueAndNew(limited.dueCards, limited.newCards)
}
