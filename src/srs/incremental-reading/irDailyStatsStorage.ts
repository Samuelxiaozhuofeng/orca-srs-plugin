/**
 * 渐进阅读「今日累计」统计：localStorage，按 repo + pluginName + 本地自然日隔离。
 * 完成会话一次性 commit，sessionId 去重；不写 Orca block 属性。
 */

import type { IRSessionMetricsSnapshot } from "./irMetrics"
import { formatLocalDateKey } from "./irQueuePolicyCore"

export const IR_DAILY_STATS_STORAGE_PREFIX = "orca-srs:ir-daily-stats:"
export const IR_DAILY_STATS_VERSION = 1 as const
/** 日记录内保留的已提交 sessionId 上限（FIFO） */
export const IR_DAILY_STATS_MAX_SESSION_IDS = 64

export type IRDailyStatsTotals = {
  durationMs: number
  plannedCount: number
  completedCount: number
  topicProcessed: number
  extractProcessed: number
  reviewProcessed: number
  extractCreated: number
  itemCreated: number
}

export type IRDailyStatsRecord = {
  version: typeof IR_DAILY_STATS_VERSION
  repo: string
  pluginName: string
  dateKey: string
  totals: IRDailyStatsTotals
  committedSessionIds: string[]
  updatedAt: number
}

export type IRDailyStatsLoadResult =
  | { ok: true; record: IRDailyStatsRecord; fromStorage: boolean }
  | { ok: false; error: Error; record: IRDailyStatsRecord }

export type IRDailyStatsCommitResult =
  | {
    ok: true
    record: IRDailyStatsRecord
    committed: boolean
    skippedDuplicate: boolean
  }
  | {
    ok: false
    error: Error
    record: IRDailyStatsRecord
    committed: boolean
    skippedDuplicate: boolean
  }

export type IRDailyStatsStorage = Pick<Storage, "getItem" | "setItem">

export function emptyIRDailyStatsTotals(): IRDailyStatsTotals {
  return {
    durationMs: 0,
    plannedCount: 0,
    completedCount: 0,
    topicProcessed: 0,
    extractProcessed: 0,
    reviewProcessed: 0,
    extractCreated: 0,
    itemCreated: 0
  }
}

export function createEmptyIRDailyStatsRecord(
  repo: string,
  pluginName: string,
  dateKey: string,
  now = Date.now()
): IRDailyStatsRecord {
  return {
    version: IR_DAILY_STATS_VERSION,
    repo,
    pluginName,
    dateKey,
    totals: emptyIRDailyStatsTotals(),
    committedSessionIds: [],
    updatedAt: now
  }
}

export function resolveOrcaRepo(
  orcaLike: { state?: { repo?: unknown } } | null | undefined = (
    globalThis as unknown as { orca?: { state?: { repo?: unknown } } }
  ).orca
): string {
  const repo = orcaLike?.state?.repo
  if (typeof repo === "string" && repo.trim()) return repo.trim()
  return "unknown-repo"
}

export function buildIRDailyStatsStorageKey(
  repo: string,
  pluginName: string,
  dateKey: string
): string {
  const repoKey = encodeURIComponent(repo.trim() || "unknown-repo")
  const pluginKey = encodeURIComponent(pluginName.trim() || "orca-srs")
  return `${IR_DAILY_STATS_STORAGE_PREFIX}${repoKey}:${pluginKey}:${dateKey}`
}

/**
 * 跨会话「今日 IR 额度」：配置 dailyLimit 减去今日已完成（completedCount）。
 * - configured ≤ 0：不限制（与设置「0=不限制」一致）
 * - remaining=0 且 limited：今日额度用尽，会话应装配空阅读队列（focus 仍可单独插入）
 */
export type EffectiveIRDailyLimit =
  | { kind: "unlimited"; used: number; configured: number }
  | { kind: "limited"; remaining: number; used: number; configured: number }

