/**
 * 资料库溢出推后结果 → notify 级别与文案（纯函数，无 React runtime）。
 */

export type OverflowDeferNotifyLevel = "info" | "success" | "warn" | "error"

export type OverflowDeferNotify = {
  level: OverflowDeferNotifyLevel
  message: string
}

export type OverflowDeferNotifyInput = {
  successCount: number
  failedCount: number
}

/**
 * 将 deferIROverflow 真实结果映射为用户可见通知。
 * - 无候选：info
 * - 全成功：success
 * - 部分失败：warn（不得报全部成功）
 * - 全失败：error
 */
export function mapOverflowDeferNotify(
  input: OverflowDeferNotifyInput
): OverflowDeferNotify {
  const successCount = Number.isFinite(input.successCount)
    ? Math.max(0, Math.floor(input.successCount))
    : 0
  const failedCount = Number.isFinite(input.failedCount)
    ? Math.max(0, Math.floor(input.failedCount))
    : 0

  if (successCount === 0 && failedCount === 0) {
    return { level: "info", message: "当前没有需要推后的溢出卡片" }
  }
  if (failedCount === 0) {
    return { level: "success", message: `已推后溢出 ${successCount} 张` }
  }
  if (successCount === 0) {
    return { level: "error", message: `溢出推后全部失败（${failedCount} 张）` }
  }
  return {
    level: "warn",
    message: `溢出推后部分成功：成功 ${successCount}，失败 ${failedCount}`
  }
}
