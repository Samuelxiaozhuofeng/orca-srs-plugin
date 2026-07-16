/** 将正式根卡队列与子卡展开编排成会话初始队列。 */

import type { ReviewCard } from "./types"
import type { ReviewQueueLimits } from "./reviewSessionBudget"
import type {
  ChildExpandDiagnostic,
  ChildExpandLimits
} from "./childExpansionLimits"
import { expandChildCardsForRoots } from "./childCardExpansion"
import { buildReviewQueue } from "./reviewQueueBuilder"

export type SessionReviewQueueBuildResult = {
  queue: ReviewCard[]
  formalRootCards: ReviewCard[]
  childExpandDiagnostics: readonly ChildExpandDiagnostic[]
  childExpandLimits: ChildExpandLimits
  auxChildCount: number
}

export async function buildReviewQueueWithChildren(
  cards: readonly ReviewCard[],
  pluginName: string = "srs-plugin",
  limits?: ReviewQueueLimits | null,
  childExpandLimits?: Partial<ChildExpandLimits> | ChildExpandLimits | null
): Promise<ReviewCard[]> {
  const result = await buildSessionReviewQueue(
    cards,
    pluginName,
    limits,
    childExpandLimits
  )
  return result.queue
}

export async function buildSessionReviewQueue(
  cards: readonly ReviewCard[],
  pluginName: string = "srs-plugin",
  limits?: ReviewQueueLimits | null,
  childExpandLimits?: Partial<ChildExpandLimits> | ChildExpandLimits | null
): Promise<SessionReviewQueueBuildResult> {
  const formalRootCards = buildReviewQueue(cards, limits)
  const expanded = await expandChildCardsForRoots(
    formalRootCards,
    pluginName,
    childExpandLimits
  )
  console.log(
    `[${pluginName}] buildSessionReviewQueue: 正式根卡 ${formalRootCards.length} 张，` +
      `展开后 ${expanded.queue.length} 张（辅助 ${expanded.auxChildCount}）`
  )
  return {
    queue: expanded.queue,
    formalRootCards,
    childExpandDiagnostics: expanded.diagnostics,
    childExpandLimits: expanded.resolvedLimits,
    auxChildCount: expanded.auxChildCount
  }
}
