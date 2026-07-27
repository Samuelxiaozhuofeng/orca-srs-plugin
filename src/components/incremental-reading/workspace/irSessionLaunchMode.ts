/**
 * 本次学习会话启动模式（仅影响当前启动，不写回全局设置）
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
 * 统一会话构成的事实型提示（本次队列由什么组成）。
 * 只陈述本次快照的真实数字，不伪造数据、无跨日逻辑。
 * 队列长度已由每日上限决定，不存在「被时间盒截断、还剩多少」的情况。
 */
export function buildUnifiedSessionNotice(params: {
  mixedEnabledForSession: boolean
  readingCount: number
  reviewCount: number
}): string | null {
  if (!params.mixedEnabledForSession) return null

  if (params.reviewCount === 0) {
    return params.readingCount > 0 ? "本次未安排到期复习卡，已按纯阅读进行" : null
  }

  if (params.readingCount === 0) {
    return `今天没有到期阅读材料，本次复习 ${params.reviewCount} 张记忆卡`
  }

  return null
}
