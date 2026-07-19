/**
 * 最终约束：Topic floor、新 Extract cap（替换/回填）、有界探索
 * 依赖 core only；不得 import 公共入口 irQueuePolicy（避免环）。
 */

import type { IRCard } from "../incrementalReadingCollector"
import { estimateCardCostSecondsCalibrated } from "./irCostCalibration"
import {
  type QueuePolicyDiagnostic,
  MIN_EXPLORATION_QUEUE_LENGTH,
  computeNewExtractCap,
  computeTopicFloor,
  isHighPriority,
  isNewExtract,
  isOverdue,
  stableUnitRandom
} from "./irQueuePolicyCore"

export type QueueSelectionMutators = {
  selected: IRCard[]
  selectedIds: Set<number>
  hardProtectedIds: Set<number>
  cost: number
  tryAdd: (card: IRCard, opts?: { protect?: boolean }) => boolean
  removeCardAt: (index: number) => IRCard | null
  replaceAt: (index: number, next: IRCard) => boolean
  recomputeCost: () => void
}

function cardCost(card: IRCard): number {
  return estimateCardCostSecondsCalibrated(card)
}

function totalQueueCost(queue: IRCard[]): number {
  return queue.reduce((sum, c) => sum + cardCost(c), 0)
}

function trialCostAllowed(trial: IRCard[], budget: number): boolean {
  if (trial.length <= 1) return true
  return totalQueueCost(trial) <= budget
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

function sortVictimsLowValueFirst(
  list: IRCard[],
  seed: string,
  now: Date
): IRCard[] {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const overdueDelta =
      (isOverdue(a, now) ? 1 : 0) - (isOverdue(b, now) ? 1 : 0)
    if (overdueDelta !== 0) return overdueDelta
    return stableUnitRandom(seed, b.id) - stableUnitRandom(seed, a.id)
  })
}

function topicCountOf(queue: IRCard[]): number {
  return queue.filter(c => c.cardType === "topic").length
}

function trialMeetsTopicFloor(
  trial: IRCard[],
  topicMinRatio: number,
  topicMinCount: number,
  availableTopics: number
): boolean {
  const floor = computeTopicFloor(
    trial.length,
    topicMinRatio,
    topicMinCount,
    availableTopics
  )
  return topicCountOf(trial) >= floor
}

export function enforceTopicFloor(args: {
  m: QueueSelectionMutators
  sortedTopics: IRCard[]
  topicMinRatio: number
  topicMinCount: number
  hardLimit: number
  budget: number
  seed: string
  now: Date
}): void {
  const {
    m,
    sortedTopics,
    topicMinRatio,
    topicMinCount,
    hardLimit,
    budget,
    seed,
    now
  } = args
  const floor = computeTopicFloor(
    m.selected.length,
    topicMinRatio,
    topicMinCount,
    sortedTopics.length
  )
  let currentTopics = topicCountOf(m.selected)
  if (currentTopics >= floor) return

  const missingTopics = sortedTopics.filter(t => !m.selectedIds.has(t.id))
  for (const topic of missingTopics) {
    if (currentTopics >= floor) break

    if (m.selected.length < hardLimit) {
      const nextCost = cardCost(topic)
      if (m.selected.length === 0 || m.cost + nextCost <= budget) {
        if (m.tryAdd(topic)) {
          currentTopics += 1
          continue
        }
      }
    }

    const victims = sortVictimsLowValueFirst(
      m.selected.filter(
        c => c.cardType !== "topic" && !m.hardProtectedIds.has(c.id)
      ),
      seed,
      now
    )
    let swapped = false
    for (const victim of victims) {
      const idx = m.selected.findIndex(c => c.id === victim.id)
      if (idx < 0) continue
      const trial = m.selected.map(c => (c.id === victim.id ? topic : c))
      if (!trialCostAllowed(trial, budget)) continue
      m.replaceAt(idx, topic)
      currentTopics += 1
      swapped = true
      break
    }
    if (!swapped) break
  }
}

function backfillNonNew(args: {
  m: QueueSelectionMutators
  cards: IRCard[]
  hardLimit: number
  seed: string
  now: Date
}): number {
  const { m, cards, hardLimit, seed, now } = args
  let added = 0
  const candidates = sortByValue(
    cards.filter(c => !m.selectedIds.has(c.id) && !isNewExtract(c)),
    seed,
    now
  )
  for (const candidate of candidates) {
    if (m.selected.length >= hardLimit) break
    if (m.tryAdd(candidate)) added += 1
  }
  return added
}

/**
 * 压低新 Extract 至 cap。
 * 优先事务式替换为未选非新卡；否则删除后回填。
 * 不删除 hardProtected；循环有明确上限；永不因 cap 清空队列。
 */
