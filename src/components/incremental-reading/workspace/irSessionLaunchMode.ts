/**
 * 本次专注阅读会话启动模式（仅影响当前启动，不写回全局设置）
 */

export type IRSessionLaunchMode = "read-only" | "mixed"

/**
 * 解析本次会话是否启用混合学习。
 * - 显式「只读」：强制关闭混合，即使全局开启
 * - 显式「混合」：强制开启混合，即使全局关闭
 * - 未指定（资料库选卡 / 刷新兼容路径等）：回退全局开关
 */
export function resolveSessionMixedEnabled(
  sessionLaunchMode: IRSessionLaunchMode | null | undefined,
  globalMixedLearningEnabled: boolean
): boolean {
  if (sessionLaunchMode === "read-only") return false
  if (sessionLaunchMode === "mixed") return true
  return Boolean(globalMixedLearningEnabled)
}

/**
 * 用户意图为混合、但本快照未混入任何复习卡时的事实型提示。
 * 不伪造数据、无跨日逻辑。
 */
export function buildMixedDegradedNotice(params: {
  mixedEnabledForSession: boolean
  selectedReviewCount: number
}): string | null {
  if (!params.mixedEnabledForSession) return null
  if (params.selectedReviewCount > 0) return null
  return "本次未安排到期复习卡，已按纯阅读进行"
}
