/**
 * 漏斗阶段分布诊断（管理面板用）
 */

import type { IRCard } from "../incrementalReadingCollector"
import type { IRStage } from "./irTypes"

export type FunnelStageCounts = Record<string, number>

export function computeFunnelStageDistribution(cards: IRCard[]): FunnelStageCounts {
  const counts: FunnelStageCounts = {
    "topic.preview": 0,
    "topic.work": 0,
    "extract.raw": 0,
    "extract.refined": 0,
    "extract.item_candidate": 0,
    other: 0
  }

  for (const card of cards) {
    const stage = card.stage as IRStage | string
    if (stage in counts) counts[stage] += 1
    else counts.other += 1
  }
  return counts
}

export function findTopicStarvationRisk(
  cards: IRCard[],
  options: { now?: Date; overdueExtractThreshold?: number } = {}
): { atRisk: boolean; overdueExtracts: number; dueTopics: number } {
  const now = options.now ?? new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const threshold = options.overdueExtractThreshold ?? 50

  const overdueExtracts = cards.filter(c =>
    c.cardType === "extracts" &&
    new Date(c.due.getFullYear(), c.due.getMonth(), c.due.getDate()).getTime() < dayStart
  ).length

  const dueTopics = cards.filter(c =>
    c.cardType === "topic" &&
    new Date(c.due.getFullYear(), c.due.getMonth(), c.due.getDate()).getTime() <= dayStart
  ).length

  return {
    atRisk: overdueExtracts >= threshold && dueTopics > 0,
    overdueExtracts,
    dueTopics
  }
}

export function findStaleExtracts(
  cards: IRCard[],
  options: { now?: Date; staleDays?: number } = {}
): IRCard[] {
  const now = options.now ?? new Date()
  const staleDays = options.staleDays ?? 14
  const cutoff = now.getTime() - staleDays * 86400000

  return cards.filter(c => {
    if (c.cardType !== "extracts") return false
    if (c.stage === "extract.item_candidate") return false
    const last = c.lastRead?.getTime() ?? c.due.getTime()
    return last < cutoff
  })
}