export function enforceNewExtractCap(args: {
  m: QueueSelectionMutators
  cards: IRCard[]
  newExtractMaxRatio: number
  topicMinRatio: number
  topicMinCount: number
  availableTopics: number
  hardLimit: number
  budget: number
  seed: string
  now: Date
}): void {
  const {
    m,
    cards,
    newExtractMaxRatio,
    topicMinRatio,
    topicMinCount,
    availableTopics,
    hardLimit,
    budget,
    seed,
    now
  } = args

  if (m.selected.length === 0) return
  if (!cards.some(c => !isNewExtract(c))) return

  const hasUnselectedNonNew = () =>
    cards.some(c => !m.selectedIds.has(c.id) && !isNewExtract(c))

  const maxIterations = Math.max(8, cards.length * 2)
  for (let iter = 0; iter < maxIterations; iter++) {
    let cap = computeNewExtractCap(m.selected.length, newExtractMaxRatio)
    let newCount = m.selected.filter(isNewExtract).length
    if (newCount <= cap) {
      if (m.selected.length < hardLimit && hasUnselectedNonNew()) {
        backfillNonNew({ m, cards, hardLimit, seed, now })
      }
      return
    }

    const removable = sortVictimsLowValueFirst(
      m.selected.filter(c => isNewExtract(c) && !m.hardProtectedIds.has(c.id)),
      seed,
      now
    )
    const nonNewCandidates = sortByValue(
      cards.filter(c => !m.selectedIds.has(c.id) && !isNewExtract(c)),
      seed,
      now
    )

    let progress = false

    for (const victim of removable) {
      if (newCount <= cap) break
      const idx = m.selected.findIndex(c => c.id === victim.id)
      if (idx < 0) continue
      for (const candidate of nonNewCandidates) {
        if (m.selectedIds.has(candidate.id)) continue
        const trial = m.selected.map(c => (c.id === victim.id ? candidate : c))
        if (!trialCostAllowed(trial, budget)) continue
        if (
          !trialMeetsTopicFloor(
            trial,
            topicMinRatio,
            topicMinCount,
            availableTopics
          )
        ) {
          continue
        }
        m.replaceAt(idx, candidate)
        progress = true
        newCount = m.selected.filter(isNewExtract).length
        cap = computeNewExtractCap(m.selected.length, newExtractMaxRatio)
        break
      }
      if (progress) break
    }

    if (progress) continue

    if (removable.length > 0 && m.selected.length > 1) {
      const victim = removable[0]
      const idx = m.selected.findIndex(c => c.id === victim.id)
      if (idx >= 0) {
        m.removeCardAt(idx)
        backfillNonNew({ m, cards, hardLimit, seed, now })
        progress = true
      }
    }

    if (!progress) return
  }
}

export function applyExploration(args: {
  m: QueueSelectionMutators
  cards: IRCard[]
  explorationRatio: number
  topicMinRatio: number
  topicMinCount: number
  availableTopics: number
  newExtractMaxRatio: number
  highPriorityThreshold: number
  budget: number
  seed: string
  now: Date
  diagnostics: QueuePolicyDiagnostic[]
}): void {
  const {
    m,
    cards,
    explorationRatio,
    topicMinRatio,
    topicMinCount,
    availableTopics,
    newExtractMaxRatio,
    highPriorityThreshold,
    budget,
    seed,
    now,
    diagnostics
  } = args

  const nBeforeExplore = m.selected.length
  let exploreSlots = 0
  if (explorationRatio <= 0) {
    diagnostics.push({
      code: "exploration_skipped",
      reason: "ratio_zero",
      detail: { queueLength: nBeforeExplore }
    })
    return
  }
  if (nBeforeExplore < MIN_EXPLORATION_QUEUE_LENGTH) {
    diagnostics.push({
      code: "exploration_skipped",
      reason: "queue_too_small",
      detail: {
        queueLength: nBeforeExplore,
        minLength: MIN_EXPLORATION_QUEUE_LENGTH
      }
    })
    return
  }

  exploreSlots = Math.max(1, Math.floor(nBeforeExplore * explorationRatio))
  const topicFloorNow = computeTopicFloor(
    m.selected.length,
    topicMinRatio,
    topicMinCount,
    availableTopics
  )
  const newCapNow = computeNewExtractCap(m.selected.length, newExtractMaxRatio)

  const isTopicFloorEssential = (card: IRCard): boolean => {
    if (card.cardType !== "topic") return false
    return topicCountOf(m.selected) <= topicFloorNow
  }

  const pool = sortByValue(
    cards.filter(
      c =>
        !m.selectedIds.has(c.id) &&
        !isHighPriority(c, highPriorityThreshold)
    ),
    seed,
    now
  )

  if (pool.length === 0) {
    diagnostics.push({
      code: "exploration_no_legal_swap",
      reason: "no_unselected_candidates",
      detail: { desiredSlots: exploreSlots, appliedSwaps: 0 }
    })
    return
  }

  let appliedSwaps = 0
  let attemptedSlots = 0

  for (let slot = 0; slot < exploreSlots; slot++) {
    attemptedSlots += 1
    let slotApplied = false

    for (let offset = 0; offset < m.selected.length && !slotApplied; offset++) {
      const replaceIndex = m.selected.length - 1 - offset
      const victim = m.selected[replaceIndex]
      if (m.hardProtectedIds.has(victim.id)) continue
      if (isHighPriority(victim, highPriorityThreshold)) continue
      if (isTopicFloorEssential(victim)) continue

      for (const explorer of pool) {
        if (m.selectedIds.has(explorer.id)) continue

        const victimIsNew = isNewExtract(victim)
        const explorerIsNew = isNewExtract(explorer)
        const currentNew = m.selected.filter(isNewExtract).length
        const projectedNew =
          currentNew - (victimIsNew ? 1 : 0) + (explorerIsNew ? 1 : 0)
        if (projectedNew > newCapNow) continue

        if (victim.cardType === "topic" && explorer.cardType !== "topic") {
          if (topicCountOf(m.selected) - 1 < topicFloorNow) continue
        }

        const trial = m.selected.map((c, i) =>
          i === replaceIndex ? explorer : c
        )
        if (!trialCostAllowed(trial, budget)) continue

        m.replaceAt(replaceIndex, explorer)
        appliedSwaps += 1
        slotApplied = true
        break
      }
    }
  }

  if (appliedSwaps === 0) {
    diagnostics.push({
      code: "exploration_no_legal_swap",
      reason: "no_legal_candidate_under_constraints",
      detail: {
        desiredSlots: exploreSlots,
        attemptedSlots,
        appliedSwaps: 0,
        poolSize: pool.length
      }
    })
  }
}
