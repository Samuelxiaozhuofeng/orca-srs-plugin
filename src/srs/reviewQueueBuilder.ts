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

  // pending 卡尚未激活：已建好但不排期，必须排除在两个分区之外。
  const dueCards = cards.filter((card) => {
    if (card.isPending) return false
    if (card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

  const newCards = cards.filter((card) => {
    if (card.isPending) return false
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
 * 同批卡聚簇。
 *
 * 一次 AI 制卡产出的多张卡若分散在队列各处，用户会反复遇到「这段我刚复习过」
 * 却又想不起细节——同源材料分散复习既低效也伤体感。
 *
 * 做法：以每个批次**最早到期的成员**作为该批次的锚点位置，把同批其余卡
 * 紧随其后插入。批次之间、以及无 batchId 的卡之间，原有的 due 升序完全不变；
 * 因此聚簇只改变同批卡的相对聚合，不会把晚到期的卡提前到别的批次之前。
 *
 * **范围限定**：本函数作用在单个分区（旧卡或新卡）内部。之后的 2:1 交织
 * 仍会在其中插入另一分区的卡，因此最终队列里同批卡是「相邻但可能被隔开
 * 一两张」，而不是严格连续。这是刻意的取舍：强行严格相邻等于让一批新卡
 * 连续出现，恰好破坏 2:1 交织要防的事。
 *
 * 输入必须是已排序序列（sortCardsForReviewQueue 的输出）。
 */
export function clusterCardsByBatch(
  cards: readonly ReviewCard[]
): ReviewCard[] {
  const grouped = new Map<string, ReviewCard[]>()
  for (const card of cards) {
    if (!card.batchId) continue
    const bucket = grouped.get(card.batchId)
    if (bucket) bucket.push(card)
    else grouped.set(card.batchId, [card])
  }

  // 只有单张的批次不构成簇，按原位处理即可
  const clustered = new Set(
    Array.from(grouped.entries())
      .filter(([, members]) => members.length > 1)
      .map(([batchId]) => batchId)
  )
  if (clustered.size === 0) return [...cards]

  const emitted = new Set<ReviewCard>()
  const result: ReviewCard[] = []

  for (const card of cards) {
    if (emitted.has(card)) continue
    const batchId = card.batchId
    if (batchId && clustered.has(batchId)) {
      // 首次遇到该批次即为锚点：整批就地展开
      for (const member of grouped.get(batchId)!) {
        result.push(member)
        emitted.add(member)
      }
      continue
    }
    result.push(card)
    emitted.add(card)
  }

  return result
}

/**
 * 构建只包含正式根卡的复习队列：分区 → 稳定排序 → 限额 → 同批聚簇 → 2:1 交织。
 * @param now 可选；注入后 due 判定使用该时刻（测试/摘要确定性）
 */
export function buildReviewQueue(
  cards: readonly ReviewCard[],
  limits?: ReviewQueueLimits | null,
  now: Date = new Date()
): ReviewCard[] {
  const { dueCards, newCards } = partitionDueAndNewCards(cards, now)
  const sortedDue = sortCardsForReviewQueue(dueCards)
  const sortedNew = sortCardsForReviewQueue(newCards)
  const limited = applyDailyRootLimits(sortedDue, sortedNew, limits)
  // 聚簇放在限额之后：否则整批卡会一起挤进额度，把当日队列变成单一材料。
  return interleaveDueAndNew(
    clusterCardsByBatch(limited.dueCards),
    clusterCardsByBatch(limited.newCards)
  )
}
