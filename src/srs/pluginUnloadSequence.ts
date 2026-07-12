/**
 * 插件卸载顺序 helper（FC-03）
 *
 * 在 Orca 插件数据 API 仍可用时、注销/清理前 flush 复习日志。
 * 失败 console.error + 可选 notify，继续卸载；不宣称日志已落盘。
 */

import { flushReviewLogs } from "./reviewLogStorage"

export const UNLOAD_LOG_FLUSH_PENDING_MESSAGE =
  "插件卸载时统计日志仍待重试，请尽快重新加载插件以完成写入"

export type UnloadSequenceStep = {
  name: string
  run: () => void | Promise<void>
}

export type RunPluginUnloadSequenceOptions = {
  pluginName: string
  /** 注销/清理步骤（在 flush 之后执行） */
  cleanupSteps: UnloadSequenceStep[]
  /** 可注入以便测试 */
  flush?: (pluginName: string) => Promise<void>
  /** flush 失败时通知（若 unload 时 notify 仍可用） */
  notifyFlushFailure?: (message: string, error: unknown) => void
  /** 每步 cleanup 失败时的处理；默认 console.error 并继续 */
  onCleanupError?: (stepName: string, error: unknown) => void
}

export type PluginUnloadSequenceResult = {
  flushOk: boolean
  flushError?: unknown
  cleanupErrors: Array<{ name: string; error: unknown }>
}

/**
 * 执行卸载顺序：flush 日志 → 再跑 cleanup 步骤。
 * flush 失败不中断卸载；cleanup 单步失败默认记录后继续。
 */
export async function runPluginUnloadSequence(
  options: RunPluginUnloadSequenceOptions
): Promise<PluginUnloadSequenceResult> {
  const {
    pluginName,
    cleanupSteps,
    flush = flushReviewLogs,
    notifyFlushFailure,
    onCleanupError
  } = options

  let flushOk = true
  let flushError: unknown

  try {
    await flush(pluginName)
  } catch (error) {
    flushOk = false
    flushError = error
    console.error(
      `[${pluginName}] 卸载前 flush 复习日志失败（pending 保留至进程结束，不宣称已落盘）:`,
      error
    )
    try {
      notifyFlushFailure?.(UNLOAD_LOG_FLUSH_PENDING_MESSAGE, error)
    } catch (notifyError) {
      console.error(`[${pluginName}] unload 时 notify 失败:`, notifyError)
    }
  }

  const cleanupErrors: Array<{ name: string; error: unknown }> = []

  for (const step of cleanupSteps) {
    try {
      await step.run()
    } catch (error) {
      cleanupErrors.push({ name: step.name, error })
      if (onCleanupError) {
        onCleanupError(step.name, error)
      } else {
        console.error(`[${pluginName}] 卸载步骤失败 (${step.name}):`, error)
      }
    }
  }

  return { flushOk, flushError, cleanupErrors }
}
