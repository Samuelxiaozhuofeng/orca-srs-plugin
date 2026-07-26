/**
 * 今日学习可恢复入口 marker：按本地日 + plugin + repo 隔离。
 *
 * 语义（非队列快照）：
 * - srs：记住 session blockId；重开后由 Renderer 用冻结 descriptor + 当前状态/日志重建剩余
 * - ir：记住时长与 mixed；重开后只读重装当日剩余队列，断点靠 ir.resumeBlockId / ir.breakpoint
 *
 * 无 marker 与读取失败是不同状态；损坏 JSON / 未知版本返回 error，不得 null 冒充 absent。
 */

import { formatLocalDateKey } from "../incremental-reading/irQueuePolicyCore"
import { resolveOrcaRepo } from "../incremental-reading/irDailyStatsStorage"

export const TODAY_LEARNING_RESUME_STORAGE_KEY = "today-learning-resume"
export const TODAY_LEARNING_RESUME_VERSION = 1 as const

/** 今日学习时间盒：仅允许 10 / 20 / 30 */
export type TodayLearningTimeBudget = 10 | 20 | 30

export const TODAY_LEARNING_TIME_BUDGETS: readonly TodayLearningTimeBudget[] = [
  10, 20, 30
]

export type TodayLearningResumeKind = "srs" | "ir"

export type TodayLearningSrsResumeMarker = {
  readonly version: typeof TODAY_LEARNING_RESUME_VERSION
  readonly repo: string
  readonly pluginName: string
  readonly dateKey: string
  readonly kind: "srs"
  readonly updatedAt: number
  /** Orca DbId：有限正整数 */
  readonly sessionBlockId: number
  readonly sessionId: string
}

export type TodayLearningIrResumeMarker = {
  readonly version: typeof TODAY_LEARNING_RESUME_VERSION
  readonly repo: string
  readonly pluginName: string
  readonly dateKey: string
  readonly kind: "ir"
  readonly updatedAt: number
  readonly timeBudgetMinutes: TodayLearningTimeBudget
  readonly sessionLaunchMode: "mixed"
}

export type TodayLearningResumeMarker =
  | TodayLearningSrsResumeMarker
  | TodayLearningIrResumeMarker

export type TodayLearningResumeLoadResult =
  | { status: "absent" }
  | { status: "ok"; marker: TodayLearningResumeMarker }
  /** 跨日：有记录但不作为「继续」；不自动删除其他插件数据 */
  | { status: "stale"; marker: TodayLearningResumeMarker }
  | { status: "error"; error: Error }

export type TodayLearningResumeWriteResult =
  | { ok: true; marker: TodayLearningResumeMarker }
  | { ok: false; error: Error }

/** 只允许与恢复点类型一致的精确剩余数启用“继续”。 */
export function resumeMarkerHasTrustedTasks(
  marker: TodayLearningResumeMarker | null,
  remaining: { readonly srs?: number; readonly ir?: number }
): boolean {
  if (marker?.kind === "srs") {
    return remaining.srs != null && remaining.srs > 0
  }
  if (marker?.kind === "ir") {
    return remaining.ir != null && remaining.ir > 0
  }
  return false
}

export type TodayLearningResumeStorageApi = {
  getData: (pluginName: string, key: string) => Promise<unknown>
  /** 测试可注入；生产写入会 JSON.stringify 对象 */
  setData: (
    pluginName: string,
    key: string,
    value: string
  ) => Promise<void>
}

export function isTodayLearningTimeBudget(
  value: unknown
): value is TodayLearningTimeBudget {
  return value === 10 || value === 20 || value === 30
}

/**
 * 解析时长：仅接受 10/20/30。非法时返回显式错误，不静默默认。
 */
export function parseTodayLearningTimeBudget(
  value: unknown
):
  | { ok: true; minutes: TodayLearningTimeBudget }
  | { ok: false; error: Error } {
  if (isTodayLearningTimeBudget(value)) {
    return { ok: true, minutes: value }
  }
  return {
    ok: false,
    error: new Error(
      `非法今日学习时长: ${String(value)}（仅允许 10 / 20 / 30）`
    )
  }
}

/**
 * 解析 sessionBlockId：仅接受有限正整数（与 Orca DbId=number 一致）。
 * 拒绝 string / NaN / Infinity / 0 / 负数 / 小数。
 */
export function parseSessionBlockId(
  value: unknown
):
  | { ok: true; blockId: number }
  | { ok: false; error: Error } {
  if (typeof value !== "number") {
    return {
      ok: false,
      error: new Error(
        `今日学习 sessionBlockId 必须是数字（DbId），收到: ${typeof value}`
      )
    }
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      error: new Error(
        `今日学习 sessionBlockId 无效: ${String(value)}（须为有限正整数）`
      )
    }
  }
  return { ok: true, blockId: value }
}

/**
 * 继续 SRS 时：marker.sessionId 必须与块 descriptor.sessionId 一致。
 * 不一致 fail-closed，禁止导航到错误块。
 */
