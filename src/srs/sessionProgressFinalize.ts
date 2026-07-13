/**
 * 会话完成结算（FC-09 修补 / F2-04 reopen）
 *
 * 保证「从未完成 → 完成」只调用 finish 一次。
 * 供 Demo effect / 完成按钮共用；render 不得调用 finish。
 *
 * F2-04：短期 pending 在「到达队尾已 finalize」之后实际追加卡片时，
 * 必须 reopen finalize（清缓存摘要、允许再次 finish），但**不得**清零
 * progress 计数——第二次摘要须包含此前评分 + 重入学评分。
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
 * 轮次 / 新会话 / F2-04 pending 重入后：允许再次 finish 一次。
 * 不触碰 progress 状态（由调用方保证不清零）。
 */
export function resetSessionFinalizeController<T>(
  controller: SessionFinalizeController<T>
): void {
  controller.finalized = false
  controller.stats = null
}

/**
 * F2-04：pending wake 是否应 reopen 完成摘要。
 * 仅当「追加前会话已处于完成态」且「真正追加了至少一张」时为 true。
 * stale / 拒绝 / 尾部已存在 / 并发去重后 0 追加 → false，不得无故重置摘要。
 */
export function shouldReopenSessionFinalizeAfterPendingAppend(params: {
  wasSessionComplete: boolean
  actuallyAppendedCount: number
}): boolean {
  return (
    params.wasSessionComplete === true &&
    Number.isFinite(params.actuallyAppendedCount) &&
    params.actuallyAppendedCount > 0
  )
}

/**
 * 在确认应 reopen 时重置 finalize 控制器。
 * 返回是否执行了 reopen（便于调用方 clear sessionStats / resume autosave）。
 */
export function reopenSessionFinalizeIfNeeded<T>(
  controller: SessionFinalizeController<T>,
  params: {
    wasSessionComplete: boolean
    actuallyAppendedCount: number
  }
): boolean {
  if (!shouldReopenSessionFinalizeAfterPendingAppend(params)) {
    return false
  }
  resetSessionFinalizeController(controller)
  return true
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
