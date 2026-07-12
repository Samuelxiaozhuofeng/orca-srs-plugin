/**
 * 会话完成结算（FC-09 修补）
 *
 * 保证「从未完成 → 完成」只调用 finish 一次。
 * 供 Demo effect / 完成按钮共用；render 不得调用 finish。
 */

/**
 * 一次性 finalize 控制器（可变 ref 载荷，便于组件与纯测共用）。
 */
export type SessionFinalizeController<T> = {
  /** 本轮是否已调用过 finish */
  finalized: boolean
  /** 已缓存的摘要；finalized 后非 null */
  stats: T | null
}

export function createSessionFinalizeController<T>(): SessionFinalizeController<T> {
  return {
    finalized: false,
    stats: null
  }
}

/**
 * 轮次 / 新会话重置：允许下一轮再 finish 一次。
 */
export function resetSessionFinalizeController<T>(
  controller: SessionFinalizeController<T>
): void {
  controller.finalized = false
  controller.stats = null
}

/**
 * 确保 finish 至多执行一次。
 * - 已 finalized：直接返回缓存 stats（finishOnce 不调用）
 * - 未 finalized：调用 finishOnce，写入 controller 并返回
 */
export function ensureSessionFinalized<T>(
  controller: SessionFinalizeController<T>,
  finishOnce: () => T
): T {
  if (controller.finalized && controller.stats != null) {
    return controller.stats
  }
  const stats = finishOnce()
  controller.finalized = true
  controller.stats = stats
  return stats
}

/**
 * 只读缓存；未 finalize 时返回 null（render 用，不触发 finish）。
 */
export function peekFinalizedSessionStats<T>(
  controller: SessionFinalizeController<T>
): T | null {
  if (!controller.finalized) return null
  return controller.stats
}