export function resolveEffectiveIRDailyLimit(
  configuredDailyLimit: number,
  usedCompletedCount: number
): EffectiveIRDailyLimit {
  const used = Number.isFinite(usedCompletedCount)
    ? Math.max(0, Math.floor(usedCompletedCount))
    : 0
  if (!Number.isFinite(configuredDailyLimit) || configuredDailyLimit <= 0) {
    return { kind: "unlimited", used, configured: 0 }
  }
  const configured = Math.floor(configuredDailyLimit)
  return {
    kind: "limited",
    remaining: Math.max(0, configured - used),
    used,
    configured
  }
}

/**
 * 交给 selectQueueWithPolicy / assembleSessionReadingQueue 的 dailyLimit 数值：
 * - unlimited → 0（既有语义：0=不截断）
 * - limited remaining → remaining（含 0：硬上限 0 张，由调用方对 policy 使用 empty queue）
 */
export function effectiveDailyLimitForQueue(
  effective: EffectiveIRDailyLimit
): number {
  if (effective.kind === "unlimited") return 0
  return effective.remaining
}

export function snapshotToDailyTotals(
  snapshot: Pick<
    IRSessionMetricsSnapshot,
    | "durationMs"
    | "plannedCount"
    | "completedCount"
    | "topicProcessed"
    | "extractProcessed"
    | "reviewProcessed"
    | "extractCreated"
    | "itemCreated"
  >
): IRDailyStatsTotals {
  return {
    durationMs: Math.max(0, snapshot.durationMs ?? 0),
    plannedCount: Math.max(0, snapshot.plannedCount),
    completedCount: Math.max(0, snapshot.completedCount),
    topicProcessed: Math.max(0, snapshot.topicProcessed),
    extractProcessed: Math.max(0, snapshot.extractProcessed),
    reviewProcessed: Math.max(0, snapshot.reviewProcessed),
    extractCreated: Math.max(0, snapshot.extractCreated),
    itemCreated: Math.max(0, snapshot.itemCreated)
  }
}

export function mergeIRDailyStatsTotals(
  base: IRDailyStatsTotals,
  delta: IRDailyStatsTotals
): IRDailyStatsTotals {
  return {
    durationMs: base.durationMs + delta.durationMs,
    plannedCount: base.plannedCount + delta.plannedCount,
    completedCount: base.completedCount + delta.completedCount,
    topicProcessed: base.topicProcessed + delta.topicProcessed,
    extractProcessed: base.extractProcessed + delta.extractProcessed,
    reviewProcessed: base.reviewProcessed + delta.reviewProcessed,
    extractCreated: base.extractCreated + delta.extractCreated,
    itemCreated: base.itemCreated + delta.itemCreated
  }
}

/** 将今日累计 totals 映射为摘要 UI 使用的 metrics 形状 */
export function dailyTotalsToMetricsSnapshot(
  totals: IRDailyStatsTotals
): IRSessionMetricsSnapshot {
  return {
    sessionStartedAt: null,
    sessionEndedAt: null,
    durationMs: totals.durationMs > 0 ? totals.durationMs : null,
    plannedCount: totals.plannedCount,
    completedCount: totals.completedCount,
    topicProcessed: totals.topicProcessed,
    extractProcessed: totals.extractProcessed,
    reviewProcessed: totals.reviewProcessed,
    itemCreated: totals.itemCreated,
    extractCreated: totals.extractCreated,
    extractSuccess: totals.extractCreated,
    extractFailure: 0,
    itemizeSuccess: totals.itemCreated,
    itemizeFailure: 0,
    postponeCount: 0,
    archiveCount: 0,
    deleteCount: 0,
    breakpointSaveSuccess: 0,
    breakpointSaveFailure: 0,
    breakpointRestoreSuccess: 0,
    breakpointRestoreFailure: 0,
    autoPostponeCount: 0,
    autoPostponeUndoCount: 0,
    queueLoadMs: null,
    queueLoadFailures: 0,
    dwellMsTotal: 0,
    dwellSamples: 0
  }
}

export type ParseIRDailyStatsResult =
  | { ok: true; record: IRDailyStatsRecord }
  | { ok: false; error: Error }

function isFiniteNonNegNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function parseTotals(raw: unknown, path: string): IRDailyStatsTotals | Error {
  if (!raw || typeof raw !== "object") {
    return new Error(`${path}: totals 必须是对象`)
  }
  const t = raw as Record<string, unknown>
  const keys: (keyof IRDailyStatsTotals)[] = [
    "durationMs",
    "plannedCount",
    "completedCount",
    "topicProcessed",
    "extractProcessed",
    "reviewProcessed",
    "extractCreated",
    "itemCreated"
  ]
  const out = emptyIRDailyStatsTotals()
  for (const key of keys) {
    const v = t[key]
    if (!isFiniteNonNegNumber(v)) {
      return new Error(`${path}: totals.${key} 必须是非负有限数字`)
    }
    out[key] = v
  }
  return out
}

/**
 * 解析日统计 JSON。坏数据返回 ok:false + 可见 Error，不静默吞掉。
 */
export function parseIRDailyStatsRecord(raw: string | null | undefined): ParseIRDailyStatsResult {
  if (raw == null || raw === "") {
    return { ok: false, error: new Error("日统计数据为空") }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: new Error(`日统计 JSON 解析失败: ${msg}`) }
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: new Error("日统计根节点必须是对象") }
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== IR_DAILY_STATS_VERSION) {
    return {
      ok: false,
      error: new Error(`日统计 version 无效（期望 ${IR_DAILY_STATS_VERSION}，得到 ${String(obj.version)}）`)
    }
  }
  if (typeof obj.repo !== "string" || !obj.repo.trim()) {
    return { ok: false, error: new Error("日统计 repo 无效") }
  }
  if (typeof obj.pluginName !== "string" || !obj.pluginName.trim()) {
    return { ok: false, error: new Error("日统计 pluginName 无效") }
  }
  if (typeof obj.dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.dateKey)) {
    return { ok: false, error: new Error("日统计 dateKey 无效（期望 YYYY-MM-DD）") }
  }
  if (!Array.isArray(obj.committedSessionIds)) {
    return { ok: false, error: new Error("日统计 committedSessionIds 必须是数组") }
  }
  const sessionIds: string[] = []
  for (let i = 0; i < obj.committedSessionIds.length; i++) {
    const id = obj.committedSessionIds[i]
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false, error: new Error(`日统计 committedSessionIds[${i}] 无效`) }
    }
    sessionIds.push(id)
  }
  if (!isFiniteNonNegNumber(obj.updatedAt)) {
    return { ok: false, error: new Error("日统计 updatedAt 无效") }
  }
  const totals = parseTotals(obj.totals, "日统计")
  if (totals instanceof Error) {
    return { ok: false, error: totals }
  }
  return {
    ok: true,
    record: {
      version: IR_DAILY_STATS_VERSION,
      repo: obj.repo.trim(),
      pluginName: obj.pluginName.trim(),
      dateKey: obj.dateKey,
      totals,
      committedSessionIds: sessionIds,
      updatedAt: obj.updatedAt
    }
  }
}

export function loadIRDailyStats(options: {
  repo: string
  pluginName: string
  dateKey?: string
  now?: Date
  storage?: IRDailyStatsStorage | null
}): IRDailyStatsLoadResult {
  const dateKey = options.dateKey ?? formatLocalDateKey(options.now ?? new Date())
  const empty = createEmptyIRDailyStatsRecord(options.repo, options.pluginName, dateKey)
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage
  if (!storage) {
    return {
      ok: false,
      error: new Error("localStorage 不可用"),
      record: empty
    }
  }
  const key = buildIRDailyStatsStorageKey(options.repo, options.pluginName, dateKey)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return { ok: false, error: err, record: empty }
  }
  if (raw == null || raw === "") {
    return { ok: true, record: empty, fromStorage: false }
  }
  const parsed = parseIRDailyStatsRecord(raw)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, record: empty }
  }
  // 键隔离下仍校验内容字段，防止串写/迁移错误
  if (parsed.record.repo !== options.repo.trim()) {
    return {
      ok: false,
      error: new Error(
        `日统计 repo 不匹配（存储 ${parsed.record.repo}，期望 ${options.repo.trim()}）`
      ),
      record: empty
    }
  }
  if (parsed.record.pluginName !== options.pluginName.trim()) {
    return {
      ok: false,
      error: new Error(
        `日统计 pluginName 不匹配（存储 ${parsed.record.pluginName}，期望 ${options.pluginName.trim()}）`
      ),
      record: empty
    }
  }
  if (parsed.record.dateKey !== dateKey) {
    return {
      ok: false,
      error: new Error(
        `日统计 dateKey 不匹配（存储 ${parsed.record.dateKey}，期望 ${dateKey}）`
      ),
      record: empty
    }
  }
  return { ok: true, record: parsed.record, fromStorage: true }
}

