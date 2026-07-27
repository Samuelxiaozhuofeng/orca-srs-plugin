/**
 * 混合会话中的 SRS 复习候选：复用正式日额度路径，不超过 review remaining。
 * 纯函数 + 可注入 deps 的异步加载；日志读取失败必须抛出/error，不得 []。
 */

import type { ReviewCard, ReviewLogEntry } from "../types"
import { buildReviewQueue } from "../reviewQueueBuilder"
import {
  getLocalTodayBounds,
  remainingDailyLimitsFromLogs,
  resolveDailyQueueLimits,
  type RemainingDailyLimits
} from "../reviewSessionBudget"
import { getReviewSettings } from "../settings/reviewSettingsSchema"
import { getReviewLogs } from "../reviewLogStorage"
import { collectReviewCards } from "../cardCollector"

export type MixedDailyBudgetResult = {
  readonly eligibleReviewCards: ReviewCard[]
  readonly remainingLimits: RemainingDailyLimits
  readonly configuredNew: number
  readonly configuredReview: number
}

/**
 * 从已收集卡片 + 今日日志构建统一会话可推送的复习卡（已扣日额度）。
 * - buildReviewQueue 应用 new/review remaining，并按 2 旧 : 1 新交织
 * - 新卡同属「今日学习」，不再单独剔除（否则新卡永远只能另开复习面板）
 * - 结果长度 ≤ remaining.newCardsPerDay + remaining.reviewCardsPerDay
 */
export function buildMixedEligibleReviewCardsFromDailyBudget(input: {
  allCards: readonly ReviewCard[]
  todayLogs: readonly ReviewLogEntry[]
  rawNewCardsPerDay: unknown
  rawReviewCardsPerDay: unknown
  now?: Date
}): MixedDailyBudgetResult {
  const now = input.now ?? new Date()
  const configured = resolveDailyQueueLimits(
    input.rawNewCardsPerDay,
    input.rawReviewCardsPerDay
  )
  const remaining = remainingDailyLimitsFromLogs(
    configured,
    input.todayLogs
  )
  const queue = buildReviewQueue(
    [...input.allCards],
    {
      newCardsPerDay: remaining.newCardsPerDay,
      reviewCardsPerDay: remaining.reviewCardsPerDay
    },
    now
  )
  return {
    eligibleReviewCards: queue,
    remainingLimits: remaining,
    configuredNew: configured.newCardsPerDay,
    configuredReview: configured.reviewCardsPerDay
  }
}

export type LoadMixedEligibleReviewCardsDeps = {
  collectReviewCards: (pluginName: string) => Promise<ReviewCard[]>
  getReviewLogs: (
    pluginName: string,
    start: Date,
    end: Date
  ) => Promise<ReviewLogEntry[]>
  getReviewSettings: (pluginName: string) => {
    newCardsPerDay: number
    reviewCardsPerDay: number
  }
}

const defaultDeps: LoadMixedEligibleReviewCardsDeps = {
  collectReviewCards,
  getReviewLogs,
  getReviewSettings
}

/**
 * 加载 mixed 复习候选。getReviewLogs 失败必须抛出，调用方 fail-closed。
 */
export async function loadMixedEligibleReviewCards(
  pluginName: string,
  now: Date = new Date(),
  deps: Partial<LoadMixedEligibleReviewCardsDeps> = {}
): Promise<MixedDailyBudgetResult> {
  const d = { ...defaultDeps, ...deps }
  const bounds = getLocalTodayBounds(now)
  const allCards = await d.collectReviewCards(pluginName)
  // 故意不 catch：日志失败向上传播
  const todayLogs = await d.getReviewLogs(pluginName, bounds.start, bounds.end)
  const settings = d.getReviewSettings(pluginName)
  return buildMixedEligibleReviewCardsFromDailyBudget({
    allCards,
    todayLogs,
    rawNewCardsPerDay: settings.newCardsPerDay,
    rawReviewCardsPerDay: settings.reviewCardsPerDay,
    now
  })
}
