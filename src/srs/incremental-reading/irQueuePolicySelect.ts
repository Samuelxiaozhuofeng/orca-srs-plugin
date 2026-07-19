/**
 * 队列选择实现：填充阶段 + 调用最终约束 / 探索
 * 依赖 core + constraints；不得 import 公共入口 irQueuePolicy（避免环）。
 * 调用方请从 irQueuePolicy 导入 selectQueueWithPolicy。
 */

import type { IRCard } from "../incrementalReadingCollector"
import { estimateCardCostSecondsCalibrated } from "./irCostCalibration"
import {
  type IRQueuePolicyConfig,
  type QueuePolicyDiagnostic,
  type QueuePolicyDiagnosticCode,
  type SelectQueueResult,
  DEFAULT_QUEUE_POLICY,
  budgetSeconds,
  clampUnitRatio,
  computeNewExtractCap,
  computeTopicFloor,
  isHighPriority,
  isNewExtract,
  isOverdue,
  stableUnitRandom
} from "./irQueuePolicyCore"
import {
  type QueueSelectionMutators,
  applyExploration,
  enforceNewExtractCap,
  enforceTopicFloor
} from "./irQueuePolicyConstraints"

function cardCost(card: IRCard): number {
  return estimateCardCostSecondsCalibrated(card)
}

function totalQueueCost(queue: IRCard[]): number {
  return queue.reduce((sum, c) => sum + cardCost(c), 0)
}

