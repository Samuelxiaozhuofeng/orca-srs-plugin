/**
 * 资料库溢出推后（Batch B2）：只移动 due，保留 intentional interval 与 position。
 *
 * 从 collector 拆出，避免 collector 继续膨胀。生产批量有界并发；
 * 返回真实 success/failed，禁止用计划数量伪装成功。
 */

import type { DbId } from "../../orca.d.ts"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"
import type { IRCard, IRCardType } from "../incrementalReadingCollector"
import { getPostponeDays } from "../incrementalReadingScheduler"
import { loadIRState, saveIRState } from "../incrementalReadingStorage"
import {
  BLOCK_PREFETCH_CONCURRENCY,
  runBoundedConcurrency
} from "../storage"

export type DeferOverflowFailure = { id: DbId; error: string }

export type DeferOverflowWriteResult = {
  successIds: DbId[]
  failed: DeferOverflowFailure[]
}

export type DeferIROverflowResult = {
  /** 真实写入成功数量（不得用计划数冒充） */
  deferredCount: number
  successIds: DbId[]
  failed: DeferOverflowFailure[]
  /** 计划推后数量（筛选结果）；仅诊断用 */
  plannedCount: number
}

function resolveOverflowDelayDays(cardType: IRCardType, priority: number): number {
  const postponeDays = getPostponeDays(cardType, priority)
  const max = cardType === "extracts" ? 30 : 60
  return Math.min(max, Math.max(0.1, postponeDays))
}

/**
 * 对指定卡片做 due-only 推后写入。
 * - 保留 prev.intervalDays / prev.position
 * - 更新 due、postponeCount、lastAction、清空 autoPostponeBatchId
 */
export async function deferOverflowCardsDueOnly(
  cards: IRCard[],
  now: Date
): Promise<DeferOverflowWriteResult> {
  if (cards.length === 0) {
    return { successIds: [], failed: [] }
  }

  const successIds: DbId[] = []
  const failed: DeferOverflowFailure[] = []

  await runBoundedConcurrency(
    cards,
    BLOCK_PREFETCH_CONCURRENCY,
    async (card) => {
      try {
        const prev = await loadIRState(card.id)
        const delayDays = resolveOverflowDelayDays(card.cardType, card.priority)
        const nextDue = computeDueFromIntervalDays(now, delayDays)
        await saveIRState(card.id, {
          ...prev,
          due: nextDue,
          intervalDays: prev.intervalDays,
          postponeCount: prev.postponeCount + 1,
          lastAction: "autoPostpone",
          // B2 合同：postpone 不重排 position
          position: prev.position,
          autoPostponeBatchId: null
        })
        successIds.push(card.id)
      } catch (error) {
        failed.push({
          id: card.id,
          error: error instanceof Error ? error.message : String(error ?? "未知错误")
        })
      }
    }
  )

  if (failed.length > 0) {
    console.warn("[IR] 溢出推后部分/全部失败", {
      success: successIds.length,
      failed: failed.length,
      failedIds: failed.map(f => f.id)
    })
  }

  return { successIds, failed }
}

/**
 * 将“溢出（未入选今天队列）”的卡片推后。
 * - 仅按 selected IDs 过滤；不复制队列排序/position 逻辑
 * - 只移动 due，保留 intentional intervalDays 与 position
 */
export async function deferIROverflow(
  dueCards: IRCard[],
  queue: IRCard[],
  options: { now?: Date } = {}
): Promise<DeferIROverflowResult> {
  const selectedIds = new Set(queue.map(card => card.id))
  const deferred = dueCards.filter(card => !selectedIds.has(card.id))
  const plannedCount = deferred.length
  if (plannedCount === 0) {
    return { deferredCount: 0, successIds: [], failed: [], plannedCount: 0 }
  }

  const now = options.now ?? new Date()
  const writeResult = await deferOverflowCardsDueOnly(deferred, now)

  return {
    deferredCount: writeResult.successIds.length,
    successIds: writeResult.successIds,
    failed: writeResult.failed,
    plannedCount
  }
}
