/**
 * 会话进度语义：已完成 / 本次计划
 *
 * 不再使用「当前索引+1 / 剩余队列长度」，避免处理过程中分母不断缩小导致进度长期像 1/N。
 */

import type { IRSessionProgress } from "./irTypes"

export function createSessionProgress(planned: number): IRSessionProgress {
  const safePlanned = Math.max(0, Math.floor(planned))
  return {
    planned: safePlanned,
    completed: 0,
    remaining: safePlanned
  }
}

/**
 * 会话内短期重学回流：该条目会被再处理一次，计划数随之 +1。
 * 不加这一条，回流后 completed 会被封顶在旧 planned，进度显示与额度对账都失真。
 */
export function addSessionPlannedItem(progress: IRSessionProgress): IRSessionProgress {
  return {
    ...progress,
    planned: progress.planned + 1
  }
}

export function markSessionItemCompleted(progress: IRSessionProgress): IRSessionProgress {
  const completed = Math.min(progress.planned, progress.completed + 1)
  const remaining = Math.max(0, progress.remaining - 1)
  return {
    planned: progress.planned,
    completed,
    remaining
  }
}

/** 撤销「下一篇」：把一次已计入的完成回退（不低于 0） */
export function unmarkSessionItemCompleted(progress: IRSessionProgress): IRSessionProgress {
  const completed = Math.max(0, progress.completed - 1)
  const remaining = Math.min(progress.planned, progress.remaining + 1)
  return {
    planned: progress.planned,
    completed,
    remaining
  }
}

export function syncSessionRemaining(
  progress: IRSessionProgress,
  remaining: number
): IRSessionProgress {
  return {
    ...progress,
    remaining: Math.max(0, Math.floor(remaining))
  }
}

/** 展示文案：已完成 / 本次计划 */
export function formatSessionProgress(progress: IRSessionProgress): string {
  return `${progress.completed} / ${progress.planned}`
}

export function isSessionQueueEmpty(progress: IRSessionProgress): boolean {
  return progress.remaining <= 0
}
