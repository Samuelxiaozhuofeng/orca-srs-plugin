/**
 * 自动过载治理「当日一次」守卫：localStorage，按 repo + pluginName + 本地自然日隔离。
 *
 * 记录「今天已执行过 auto-postpone」，避免同日多次显式启动会话时重复推迟。
 * 键隔离模式沿用 `irDailyStatsStorage.ts`（repo + pluginName + 本地日）。
 *
 * 硬规则：读取/写入失败均可见（返回 ok:false + Error），不静默吞掉。
 */

import { formatLocalDateKey } from "./irQueuePolicy"

export const IR_AUTO_POSTPONE_GUARD_PREFIX = "orca-srs:ir-auto-postpone:"
export const IR_AUTO_POSTPONE_GUARD_VERSION = 1 as const

export type IRAutoPostponeGuardStorage = Pick<Storage, "getItem" | "setItem">

export type IRAutoPostponeGuardRecord = {
  version: typeof IR_AUTO_POSTPONE_GUARD_VERSION
  repo: string
  pluginName: string
  dateKey: string
  /** 执行时间戳（ms） */
  ranAt: number
  /** 本次批次 ID（可撤销）；无推迟时为 null */
  batchId: string | null
  /** 本次实际推迟数量（诊断用） */
  deferredCount: number
}

function resolveStorage(
  storage: IRAutoPostponeGuardStorage | null | undefined
): IRAutoPostponeGuardStorage | null {
  return storage === undefined ? globalThis.localStorage : storage
}

export function buildIRAutoPostponeGuardKey(
  repo: string,
  pluginName: string,
  dateKey: string
): string {
  const repoKey = encodeURIComponent(repo.trim() || "unknown-repo")
  const pluginKey = encodeURIComponent(pluginName.trim() || "orca-srs")
  return `${IR_AUTO_POSTPONE_GUARD_PREFIX}${repoKey}:${pluginKey}:${dateKey}`
}

export type IRAutoPostponeGuardCheck =
  | { ok: true; ranToday: boolean; record: IRAutoPostponeGuardRecord | null }
  | { ok: false; error: Error }

/**
 * 判断今天是否已执行过 auto-postpone。
 * - storage 不可用 / getItem 抛错 / 坏数据 → ok:false + Error（错误可见，调用方保守跳过）
 * - 无记录 → ok:true ranToday:false
 * - 有效记录 → ok:true ranToday:true
 */
export function hasAutoPostponeRunToday(options: {
  repo: string
  pluginName: string
  dateKey?: string
  now?: Date
  storage?: IRAutoPostponeGuardStorage | null
}): IRAutoPostponeGuardCheck {
  const dateKey = options.dateKey ?? formatLocalDateKey(options.now ?? new Date())
  const storage = resolveStorage(options.storage)
  if (!storage) {
    return { ok: false, error: new Error("localStorage 不可用") }
  }
  const key = buildIRAutoPostponeGuardKey(options.repo, options.pluginName, dateKey)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
  if (raw == null || raw === "") {
    return { ok: true, ranToday: false, record: null }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: new Error(`auto-postpone 守卫 JSON 解析失败: ${msg}`) }
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: new Error("auto-postpone 守卫根节点必须是对象") }
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== IR_AUTO_POSTPONE_GUARD_VERSION) {
    return {
      ok: false,
      error: new Error(
        `auto-postpone 守卫 version 无效（期望 ${IR_AUTO_POSTPONE_GUARD_VERSION}，得到 ${String(obj.version)}）`
      )
    }
  }
  if (obj.dateKey !== dateKey) {
    // 键隔离下理论上不会串日；若出现则视为「今日未运行」并暴露给上层由 fromStorage 校验
    return {
      ok: false,
      error: new Error(
        `auto-postpone 守卫 dateKey 不匹配（存储 ${String(obj.dateKey)}，期望 ${dateKey}）`
      )
    }
  }
  const record: IRAutoPostponeGuardRecord = {
    version: IR_AUTO_POSTPONE_GUARD_VERSION,
    repo: typeof obj.repo === "string" ? obj.repo : options.repo,
    pluginName: typeof obj.pluginName === "string" ? obj.pluginName : options.pluginName,
    dateKey,
    ranAt: typeof obj.ranAt === "number" && Number.isFinite(obj.ranAt) ? obj.ranAt : 0,
    batchId: typeof obj.batchId === "string" ? obj.batchId : null,
    deferredCount:
      typeof obj.deferredCount === "number" && Number.isFinite(obj.deferredCount)
        ? obj.deferredCount
        : 0
  }
  return { ok: true, ranToday: true, record }
}

export type IRAutoPostponeGuardMark =
  | { ok: true; record: IRAutoPostponeGuardRecord }
  | { ok: false; error: Error; record: IRAutoPostponeGuardRecord }

/**
 * 记录「今天已执行过 auto-postpone」。
 * 写入失败返回 ok:false + Error（错误可见，调用方须提示，不得静默）。
 */
export function markAutoPostponeRunToday(options: {
  repo: string
  pluginName: string
  dateKey?: string
  now?: Date
  batchId?: string | null
  deferredCount?: number
  storage?: IRAutoPostponeGuardStorage | null
}): IRAutoPostponeGuardMark {
  const nowDate = options.now ?? new Date()
  const dateKey = options.dateKey ?? formatLocalDateKey(nowDate)
  const record: IRAutoPostponeGuardRecord = {
    version: IR_AUTO_POSTPONE_GUARD_VERSION,
    repo: options.repo.trim() || "unknown-repo",
    pluginName: options.pluginName.trim() || "orca-srs",
    dateKey,
    ranAt: nowDate.getTime(),
    batchId: options.batchId ?? null,
    deferredCount: Math.max(0, Math.floor(options.deferredCount ?? 0))
  }
  const storage = resolveStorage(options.storage)
  if (!storage) {
    return { ok: false, error: new Error("localStorage 不可用"), record }
  }
  const key = buildIRAutoPostponeGuardKey(options.repo, options.pluginName, dateKey)
  try {
    storage.setItem(key, JSON.stringify(record))
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      record
    }
  }
  return { ok: true, record }
}
