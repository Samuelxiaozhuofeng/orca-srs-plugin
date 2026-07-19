/**
 * 自动过载治理：仅推后旧积压（非当天首次到期），支持批次撤销
 *
 * 写入策略：先全部读取快照 → 逐张写入 → 任一张失败则回滚已写入 → 成功后才登记批次。
 * autoPostponeBatchId 必须经 saveIRState 持久化，撤销时从磁盘重读校验。
 *
 * Batch B2：postpone 只移动 due，保留 intentional intervalDays；失败/回滚事实可见。
 */

import type { DbId } from "../../orca.d.ts"
import type { IRCard } from "../incrementalReadingCollector"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"
import { getPostponeDays } from "../incrementalReadingScheduler"
import { loadIRState, saveIRState, type IRState } from "../incrementalReadingStorage"
import { isHighPriority, isOverdue } from "./irQueuePolicy"
import type { IRAutoPostponeBatch, IRAutoPostponeSnapshot } from "./irTypes"

export type AutoPostponeOptions = {
  now?: Date
  highPriorityThreshold?: number
  protectedIds: Set<number>
  createBatchId?: () => string
}

export type AutoPostponeResult = {
  batch: IRAutoPostponeBatch | null
  deferredCount: number
  /** 本批成功 committed 的 blockId（与 deferredCount 一致） */
  committedIds: DbId[]
}

export type AutoPostponeFailureDetails = {
  committedBeforeFailure: number
  rolledBackCount: number
  rollbackFailed: Array<{ blockId: DbId; error: string }>
  cause: unknown
}

export class AutoPostponeError extends Error {
  readonly details: AutoPostponeFailureDetails

  constructor(message: string, details: AutoPostponeFailureDetails) {
    super(message)
    this.name = "AutoPostponeError"
    this.details = details
  }
}

const batchStore = new Map<string, IRAutoPostponeBatch>()