export function assertResumeSessionIdMatches(
  markerSessionId: string,
  descriptorSessionId: string
): { ok: true } | { ok: false; error: Error } {
  const marker = String(markerSessionId ?? "").trim()
  const block = String(descriptorSessionId ?? "").trim()
  if (!marker || !block) {
    return {
      ok: false,
      error: new Error("恢复点 sessionId 缺失，无法验证会话块")
    }
  }
  if (marker !== block) {
    return {
      ok: false,
      error: new Error(
        `恢复点 sessionId 与会话块不一致（marker=${marker}，block=${block}），已拒绝继续`
      )
    }
  }
  return { ok: true }
}

/**
 * 解析已存 JSON/对象。损坏或未知版本 → error；不得 return null。
 */
export function parseTodayLearningResumeMarker(
  raw: unknown
):
  | { ok: true; marker: TodayLearningResumeMarker }
  | { ok: false; error: Error } {
  let obj: unknown = raw
  if (typeof raw === "string") {
    if (raw.trim() === "") {
      return { ok: false, error: new Error("今日学习 resume 为空字符串") }
    }
    try {
      obj = JSON.parse(raw)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        error: new Error(`今日学习 resume JSON 解析失败: ${message}`)
      }
    }
  }

  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    return {
      ok: false,
      error: new Error("今日学习 resume 不是对象")
    }
  }

  const record = obj as Record<string, unknown>

  if (record.version !== TODAY_LEARNING_RESUME_VERSION) {
    return {
      ok: false,
      error: new Error(
        `今日学习 resume 未知版本: ${String(record.version)}（期望 ${TODAY_LEARNING_RESUME_VERSION}）`
      )
    }
  }

  const repo = typeof record.repo === "string" ? record.repo.trim() : ""
  const pluginName =
    typeof record.pluginName === "string" ? record.pluginName.trim() : ""
  const dateKey = typeof record.dateKey === "string" ? record.dateKey.trim() : ""
  const updatedAt = record.updatedAt
  const kind = record.kind

  if (!repo) {
    return { ok: false, error: new Error("今日学习 resume 缺少 repo") }
  }
  if (!pluginName) {
    return { ok: false, error: new Error("今日学习 resume 缺少 pluginName") }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return {
      ok: false,
      error: new Error(`今日学习 resume dateKey 无效: ${String(record.dateKey)}`)
    }
  }
  if (
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    updatedAt <= 0
  ) {
    return { ok: false, error: new Error("今日学习 resume updatedAt 无效") }
  }

  if (kind === "srs") {
    const blockId = parseSessionBlockId(record.sessionBlockId)
    if (!blockId.ok) {
      return blockId
    }
    if (typeof record.sessionId !== "string" || record.sessionId.trim() === "") {
      return {
        ok: false,
        error: new Error("今日学习 srs resume 缺少 sessionId")
      }
    }
    return {
      ok: true,
      marker: Object.freeze({
        version: TODAY_LEARNING_RESUME_VERSION,
        repo,
        pluginName,
        dateKey,
        kind: "srs",
        updatedAt,
        sessionBlockId: blockId.blockId,
        sessionId: record.sessionId.trim()
      })
    }
  }

  if (kind === "ir") {
    const budget = parseTodayLearningTimeBudget(record.timeBudgetMinutes)
    if (!budget.ok) {
      return budget
    }
    if (record.sessionLaunchMode !== "mixed") {
      return {
        ok: false,
        error: new Error(
          `今日学习 ir resume sessionLaunchMode 无效: ${String(record.sessionLaunchMode)}（仅支持 mixed）`
        )
      }
    }
    return {
      ok: true,
      marker: Object.freeze({
        version: TODAY_LEARNING_RESUME_VERSION,
        repo,
        pluginName,
        dateKey,
        kind: "ir",
        updatedAt,
        timeBudgetMinutes: budget.minutes,
        sessionLaunchMode: "mixed" as const
      })
    }
  }

  // fixed 等未知 kind：显式错误，禁止当 all 回退
  return {
    ok: false,
    error: new Error(
      `今日学习 resume 不支持的 kind: ${String(kind)}（仅 srs | ir）`
    )
  }
}

function defaultStorageApi(): TodayLearningResumeStorageApi {
  return {
    getData: (pluginName, key) => orca.plugins.getData(pluginName, key),
    setData: (pluginName, key, value) =>
      orca.plugins.setData(pluginName, key, value)
  }
}

export type LoadTodayLearningResumeOptions = {
  pluginName: string
  repo?: string
  now?: Date
  storage?: TodayLearningResumeStorageApi
}

/**
 * 读取今日 resume。
 * - getData 返回 null/undefined → absent
 * - 跨日 → stale（可展示但不作「继续」）
 * - 损坏 / 版本 / 网络失败 → error
 */
