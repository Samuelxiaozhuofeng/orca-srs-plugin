/**
 * 复习会话统一关闭路径（FC-03）
 *
 * 正常完成、主动关闭、Modal overlay 关闭均应走此 helper：
 * flush -> 失败时可见通知 -> 仍允许 close。
 * 幂等：重复调用在 isClosing 守卫下不会并发 flush。
 */

import { flushReviewLogs } from "./reviewLogStorage"

export const REVIEW_LOG_FLUSH_PENDING_MESSAGE =
  "复习已保存，但统计日志仍待重试"

export type CloseReviewSessionOptions = {
  pluginName: string
  /** 实际关闭 UI（关闭面板等） */
  close: () => void | Promise<void>
  /** 可注入以便测试 */
  flush?: (pluginName: string) => Promise<void>
  /** flush 失败时通知用户；默认 no-op（由调用方注入 orca.notify） */
  notifyFlushFailure?: (message: string, error: unknown) => void
  /** 可选：在 flush 前执行的清理（如重复复习会话） */
  beforeFlush?: () => void | Promise<void>
}

export type CloseReviewSessionResult = {
  closed: true
  flushOk: boolean
  flushError?: unknown
}

/**
 * 统一 async 关闭：先 flush 复习日志，失败仍关闭并报告。
 */
export async function closeReviewSessionWithFlush(
  options: CloseReviewSessionOptions
): Promise<CloseReviewSessionResult> {
  const {
    pluginName,
    close,
    flush = flushReviewLogs,
    notifyFlushFailure,
    beforeFlush
  } = options

  if (beforeFlush) {
    await beforeFlush()
  }

  let flushOk = true
  let flushError: unknown

  try {
    await flush(pluginName)
  } catch (error) {
    flushOk = false
    flushError = error
    console.error(
      `[${pluginName}] 会话关闭时 flush 复习日志失败（pending 已保留）:`,
      error
    )
    notifyFlushFailure?.(REVIEW_LOG_FLUSH_PENDING_MESSAGE, error)
  }

  await close()

  return { closed: true, flushOk, flushError }
}

/**
 * 创建带并发守卫的关闭函数，避免重复点击触发多次 close/flush。
 */
export function createGuardedSessionCloser(
  options: Omit<CloseReviewSessionOptions, "close"> & {
    close: () => void | Promise<void>
  }
): () => Promise<CloseReviewSessionResult> {
  let closing: Promise<CloseReviewSessionResult> | null = null

  return () => {
    if (closing) {
      return closing
    }
    closing = closeReviewSessionWithFlush(options).finally(() => {
      // 关闭完成后允许理论上的再次打开同一组件实例再关（通常组件已卸载）
      closing = null
    })
    return closing
  }
}
