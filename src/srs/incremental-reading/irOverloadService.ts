/**
 * 自动过载治理：仅推后旧积压（非当天首次到期），支持批次撤销
 *
 * 对齐 SuperMemo auto-postpone 语义：每天首次学习开始时，自动推迟往日积欠中的
 * 低优先级项，高优先级材料受影响最小，用户永远不用为积压愧疚。
 *
 * 保护规则：
 * - 高优先级（priority ≥ threshold，默认 80）永不自动推迟。
 * - 保留 top-N（默认 20）：候选按 priority 降序（平票用稳定 hash）保留前 N 张，
 *   让它们参与今日队列竞争；只推迟其余的。
 * - 反复推迟降权：本次被推迟且推迟后 postponeCount ≥ 3 的卡，ir.priority 额外 -2
 *   （下限 5）——对应 SuperMemo「推迟联动降优先级」，让反复被推的材料诚实地
 *   承认其低优先级；降权纳入批次快照，撤销必须能恢复优先级。
 *
 * 写入策略：先全部读取快照 → 逐张写入 → 任一张失败则回滚已写入 → 成功后才登记批次。
 * autoPostponeBatchId 必须经 saveIRState 持久化，撤销时从磁盘重读校验。
 * saveIRState 内部已做 invalidateIrBlockCache + #card.priority 同步（沿用现有写路径）。
 *
 * Batch B2：postpone 只移动 due，保留 intentional intervalDays；失败/回滚事实可见。
 */

import type { DbId } from "../../orca.d.ts"
import type { IRCard } from "../incrementalReadingCollector"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"
import { getPostponeDays } from "../incrementalReadingScheduler"
import { loadIRState, saveIRState, type IRState } from "../incrementalReadingStorage"
import {
  formatLocalDateKey,
  isHighPriority,
  isOverdue,
  stableUnitRandom
} from "./irQueuePolicy"
import type { IRLastAction } from "./irTypes"

/** 反复推迟降权：推迟后 postponeCount 达到该值触发额外降权 */
export const AUTO_POSTPONE_DEPRIORITIZE_AT = 3
/** 每次触发的额外降权幅度 */
export const AUTO_POSTPONE_DEPRIORITIZE_STEP = 2
/** 降权下限（诚实承认低优先级，但不至于归零） */
export const AUTO_POSTPONE_PRIORITY_FLOOR = 5
/** 默认保留（不推迟）的 top-N 张 */
export const DEFAULT_AUTO_POSTPONE_KEEP_TOP_N = 20

export type AutoPostponeOptions = {
  now?: Date
  highPriorityThreshold?: number
  protectedIds: Set<number>
  createBatchId?: () => string
  /** 保留（不推迟）优先级最高的 N 张候选，默认 20 */
  keepTopN?: number
  /** 稳定随机种子（平票 tiebreak），默认本地日 */
  seed?: string
}

/**
 * 本地快照类型：在 irTypes 的基础上补 `priority`，供反复推迟降权后撤销恢复。
 * 批次仅在本模块的进程内 batchStore 使用，故类型局部定义。
 */
export type AutoPostponeSnapshot = {
  blockId: DbId
  priority: number
  due: Date
  intervalDays: number
  postponeCount: number
  lastAction: IRLastAction
  autoPostponeBatchId: string | null
}

export type AutoPostponeBatch = {
  batchId: string
  createdAt: Date
  snapshots: AutoPostponeSnapshot[]
}