export function createAutoPostponeBatchId(now: Date = new Date()): string {
  return `ir-auto-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 仅旧积压：due 日 < 今天 */
export function isLegacyBacklog(card: IRCard, now: Date): boolean {
  return isOverdue(card, now)
}

export function selectAutoPostponeCandidates(
  dueCards: IRCard[],
  options: AutoPostponeOptions
): IRCard[] {
  const now = options.now ?? new Date()
  const threshold = options.highPriorityThreshold ?? 80

  return dueCards.filter(card => {
    if (options.protectedIds.has(card.id)) return false
    if (!isLegacyBacklog(card, now)) return false
    if (isHighPriority(card, threshold)) return false
    return true
  })
}

function toSnapshot(blockId: DbId, prev: IRState): IRAutoPostponeSnapshot {
  return {
    blockId,
    due: prev.due,
    intervalDays: prev.intervalDays,
    postponeCount: prev.postponeCount,
    lastAction: prev.lastAction,
    autoPostponeBatchId: prev.autoPostponeBatchId ?? null
  }
}

async function restoreSnapshot(snap: IRAutoPostponeSnapshot, current: IRState): Promise<void> {
  await saveIRState(snap.blockId, {
    ...current,
    due: snap.due,
    intervalDays: snap.intervalDays,
    postponeCount: snap.postponeCount,
    lastAction: snap.lastAction as IRState["lastAction"],
    autoPostponeBatchId: snap.autoPostponeBatchId
  })
}

function resolveDueOnlyDelayDays(cardType: string, priority: number): number {
  const days = getPostponeDays(cardType === "extracts" ? "extracts" : "topic", priority)
  const max = cardType === "extracts" ? 30 : 60
  return Math.min(max, Math.max(0.1, days))
}

export async function applyAutoPostpone(
  dueCards: IRCard[],
  options: AutoPostponeOptions
): Promise<AutoPostponeResult> {
  const now = options.now ?? new Date()
  const candidates = selectAutoPostponeCandidates(dueCards, options)
  if (candidates.length === 0) {
    return { batch: null, deferredCount: 0, committedIds: [] }
  }

  const batchId = (options.createBatchId ?? createAutoPostponeBatchId)()

  // 1) 全部先读快照，失败则整批中止（无部分写入）
  const prepared: Array<{ card: IRCard; prev: IRState; snap: IRAutoPostponeSnapshot }> = []
  for (const card of candidates) {
    const prev = await loadIRState(card.id)
    prepared.push({ card, prev, snap: toSnapshot(card.id, prev) })
  }

  // 2) 逐张写入；失败则回滚已成功写入的卡片
  const committed: IRAutoPostponeSnapshot[] = []
  try {
    for (const { card, prev, snap } of prepared) {
      // 只移动 due；保留 intentional intervalDays
      const delayDays = resolveDueOnlyDelayDays(card.cardType, card.priority)
      const nextDue = computeDueFromIntervalDays(now, delayDays)

      await saveIRState(card.id, {
        ...prev,
        intervalDays: prev.intervalDays,
        postponeCount: prev.postponeCount + 1,
        lastAction: "autoPostpone",
        due: nextDue,
        autoPostponeBatchId: batchId
      })
      committed.push(snap)
    }
  } catch (error) {
    console.error("[IR] 自动推后中途失败，回滚已写入:", error)
    let rolledBackCount = 0
    const rollbackFailed: Array<{ blockId: DbId; error: string }> = []
    for (const snap of committed.reverse()) {
      try {
        const current = await loadIRState(snap.blockId)
        await restoreSnapshot(snap, current)
        rolledBackCount += 1
      } catch (rollbackError) {
        const message = rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError)
        console.error("[IR] 自动推后回滚失败:", snap.blockId, rollbackError)
        rollbackFailed.push({ blockId: snap.blockId, error: message })
      }
    }

    const details: AutoPostponeFailureDetails = {
      committedBeforeFailure: committed.length,
      rolledBackCount,
      rollbackFailed,
      cause: error
    }
    console.error("[IR] 自动推后失败详情:", {
      committedBeforeFailure: details.committedBeforeFailure,
      rolledBackCount: details.rolledBackCount,
      rollbackFailed: details.rollbackFailed
    })
    throw new AutoPostponeError(
      error instanceof Error ? error.message : String(error),
      details
    )
  }

  const batch: IRAutoPostponeBatch = {
    batchId,
    createdAt: now,
    snapshots: committed
  }
  batchStore.set(batchId, batch)
  const committedIds = committed.map(s => s.blockId)
  return { batch, deferredCount: committed.length, committedIds }
}

export type UndoAutoPostponeResult = {
  restored: number
  skipped: number
  reasons: Array<{ blockId: DbId; reason: string }>
}

/**
 * 撤销本次自动推后批次。
 * 若用户之后已对同一卡片做了新操作（lastAction 不再是 autoPostpone 或 batchId 不匹配），跳过该卡。
 */
export async function undoAutoPostponeBatch(
  batchId: string
): Promise<UndoAutoPostponeResult> {
  const batch = batchStore.get(batchId)
  if (!batch) {
    return { restored: 0, skipped: 0, reasons: [{ blockId: -1 as DbId, reason: "batch_not_found" }] }
  }

  let restored = 0
  let skipped = 0
  const reasons: Array<{ blockId: DbId; reason: string }> = []

  for (const snap of batch.snapshots) {
    const current = await loadIRState(snap.blockId)
    const currentBatch = current.autoPostponeBatchId ?? null
    if (current.lastAction !== "autoPostpone" || currentBatch !== batchId) {
      skipped += 1
      reasons.push({ blockId: snap.blockId, reason: "user_modified_after_batch" })
      continue
    }

    await saveIRState(snap.blockId, {
      ...current,
      due: snap.due,
      intervalDays: snap.intervalDays,
      postponeCount: snap.postponeCount,
      lastAction: snap.lastAction as IRState["lastAction"],
      autoPostponeBatchId: snap.autoPostponeBatchId
    })
    restored += 1
  }

  if (restored > 0 || skipped === batch.snapshots.length) {
    batchStore.delete(batchId)
  }

  return { restored, skipped, reasons }
}

export function getAutoPostponeBatch(batchId: string): IRAutoPostponeBatch | undefined {
  return batchStore.get(batchId)
}

export function clearAutoPostponeBatchesForTests(): void {
  batchStore.clear()
}

export function formatAutoPostponeSummary(deferredCount: number): string {
  if (deferredCount <= 0) return ""
  return `已自动顺延 ${deferredCount} 条`
}
