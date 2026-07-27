/**
 * 会话视图切换归零 key。
 *
 * 阅读条目返回 null：其滚动生命周期由断点恢复统一负责
 * （先归零真实滚动 owner 再按 viewportAnchor 对齐），此处不得重复归零，
 * 否则会与恢复对齐互相打架。
 * 完成页 / 混合复习卡 / 加载失败页没有断点恢复接管，必须显式归零。
 */

export type IRSessionViewportResetInput = {
  loadFailed: boolean
  showSummary: boolean
  queueLength: number
  isReviewEntry: boolean
  currentEntryKey?: string | null
}

export function resolveIRSessionViewportResetKey(
  input: IRSessionViewportResetInput
): string | null {
  if (input.loadFailed) return "load-failed"
  // 与 IRSessionShell 的完成页判定保持一致：显式完成或队列读空
  if (input.showSummary || input.queueLength === 0) return "summary"
  if (input.isReviewEntry) return `review:${input.currentEntryKey ?? ""}`
  return null
}