export async function loadTodayLearningResume(
  options: LoadTodayLearningResumeOptions
): Promise<TodayLearningResumeLoadResult> {
  const pluginName = options.pluginName.trim() || "orca-srs"
  const repo = (options.repo ?? resolveOrcaRepo()).trim() || "unknown-repo"
  const dateKey = formatLocalDateKey(options.now ?? new Date())
  const storage = options.storage ?? defaultStorageApi()

  let raw: unknown
  try {
    raw = await storage.getData(pluginName, TODAY_LEARNING_RESUME_STORAGE_KEY)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return {
      status: "error",
      error: new Error(`读取今日学习 resume 失败: ${err.message}`)
    }
  }

  if (raw == null || raw === "") {
    return { status: "absent" }
  }

  const parsed = parseTodayLearningResumeMarker(raw)
  if (!parsed.ok) {
    return { status: "error", error: parsed.error }
  }

  const { marker } = parsed
  if (marker.pluginName !== pluginName) {
    return {
      status: "error",
      error: new Error(
        `今日学习 resume pluginName 不匹配（存储 ${marker.pluginName}，期望 ${pluginName}）`
      )
    }
  }
  if (marker.repo !== repo) {
    return {
      status: "error",
      error: new Error(
        `今日学习 resume repo 不匹配（存储 ${marker.repo}，期望 ${repo}）`
      )
    }
  }

  if (marker.dateKey !== dateKey) {
    return { status: "stale", marker }
  }

  return { status: "ok", marker }
}

export type WriteSrsResumeInput = {
  pluginName: string
  sessionBlockId: number
  sessionId: string
  repo?: string
  now?: Date
  storage?: TodayLearningResumeStorageApi
}

export type WriteIrResumeInput = {
  pluginName: string
  timeBudgetMinutes: unknown
  repo?: string
  now?: Date
  storage?: TodayLearningResumeStorageApi
}

export async function writeSrsTodayLearningResume(
  input: WriteSrsResumeInput
): Promise<TodayLearningResumeWriteResult> {
  const pluginName = input.pluginName.trim() || "orca-srs"
  const repo = (input.repo ?? resolveOrcaRepo()).trim() || "unknown-repo"
  const now = input.now ?? new Date()
  const storage = input.storage ?? defaultStorageApi()

  const blockId = parseSessionBlockId(input.sessionBlockId)
  if (!blockId.ok) {
    return blockId
  }
  if (typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
    return {
      ok: false,
      error: new Error("写入 srs resume 需要 sessionId")
    }
  }

  const marker: TodayLearningSrsResumeMarker = Object.freeze({
    version: TODAY_LEARNING_RESUME_VERSION,
    repo,
    pluginName,
    dateKey: formatLocalDateKey(now),
    kind: "srs",
    updatedAt: now.getTime(),
    sessionBlockId: blockId.blockId,
    sessionId: input.sessionId.trim()
  })

  try {
    await storage.setData(
      pluginName,
      TODAY_LEARNING_RESUME_STORAGE_KEY,
      JSON.stringify(marker)
    )
    return { ok: true, marker }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return {
      ok: false,
      error: new Error(`写入今日学习 srs resume 失败: ${err.message}`)
    }
  }
}

export async function writeIrTodayLearningResume(
  input: WriteIrResumeInput
): Promise<TodayLearningResumeWriteResult> {
  const pluginName = input.pluginName.trim() || "orca-srs"
  const repo = (input.repo ?? resolveOrcaRepo()).trim() || "unknown-repo"
  const now = input.now ?? new Date()
  const storage = input.storage ?? defaultStorageApi()

  const budget = parseTodayLearningTimeBudget(input.timeBudgetMinutes)
  if (!budget.ok) {
    return budget
  }

  const marker: TodayLearningIrResumeMarker = Object.freeze({
    version: TODAY_LEARNING_RESUME_VERSION,
    repo,
    pluginName,
    dateKey: formatLocalDateKey(now),
    kind: "ir",
    updatedAt: now.getTime(),
    timeBudgetMinutes: budget.minutes,
    sessionLaunchMode: "mixed"
  })

  try {
    await storage.setData(
      pluginName,
      TODAY_LEARNING_RESUME_STORAGE_KEY,
      JSON.stringify(marker)
    )
    return { ok: true, marker }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return {
      ok: false,
      error: new Error(`写入今日学习 ir resume 失败: ${err.message}`)
    }
  }
}

/**
 * 写入失败时可见通知 + console.error；学习本身可继续。
 * 不得宣称「恢复已保存」。
 */
export function reportTodayLearningResumeWriteFailure(
  pluginName: string,
  error: Error,
  notify?: (level: string, message: string, opts?: { title?: string }) => void
): void {
  console.error(`[${pluginName}] 今日学习恢复点保存失败:`, error)
  const notifyFn =
    notify ??
    ((level, message, opts) => {
      orca.notify(level as "error", message, opts as { title?: string })
    })
  notifyFn("error", `学习可继续，但恢复点未保存：${error.message}`, {
    title: "今日学习"
  })
}