/**
 * 将会话快照一次性写入今日累计。同一 sessionId 不重复累计。
 * 空活动会话（调用方应避免）仍可写入；调用方对「初始空队列」应只 load 不 commit。
 */
export function commitIRSessionToDailyStats(options: {
  sessionId: string
  snapshot: IRSessionMetricsSnapshot
  repo: string
  pluginName: string
  dateKey?: string
  now?: Date | number
  storage?: IRDailyStatsStorage | null
  maxSessionIds?: number
}): IRDailyStatsCommitResult {
  const sessionId = options.sessionId.trim()
  if (!sessionId) {
    const dateKey = options.dateKey ?? formatLocalDateKey(
      options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())
    )
    const empty = createEmptyIRDailyStatsRecord(options.repo, options.pluginName, dateKey)
    return {
      ok: false,
      error: new Error("sessionId 不能为空"),
      record: empty,
      committed: false,
      skippedDuplicate: false
    }
  }

  const nowDate = options.now instanceof Date
    ? options.now
    : new Date(typeof options.now === "number" ? options.now : Date.now())
  const dateKey = options.dateKey ?? formatLocalDateKey(nowDate)
  const nowMs = nowDate.getTime()
  const maxIds = options.maxSessionIds ?? IR_DAILY_STATS_MAX_SESSION_IDS

  const loaded = loadIRDailyStats({
    repo: options.repo,
    pluginName: options.pluginName,
    dateKey,
    storage: options.storage
  })

  // 读失败时仍尝试在空记录上写入（避免坏数据阻断当前会话展示），但保留错误可见性
  let record = loaded.ok
    ? loaded.record
    : createEmptyIRDailyStatsRecord(options.repo, options.pluginName, dateKey, nowMs)

  if (record.committedSessionIds.includes(sessionId)) {
    return {
      ok: true,
      record,
      committed: false,
      skippedDuplicate: true
    }
  }

  const delta = snapshotToDailyTotals(options.snapshot)
  const nextIds = [...record.committedSessionIds, sessionId]
  while (nextIds.length > maxIds) nextIds.shift()

  const next: IRDailyStatsRecord = {
    ...record,
    totals: mergeIRDailyStatsTotals(record.totals, delta),
    committedSessionIds: nextIds,
    updatedAt: nowMs
  }

  const storage = options.storage === undefined ? globalThis.localStorage : options.storage
  if (!storage) {
    return {
      ok: false,
      error: new Error("localStorage 不可用"),
      record: next,
      committed: false,
      skippedDuplicate: false
    }
  }

  const key = buildIRDailyStatsStorageKey(options.repo, options.pluginName, dateKey)
  try {
    storage.setItem(key, JSON.stringify(next))
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return {
      ok: false,
      error: err,
      record: next,
      committed: false,
      skippedDuplicate: false
    }
  }

  if (!loaded.ok) {
    // 写入成功，但原先读取有问题：仍报告错误以便 UI 提示过坏数据被覆盖
    return {
      ok: false,
      error: new Error(
        `日统计先前读取失败（已用当前会话覆盖写入）：${loaded.error.message}`
      ),
      record: next,
      committed: true,
      skippedDuplicate: false
    }
  }

  return {
    ok: true,
    record: next,
    committed: true,
    skippedDuplicate: false
  }
}

export function createIRSessionId(now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `ir-session-${now}-${rand}`
}
