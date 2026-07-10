/**
 * 纯函数队列策略：时间预算、Topic 最低曝光、新 Extract 配额、稳定随机
 */

import type { IRCard } from "../incrementalReadingCollector"
import { estimateCardCostSecondsCalibrated } from "./irCostCalibration"
import type { IRTimeBudgetMinutes } from "./irTypes"

export type QueueCostEstimateSeconds = number

export type IRQueuePolicyConfig = {
  timeBudgetMinutes: IRTimeBudgetMinutes | number
  dailyLimit: number
  topicMinRatio: number
  topicMinCount: number
  newExtractMaxRatio: number
  explorationRatio: number
  highPriorityThreshold: number
  /** 稳定随机种子（通常为当日 YYYY-MM-DD） */
  seed: string
}

export const DEFAULT_QUEUE_POLICY: Omit<IRQueuePolicyConfig, "seed" | "timeBudgetMinutes" | "dailyLimit"> = {
  topicMinRatio: 0.1,
  topicMinCount: 1,
  newExtractMaxRatio: 0.2,
  explorationRatio: 0.05,
  highPriorityThreshold: 80
}

export function estimateCardCostSeconds(card: IRCard): QueueCostEstimateSeconds {
  if (card.cardType === "extracts") {
    // 粗略：读次数少/新卡视为短 Extract
    return card.isNew || card.readCount <= 1 ? 30 : 60
  }
  return card.isNew || card.readCount <= 1 ? 90 : 180
}

export function budgetSeconds(timeBudgetMinutes: number): number {
  return Math.max(60, Math.floor(timeBudgetMinutes * 60))
}

/** 简单稳定 hash → [0,1) */
export function stableUnitRandom(seed: string, id: number): number {
  let h = 2166136261
  const text = `${seed}:${id}`
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

function getDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isOverdue(card: IRCard, now: Date): boolean {
  return getDayStart(card.due).getTime() < getDayStart(now).getTime()
}

export function isHighPriority(card: IRCard, threshold: number): boolean {
  return card.priority >= threshold
}

export function isNewExtract(card: IRCard): boolean {
  return card.cardType === "extracts" && (card.isNew || card.readCount === 0)
}

export type SelectQueueResult = {
  queue: IRCard[]
  protectedIds: Set<number>
  totalCostSeconds: number
  budgetSeconds: number
}

/**
 * 按保护规则选择时间预算内的队列
 */
export function selectQueueWithPolicy(
  cards: IRCard[],
  config: IRQueuePolicyConfig,
  now: Date = new Date()
): SelectQueueResult {
  const budget = budgetSeconds(config.timeBudgetMinutes)
  const hardLimit = config.dailyLimit > 0 ? config.dailyLimit : Number.POSITIVE_INFINITY

  const topics = cards.filter(c => c.cardType === "topic")
  const extracts = cards.filter(c => c.cardType === "extracts")

  const sortByValue = (list: IRCard[]) =>
    [...list].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      const overdueDelta =
        (isOverdue(b, now) ? 1 : 0) - (isOverdue(a, now) ? 1 : 0)
      if (overdueDelta !== 0) return overdueDelta
      // 稳定微扰
      return stableUnitRandom(config.seed, a.id) - stableUnitRandom(config.seed, b.id)
    })

  const sortedTopics = sortByValue(topics)
  const sortedExtracts = sortByValue(extracts)

  const selected: IRCard[] = []
  const selectedIds = new Set<number>()
  let cost = 0

  const tryAdd = (card: IRCard): boolean => {
    if (selectedIds.has(card.id)) return false
    if (selected.length >= hardLimit) return false
    // 有停留样本时用校准成本，否则回退静态估算
    const cardCost = estimateCardCostSecondsCalibrated(card)
    if (selected.length > 0 && cost + cardCost > budget) return false
    selected.push(card)
    selectedIds.add(card.id)
    cost += cardCost
    return true
  }

  // 1) 高优先级逾期保护
  for (const card of [...sortedTopics, ...sortedExtracts]) {
    if (isHighPriority(card, config.highPriorityThreshold) && isOverdue(card, now)) {
      tryAdd(card)
    }
  }

  // 2) Topic 最低曝光
  const topicFloor = Math.max(
    config.topicMinCount,
    Math.ceil(Math.min(hardLimit === Number.POSITIVE_INFINITY ? selected.length + sortedTopics.length : hardLimit, 20) * config.topicMinRatio)
  )
  let topicCount = selected.filter(c => c.cardType === "topic").length
  for (const topic of sortedTopics) {
    if (topicCount >= topicFloor) break
    if (tryAdd(topic)) topicCount += 1
  }

  // 3) 新 Extract 趁热加工配额
  const newExtracts = sortedExtracts.filter(isNewExtract)
  const newExtractCap = Math.max(0, Math.floor(
    (hardLimit === Number.POSITIVE_INFINITY ? 20 : hardLimit) * config.newExtractMaxRatio
  ))
  let newExtractAdded = selected.filter(isNewExtract).length
  for (const card of newExtracts) {
    if (newExtractAdded >= newExtractCap) break
    if (tryAdd(card)) newExtractAdded += 1
  }

  // 4) 按价值填充剩余预算
  for (const card of [...sortedTopics, ...sortedExtracts]) {
    tryAdd(card)
  }

  // 5) 稳定随机探索：替换队尾少量非高优先级
  const exploreSlots = Math.floor(selected.length * config.explorationRatio)
  if (exploreSlots > 0) {
    const pool = cards.filter(c => !selectedIds.has(c.id) && !isHighPriority(c, config.highPriorityThreshold))
    const explorers = sortByValue(pool).slice(0, exploreSlots)
    for (let i = 0; i < explorers.length; i++) {
      const replaceIndex = selected.length - 1 - i
      if (replaceIndex < 0) break
      const victim = selected[replaceIndex]
      if (isHighPriority(victim, config.highPriorityThreshold)) continue
      selectedIds.delete(victim.id)
      selected[replaceIndex] = explorers[i]
      selectedIds.add(explorers[i].id)
    }
  }

  return {
    queue: selected,
    protectedIds: new Set(selected.map(c => c.id)),
    totalCostSeconds: selected.reduce((sum, c) => sum + estimateCardCostSecondsCalibrated(c), 0),
    budgetSeconds: budget
  }
}

/**
 * 调整优先级时的间隔比例修正（保留已有间隔增长成果）
 * factor 限制在 0.6..1.6
 */
export function adjustIntervalForPriorityChange(
  currentInterval: number,
  oldPriority: number,
  newPriority: number
): number {
  const oldP = Math.min(100, Math.max(0, oldPriority))
  const newP = Math.min(100, Math.max(0, newPriority))
  // 优先级升高 → 间隔略缩短；降低 → 略拉长
  const rawFactor = 1 + (oldP - newP) / 200
  const factor = Math.min(1.6, Math.max(0.6, rawFactor))
  const next = Math.max(1, currentInterval * factor)
  return Math.round(next * 100) / 100
}

export function priorityToTier(priority: number): "low" | "medium" | "high" {
  if (priority >= 70) return "high"
  if (priority >= 30) return "medium"
  return "low"
}

export function tierToPriority(tier: "low" | "medium" | "high"): number {
  if (tier === "high") return 80
  if (tier === "medium") return 50
  return 20
}
