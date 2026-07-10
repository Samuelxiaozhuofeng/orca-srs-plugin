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

export function markSessionItemCompleted(progress: IRSessionProgress): IRSessionProgress {
  const completed = Math.min(progress.planned, progress.completed + 1)
  const remaining = Math.max(0, progress.remaining - 1)
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