export type AutoPostponeResult = {
  batch: AutoPostponeBatch | null
  /** 实际推迟（committed）数量 */
  deferredCount: number
  /** 保留 top-N（未推迟）数量 */
  keptCount: number
  /** 本次被额外降权的卡数量 */
  deprioritizedCount: number
  /** 批次 ID（无推迟时为 null）；供接线点通知/撤销 */
  batchId: string | null
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

const batchStore = new Map<string, AutoPostponeBatch>()

export function createAutoPostponeBatchId(now: Date = new Date()): string {
  return `ir-auto-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 仅旧积压：due 日 < 今天 */
export function isLegacyBacklog(card: IRCard, now: Date): boolean {
  return isOverdue(card, now)
}

/**
 * 过滤候选（不含 keepTopN）：仅旧积压、非保护、非高优先级。
 * 保持纯过滤语义（既有测试依赖）；keepTopN 由 partitionByKeepTopN 另行处理。
 */
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

/**
 * 按 priority 降序（平票用稳定 hash）把候选拆成「保留 top-N」与「待推迟」。
 * 高优先级材料受影响最小：优先级越高越可能落入保留集。
 */
export function partitionByKeepTopN(
  candidates: IRCard[],
  keepTopN: number,
  seed: string
): { kept: IRCard[]; toPostpone: IRCard[] } {
  const n = Math.max(0, Math.floor(Number.isFinite(keepTopN) ? keepTopN : 0))
  if (candidates.length <= n) {
    return { kept: [...candidates], toPostpone: [] }
  }
  const sorted = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    // 平票：现有稳定 hash（与队列策略同源），确定性 tiebreak
    return stableUnitRandom(seed, a.id) - stableUnitRandom(seed, b.id)
  })
  return { kept: sorted.slice(0, n), toPostpone: sorted.slice(n) }
}

function toSnapshot(blockId: DbId, prev: IRState): AutoPostponeSnapshot {
  return {
    blockId,
    priority: prev.priority,
    due: prev.due,
    intervalDays: prev.intervalDays,
    postponeCount: prev.postponeCount,
    lastAction: prev.lastAction,
    autoPostponeBatchId: prev.autoPostponeBatchId ?? null
  }
}

async function restoreSnapshot(snap: AutoPostponeSnapshot, current: IRState): Promise<void> {
  await saveIRState(snap.blockId, {
    ...current,
    priority: snap.priority,
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

/**
 * 反复推迟降权：推迟后 postponeCount ≥ AUTO_POSTPONE_DEPRIORITIZE_AT 时，
 * priority 额外 -AUTO_POSTPONE_DEPRIORITIZE_STEP，下限 AUTO_POSTPONE_PRIORITY_FLOOR。
 * 否则保留原优先级。
 */
export function resolvePostponedPriority(prevPriority: number, nextPostponeCount: number): number {
  if (nextPostponeCount < AUTO_POSTPONE_DEPRIORITIZE_AT) return prevPriority
  return Math.max(AUTO_POSTPONE_PRIORITY_FLOOR, prevPriority - AUTO_POSTPONE_DEPRIORITIZE_STEP)
}

export async function applyAutoPostpone(
  dueCards: IRCard[],
  options: AutoPostponeOptions
): Promise<AutoPostponeResult> {
  const now = options.now ?? new Date()
  const seed = options.seed ?? formatLocalDateKey(now)
  const keepTopN = options.keepTopN ?? DEFAULT_AUTO_POSTPONE_KEEP_TOP_N

  const filtered = selectAutoPostponeCandidates(dueCards, options)
  const { kept, toPostpone } = partitionByKeepTopN(filtered, keepTopN, seed)
  const keptCount = kept.length

  if (toPostpone.length === 0) {
    return {
      batch: null,
      deferredCount: 0,
      keptCount,
      deprioritizedCount: 0,
      batchId: null,
      committedIds: []
    }
  }

  const batchId = (options.createBatchId ?? createAutoPostponeBatchId)()

  // 1) 全部先读快照，失败则整批中止（无部分写入）
  const prepared: Array<{ card: IRCard; prev: IRState; snap: AutoPostponeSnapshot }> = []
  for (const card of toPostpone) {
    const prev = await loadIRState(card.id)
    prepared.push({ card, prev, snap: toSnapshot(card.id, prev) })
  }

  // 2) 逐张写入；失败则回滚已成功写入的卡片
  const committed: AutoPostponeSnapshot[] = []
  let deprioritizedCount = 0
  try {
    for (const { card, prev, snap } of prepared) {
      // 只移动 due；保留 intentional intervalDays
      const delayDays = resolveDueOnlyDelayDays(card.cardType, card.priority)
      const nextDue = computeDueFromIntervalDays(now, delayDays)
      const nextPostponeCount = prev.postponeCount + 1
      const nextPriority = resolvePostponedPriority(prev.priority, nextPostponeCount)

      await saveIRState(card.id, {
        ...prev,
        priority: nextPriority,
        intervalDays: prev.intervalDays,
        postponeCount: nextPostponeCount,
        lastAction: "autoPostpone",
        due: nextDue,
        autoPostponeBatchId: batchId
      })
      if (nextPriority < prev.priority) deprioritizedCount += 1
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

  const batch: AutoPostponeBatch = {
    batchId,
    createdAt: now,
    snapshots: committed
  }
  batchStore.set(batchId, batch)
  const committedIds = committed.map(s => s.blockId)
  return {
    batch,
    deferredCount: committed.length,
    keptCount,
    deprioritizedCount,
    batchId,
    committedIds
  }
}

export type UndoAutoPostponeResult = {
  restored: number
  skipped: number
  reasons: Array<{ blockId: DbId; reason: string }>
}

/**
 * 撤销本次自动推后批次。
 * 若用户之后已对同一卡片做了新操作（lastAction 不再是 autoPostpone 或 batchId 不匹配），跳过该卡。
 * 恢复内容包含 priority（反复推迟降权可逆）。
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
      priority: snap.priority,
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

export function getAutoPostponeBatch(batchId: string): AutoPostponeBatch | undefined {
  return batchStore.get(batchId)
}

export function clearAutoPostponeBatchesForTests(): void {
  batchStore.clear()
}

export function formatAutoPostponeSummary(deferredCount: number): string {
  if (deferredCount <= 0) return ""
  return `已自动推迟 ${deferredCount} 张积压卡（高优先级已保留）`
}