function sortByValue(list: IRCard[], seed: string, now: Date): IRCard[] {
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const overdueDelta =
      (isOverdue(b, now) ? 1 : 0) - (isOverdue(a, now) ? 1 : 0)
    if (overdueDelta !== 0) return overdueDelta
    return stableUnitRandom(seed, a.id) - stableUnitRandom(seed, b.id)
  })
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
  const topicMinRatio = clampUnitRatio(config.topicMinRatio, DEFAULT_QUEUE_POLICY.topicMinRatio)
  const newExtractMaxRatio = clampUnitRatio(
    config.newExtractMaxRatio,
    DEFAULT_QUEUE_POLICY.newExtractMaxRatio
  )
  const explorationRatio = clampUnitRatio(
    config.explorationRatio,
    DEFAULT_QUEUE_POLICY.explorationRatio
  )
  const topicMinCount = Number.isFinite(config.topicMinCount)
    ? Math.max(0, Math.floor(config.topicMinCount))
    : DEFAULT_QUEUE_POLICY.topicMinCount
  const highPriorityThreshold = Number.isFinite(config.highPriorityThreshold)
    ? config.highPriorityThreshold
    : DEFAULT_QUEUE_POLICY.highPriorityThreshold

  const diagnostics: QueuePolicyDiagnostic[] = []

  const topics = cards.filter(c => c.cardType === "topic")
  const extracts = cards.filter(c => c.cardType === "extracts")
  const sortedTopics = sortByValue(topics, config.seed, now)
  const sortedExtracts = sortByValue(extracts, config.seed, now)

  const selected: IRCard[] = []
  const selectedIds = new Set<number>()
  const hardProtectedIds = new Set<number>()
  let cost = 0

  const recomputeCost = () => {
    cost = totalQueueCost(selected)
  }

  const tryAdd = (card: IRCard, opts?: { protect?: boolean }): boolean => {
    if (selectedIds.has(card.id)) return false
    if (selected.length >= hardLimit) return false
    const nextCost = cardCost(card)
    if (selected.length > 0 && cost + nextCost > budget) return false
    selected.push(card)
    selectedIds.add(card.id)
    cost += nextCost
    if (opts?.protect) hardProtectedIds.add(card.id)
    return true
  }

  const removeCardAt = (index: number): IRCard | null => {
    if (index < 0 || index >= selected.length) return null
    const [removed] = selected.splice(index, 1)
    selectedIds.delete(removed.id)
    recomputeCost()
    return removed
  }

  const replaceAt = (index: number, next: IRCard): boolean => {
    if (index < 0 || index >= selected.length) return false
    if (selectedIds.has(next.id) && selected[index].id !== next.id) return false
    const prev = selected[index]
    selected[index] = next
    selectedIds.delete(prev.id)
    selectedIds.add(next.id)
    recomputeCost()
    return true
  }

  const m: QueueSelectionMutators = {
    get selected() {
      return selected
    },
    get selectedIds() {
      return selectedIds
    },
    get hardProtectedIds() {
      return hardProtectedIds
    },
    get cost() {
      return cost
    },
    tryAdd,
    removeCardAt,
    replaceAt,
    recomputeCost
  }

  // 1) 高优先级逾期保护
  for (const card of [...sortedTopics, ...sortedExtracts]) {
    if (isHighPriority(card, highPriorityThreshold) && isOverdue(card, now)) {
      tryAdd(card, { protect: true })
    }
  }

  const packingTarget =
    hardLimit === Number.POSITIVE_INFINITY
      ? Math.min(
          cards.length,
          Math.max(20, selected.length + sortedTopics.length + sortedExtracts.length)
        )
      : hardLimit
  const tentativeTopicFloor = computeTopicFloor(
    packingTarget,
    topicMinRatio,
    topicMinCount,
    sortedTopics.length
  )

  const hasUnselectedNonNew = (): boolean =>
    cards.some(c => !selectedIds.has(c.id) && !isNewExtract(c))

  const canAddNewExtract = (): boolean => {
    if (selected.length === 0) return true
    if (!hasUnselectedNonNew() && !selected.some(c => !isNewExtract(c))) {
      return true
    }
    const projectedN = selected.length + 1
    const cap = computeNewExtractCap(projectedN, newExtractMaxRatio)
    const currentNew = selected.filter(isNewExtract).length
    return currentNew < cap
  }

  // 2) Topic 最低曝光（预填）
  let topicCount = selected.filter(c => c.cardType === "topic").length
  for (const topic of sortedTopics) {
    if (topicCount >= tentativeTopicFloor) break
    if (tryAdd(topic)) topicCount += 1
  }

  // 3) 新 Extract 趁热加工
  for (const card of sortedExtracts.filter(isNewExtract)) {
    if (!canAddNewExtract()) break
    tryAdd(card)
  }

  // 4) 按价值填充（新 Extract 不可绕过 cap）
  const fillOrder = sortByValue([...sortedTopics, ...sortedExtracts], config.seed, now)
  for (const card of fillOrder) {
    if (isNewExtract(card) && !canAddNewExtract()) continue
    tryAdd(card)
  }

  const runConstraints = () => {
    enforceTopicFloor({
      m,
      sortedTopics,
      topicMinRatio,
      topicMinCount,
      hardLimit,
      budget,
      seed: config.seed,
      now
    })
    enforceNewExtractCap({
      m,
      cards,
      newExtractMaxRatio,
      topicMinRatio,
      topicMinCount,
      availableTopics: sortedTopics.length,
      hardLimit,
      budget,
      seed: config.seed,
      now
    })
  }

  runConstraints()
  runConstraints()

  applyExploration({
    m,
    cards,
    explorationRatio,
    topicMinRatio,
    topicMinCount,
    availableTopics: sortedTopics.length,
    newExtractMaxRatio,
    highPriorityThreshold,
    budget,
    seed: config.seed,
    now,
    diagnostics
  })

  runConstraints()
  runConstraints()

  // 最终诊断（基于最终队列）
  recomputeCost()
  const finalN = selected.length
  const finalTopicCount = selected.filter(c => c.cardType === "topic").length
  const desiredTopicFloor =
    finalN <= 0
      ? 0
      : Math.max(topicMinCount, Math.ceil(finalN * topicMinRatio))
  const achievableTopicFloor = computeTopicFloor(
    finalN,
    topicMinRatio,
    topicMinCount,
    sortedTopics.length
  )
  const finalNewCount = selected.filter(isNewExtract).length
  const finalNewCap = computeNewExtractCap(finalN, newExtractMaxRatio)

  if (finalTopicCount < desiredTopicFloor) {
    let reason = "insufficient_topics"
    if (sortedTopics.length >= desiredTopicFloor) {
      reason =
        hardProtectedIds.size > 0
          ? "time_budget_or_limit_with_protected"
          : "time_budget_or_daily_limit"
    }
    diagnostics.push({
      code: "topic_floor_unsatisfied",
      reason,
      detail: {
        topicCount: finalTopicCount,
        topicFloor: desiredTopicFloor,
        achievableFloor: achievableTopicFloor,
        queueLength: finalN,
        availableTopics: sortedTopics.length
      }
    })
  }

  if (finalNewCount > finalNewCap) {
    const hasProtectedNew = selected.some(
      c => isNewExtract(c) && hardProtectedIds.has(c.id)
    )
    let code: QueuePolicyDiagnosticCode = "new_extract_cap_softened"
    let reason = "protected_or_no_removable"
    if (finalN === 1 && finalNewCount === 1 && finalNewCap === 0) {
      code = "new_extract_cap_unsatisfiable"
      reason = "sole_candidate"
    } else if (selected.every(isNewExtract) && finalNewCap < finalNewCount) {
      code = "new_extract_cap_unsatisfiable"
      reason = "no_non_new_replacement"
    } else if (hasProtectedNew) {
      code = "new_extract_cap_softened"
      reason = "protected_items"
    } else if (!hasUnselectedNonNew()) {
      code = "new_extract_cap_unsatisfiable"
      reason = "no_non_new_replacement"
    }
    diagnostics.push({
      code,
      reason,
      detail: {
        newExtractCount: finalNewCount,
        newExtractCap: finalNewCap,
        queueLength: finalN,
        maxRatio: newExtractMaxRatio
      }
    })
  }

  if (selected.length >= 1 && cost > budget) {
    diagnostics.push({
      code: "first_card_exceeds_budget",
      reason:
        selected.length === 1
          ? "first_card_over_budget"
          : "queue_exceeds_budget_unexpected",
      detail: {
        totalCostSeconds: cost,
        budgetSeconds: budget,
        queueLength: selected.length
      }
    })
  }

  return {
    queue: selected,
    protectedIds: new Set(selected.map(c => c.id)),
    totalCostSeconds: cost,
    budgetSeconds: budget,
    diagnostics
  }
}
