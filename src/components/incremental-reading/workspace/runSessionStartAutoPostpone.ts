/**
 * 会话启动 auto-postpone 编排（SuperMemo「每天首次学习开始时自动整理积压」）。
 *
 * 关键架构约束：本步骤只在**用户显式启动 IR 会话**时执行（时间盒开始 / 今日学习恢复 /
 * 资料库选卡阅读），是一个**独立的、先于队列装配（selectQueueWithPolicy）的显式步骤**。
 * 因此它**不能**落在只读装配路径 `useIRWorkspaceSession.loadReadingQueue` 内
 * （B1「会话装配只读」原则，见 assembleSessionReadingQueue.test.ts 结构守卫）——
 * auto-postpone 的写入 API 只被本模块及 IRWorkspaceShell 启动流程引用。
 *
 * 顺序保证：调用方 `await runSessionStartAutoPostpone()` 完成（新 due 已落盘 +
 * invalidateIrBlockCache）后，才调用只读 `loadReadingQueue`；后者重新只读收集到的
 * 是**新的 due**，被推迟的旧积压（due 移到未来）自然不再「今日到期」，不进当日队列。
 *
 * 硬规则：读取/写入/推迟失败均可见（console.error + orca.notify），不静默；失败不阻断会话启动。
 */

import {
  applyAutoPostpone,
  DEFAULT_AUTO_POSTPONE_KEEP_TOP_N,
  formatAutoPostponeSummary,
  undoAutoPostponeBatch
} from "../../../srs/incremental-reading/irOverloadService"
import {
  hasAutoPostponeRunToday,
  markAutoPostponeRunToday
} from "../../../srs/incremental-reading/irAutoPostponeGuard"
import { resolveOrcaRepo } from "../../../srs/incremental-reading/irDailyStatsStorage"
import { formatLocalDateKey } from "../../../srs/incremental-reading/irQueuePolicy"

export type SessionStartAutoPostponeResult = {
  /** 用户可见 banner 文案（无推迟为 null） */
  label: string | null
  /** 批次 ID（可撤销）；无推迟为 null */
  batchId: string | null
  deferredCount: number
  keptCount: number
  deprioritizedCount: number
  /** 因「当日已跑过」或守卫读取失败被跳过 */
  skipped: boolean
}

const EMPTY_RESULT: SessionStartAutoPostponeResult = {
  label: null,
  batchId: null,
  deferredCount: 0,
  keptCount: 0,
  deprioritizedCount: 0,
  skipped: true
}

/**
 * 当日一次的自动过载治理。返回供 banner / 撤销使用的批次信息。
 * 保护/降权语义在 applyAutoPostpone 内：高优先级永不推迟、保留 top-N、反复推迟降权。
 */
export async function runSessionStartAutoPostpone(options: {
  pluginName: string
  now?: Date
}): Promise<SessionStartAutoPostponeResult> {
  const now = options.now ?? new Date()
  const dateKey = formatLocalDateKey(now)
  const repo = resolveOrcaRepo()

  // 1) 当日一次守卫：同日再开会话不重复推迟
  const guard = hasAutoPostponeRunToday({ repo, pluginName: options.pluginName, dateKey })
  if (!guard.ok) {
    // 读取失败可见；保守跳过，避免无法确认是否已跑而重复推迟
    console.error("[IR Workspace] auto-postpone 守卫读取失败，跳过本次自动整理:", guard.error)
    orca.notify(
      "warn",
      `无法确认今日是否已整理积压，已跳过自动整理：${guard.error.message}`,
      { title: "今日学习" }
    )
    return { ...EMPTY_RESULT, skipped: true }
  }
  if (guard.ranToday) {
    return { ...EMPTY_RESULT, skipped: true }
  }

  // 2) 只读收集当前 IR 卡（失败可见，但不阻断会话启动）
  let cards
  try {
    const { collectIRCards } = await import("../../../srs/incrementalReadingCollector")
    cards = await collectIRCards(options.pluginName, { readOnly: true })
  } catch (error) {
    console.error("[IR Workspace] auto-postpone 收集卡片失败:", error)
    orca.notify(
      "warn",
      `自动整理积压前读取卡片失败，已跳过：${error instanceof Error ? error.message : String(error)}`,
      { title: "今日学习" }
    )
    return { ...EMPTY_RESULT, skipped: false }
  }

  // 3) 执行 auto-postpone（部分写入失败会回滚并抛 AutoPostponeError，错误可见；不阻断会话）
  let result
  try {
    result = await applyAutoPostpone(cards, {
      now,
      protectedIds: new Set(),
      keepTopN: DEFAULT_AUTO_POSTPONE_KEEP_TOP_N,
      seed: dateKey
    })
  } catch (error) {
    console.error("[IR Workspace] 自动整理积压失败（已回滚）:", error)
    orca.notify(
      "warn",
      `自动整理积压时出错，已回滚：${error instanceof Error ? error.message : String(error)}`,
      { title: "今日学习" }
    )
    // 未标记守卫：下次启动仍可重试
    return { ...EMPTY_RESULT, skipped: false }
  }

  // 4) 标记守卫（即使本次 0 张也标记，保证「当日一次」不重复收集）；写入失败可见，不静默
  const mark = markAutoPostponeRunToday({
    repo,
    pluginName: options.pluginName,
    dateKey,
    now,
    batchId: result.batchId,
    deferredCount: result.deferredCount
  })
  if (!mark.ok) {
    console.error("[IR Workspace] auto-postpone 当日守卫写入失败:", mark.error)
    orca.notify(
      "warn",
      `已整理积压，但当日守卫写入失败（同日可能重复整理）：${mark.error.message}`,
      { title: "今日学习" }
    )
  }

  // 5) 用户可感知通知
  const label = result.deferredCount > 0 ? formatAutoPostponeSummary(result.deferredCount) : null
  if (result.deferredCount > 0) {
    orca.notify("success", label!, { title: "今日学习" })
  }

  return {
    label,
    batchId: result.batchId,
    deferredCount: result.deferredCount,
    keptCount: result.keptCount,
    deprioritizedCount: result.deprioritizedCount,
    skipped: false
  }
}

/**
 * 撤销本次会话启动的自动推迟批次（复用 irOverloadService 进程内批次机制）。
 * 撤销恢复 due / intervalDays / priority（含反复推迟降权）。
 */
export async function undoSessionStartAutoPostpone(batchId: string): Promise<void> {
  const result = await undoAutoPostponeBatch(batchId)
  if (result.restored > 0) {
    orca.notify("success", `已撤销自动推迟，恢复 ${result.restored} 张卡`, {
      title: "今日学习"
    })
  } else {
    orca.notify(
      "info",
      "没有可撤销的自动推迟（可能已被后续操作覆盖或已重载）",
      { title: "今日学习" }
    )
  }
}
