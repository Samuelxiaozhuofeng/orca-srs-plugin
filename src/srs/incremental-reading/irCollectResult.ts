/**
 * 收集结果语义：区分真正空队列与读取失败
 */

import type { IRCard } from "../incrementalReadingCollector"
import type { IRCollectResult, IRCollectStatus } from "./irTypes"

export function buildCollectOk(cards: IRCard[], failedCount = 0): IRCollectResult {
  if (cards.length === 0 && failedCount === 0) {
    return { status: "empty", cards: [], failedCount: 0 }
  }
  if (cards.length === 0 && failedCount > 0) {
    return {
      status: "error",
      cards: [],
      failedCount,
      errorMessage: `所有候选卡片均读取失败（${failedCount}）`
    }
  }
  if (failedCount > 0) {
    return {
      status: "partial",
      cards,
      failedCount,
      errorMessage: `部分卡片读取失败（${failedCount}）`
    }
  }
  return { status: "ok", cards, failedCount: 0 }
}

export function buildCollectError(error: unknown): IRCollectResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    status: "error",
    cards: [],
    failedCount: 0,
    errorMessage: message
  }
}

export function isUsableCollectResult(result: IRCollectResult): boolean {
  return result.status === "ok" || result.status === "partial" || result.status === "empty"
}

export function shouldShowEmptyQueue(result: IRCollectResult): boolean {
  return result.status === "empty"
}

export function shouldShowLoadError(result: IRCollectResult): boolean {
  return result.status === "error"
}

export function collectStatusLabel(status: IRCollectStatus): string {
  switch (status) {
    case "empty":
      return "暂无到期内容"
    case "error":
      return "数据读取失败"
    case "partial":
      return "部分卡片读取失败"
    case "ok":
    default:
      return "就绪"
  }
}
