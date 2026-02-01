/**
 * 渐进阅读状态存储模块
 *
 * 使用 Block Properties 存储 ir.* 状态：
 * - ir.priority: number (0-100)
 * - ir.lastRead: Date | null
 * - ir.readCount: number
 * - ir.due: Date
 * - ir.intervalDays: number (当前间隔天数，用于计算下一次 due)
 * - ir.postponeCount: number (累计推后次数：手动推后 + 自动后移)
 * - ir.stage: string (漏斗阶段)
 * - ir.lastAction: string (最近一次动作)
 * - ir.position: number | null (Topic 队列位置，数值越小越靠前)
 * - ir.resumeBlockId: number | null (继续阅读：下次打开卡片时跳转到该 blockId)
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { syncCardTagPriority } from "./cardTagRefData"
import {
  DEFAULT_IR_PRIORITY,
  getExtractBaseIntervalDays,
  getPostponeDays,
  getTopicBaseIntervalDays,
  normalizePriority
} from "./incrementalReadingScheduler"

export type IRStage =
  | "topic.preview"
  | "topic.work"
  | "extract.raw"
  | "extract.refined"
  | "extract.item_candidate"

export type IRLastAction =
  | "init"
  | "migrate"
  | "read"
  | "priority"
  | "postpone"
  | "autoPostpone"
  | "complete"

export type IRState = {
  priority: number
  lastRead: Date | null
  readCount: number
  due: Date
  intervalDays: number
  postponeCount: number
  stage: IRStage
  lastAction: IRLastAction
  position: number | null
  /**
   * 渐进阅读“继续阅读”进度：下次打开卡片时跳转到该 blockId
   * - null 表示未设置
   */
  resumeBlockId: DbId | null
}

const DEFAULT_PRIORITY = DEFAULT_IR_PRIORITY
const DAY_MS = 24 * 60 * 60 * 1000
const TOPIC_MAX_INTERVAL_DAYS = 60
const EXTRACT_MAX_INTERVAL_DAYS = 30
const TOPIC_GROWTH_FACTOR = 1.25
const EXTRACT_GROWTH_FACTOR = 1.35

// ============================================================================
// 块读取缓存（避免重复 get-block）
// ============================================================================

const blockCache = new Map<DbId, Block | null>()

const getBlockCached = async (blockId: DbId): Promise<Block | undefined> => {
  const fromState = orca.state.blocks?.[blockId] as Block | undefined
  if (fromState) {
    blockCache.set(blockId, fromState)
    return fromState
  }

  if (blockCache.has(blockId)) {
    return blockCache.get(blockId) ?? undefined
  }

  const block = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
  blockCache.set(blockId, block ?? null)
  return block
}

export const invalidateIrBlockCache = (blockId: DbId): void => {
  blockCache.delete(blockId)
}

// ============================================================================
// 工具函数
// ============================================================================

const readProp = (block: Block | undefined, name: string): any =>
  block?.properties?.find(prop => prop.name === name)?.value

const parseNumber = (value: any, fallback: number): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

const parseOptionalNumber = (value: any): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return null
}

const parseString = (value: any, fallback: string | null): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  return fallback
}

const parseDate = (value: any, fallback: Date | null): Date | null => {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function getMaxIntervalDays(cardType: string): number {
  if (cardType === "extracts") return EXTRACT_MAX_INTERVAL_DAYS
  return TOPIC_MAX_INTERVAL_DAYS
}

function clampIntervalDays(cardType: string, raw: number): number {
  const fallback = cardType === "extracts" ? 2 : 5
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback
  const max = getMaxIntervalDays(cardType)
  return Math.min(max, Math.max(1, value))
}

function computeDueFromIntervalDays(baseDate: Date, intervalDays: number): Date {
  const next = new Date(baseDate.getTime() + intervalDays * DAY_MS)
  return next
}

function getInitialStage(cardType: string): IRStage {
  if (cardType === "extracts") return "extract.raw"
  return "topic.preview"
}

function computeBaseIntervalDays(
  block: Block | undefined,
  numericPriority: number
): number {
  const normalizedPriority = normalizePriority(numericPriority)
  const cardType = block ? extractCardType(block) : "topic"

  if (cardType === "extracts") {
    return getExtractBaseIntervalDays(normalizedPriority)
  }

  return getTopicBaseIntervalDays(normalizedPriority)
}

function growIntervalDays(
  cardType: string,
  currentIntervalDays: number
): number {
  const base = Math.max(1, currentIntervalDays)
  const factor = cardType === "extracts" ? EXTRACT_GROWTH_FACTOR : TOPIC_GROWTH_FACTOR
  return clampIntervalDays(cardType, base * factor)
}

const buildDefaultState = (priority: number, lastRead: Date | null): IRState => {
  const normalizedPriority = normalizePriority(priority)
  const cardType = "topic"
  const baseDate = new Date()
  const intervalDays = clampIntervalDays(cardType, getTopicBaseIntervalDays(normalizedPriority))
  return {
    priority: normalizedPriority,
    lastRead,
    readCount: 0,
    due: computeDueFromIntervalDays(baseDate, intervalDays),
    intervalDays,
    postponeCount: 0,
    stage: getInitialStage(cardType),
    lastAction: "init",
    position: null,
    resumeBlockId: null
  }
}

// ============================================================================
// 核心 API
// ============================================================================

/**
 * 加载渐进阅读状态
 */
export async function loadIRState(blockId: DbId): Promise<IRState> {
  const now = new Date()
  const initial = buildDefaultState(DEFAULT_PRIORITY, null)

  try {
    const block = await getBlockCached(blockId)
    if (!block) return initial

    const rawPriority = parseNumber(readProp(block, "ir.priority"), DEFAULT_PRIORITY)
    const lastRead = parseDate(readProp(block, "ir.lastRead"), null)
    const readCount = parseNumber(readProp(block, "ir.readCount"), 0)
    const due = parseDate(readProp(block, "ir.due"), null)
    const rawIntervalDays = parseNumber(readProp(block, "ir.intervalDays"), Number.NaN)
    const rawPostponeCount = parseNumber(readProp(block, "ir.postponeCount"), 0)
    const rawStage = parseString(readProp(block, "ir.stage"), null)
    const rawLastAction = parseString(readProp(block, "ir.lastAction"), null)
    const position = parseOptionalNumber(readProp(block, "ir.position"))
    const resumeBlockId = parseOptionalNumber(readProp(block, "ir.resumeBlockId"))

    const priority = normalizePriority(rawPriority)
    const cardType = extractCardType(block)
    const baseIntervalDays = computeBaseIntervalDays(block, priority)
    const intervalDays = clampIntervalDays(
      cardType,
      Number.isFinite(rawIntervalDays) ? rawIntervalDays : baseIntervalDays
    )
    const normalizedDue = due ?? computeDueFromIntervalDays(now, intervalDays)
    const stage = (rawStage as IRStage | null) ?? getInitialStage(cardType)
    const lastAction = (rawLastAction as IRLastAction | null) ?? "init"

    return {
      priority,
      lastRead,
      readCount,
      due: normalizedDue,
      intervalDays,
      postponeCount: Math.max(0, Math.floor(rawPostponeCount)),
      stage,
      lastAction,
      position,
      resumeBlockId
    }
  } catch (error) {
    console.error("[IR] 读取渐进阅读状态失败:", error)
    orca.notify("error", "读取渐进阅读状态失败", { title: "渐进阅读" })
    return initial
  }
}

/**
 * 保存渐进阅读状态
 */
export async function saveIRState(blockId: DbId, state: IRState): Promise<void> {
  try {
    const props = [
      { name: "ir.priority", value: state.priority, type: 3 },
      { name: "ir.lastRead", value: state.lastRead ?? null, type: 5 },
      { name: "ir.readCount", value: state.readCount, type: 3 },
      { name: "ir.due", value: state.due, type: 5 },
      { name: "ir.intervalDays", value: state.intervalDays, type: 3 },
      { name: "ir.postponeCount", value: state.postponeCount, type: 3 },
      { name: "ir.stage", value: state.stage, type: 2 },
      { name: "ir.lastAction", value: state.lastAction, type: 2 },
      { name: "ir.position", value: state.position ?? null, type: 3 },
      { name: "ir.resumeBlockId", value: state.resumeBlockId ?? null, type: 3 }
    ]

    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      props
    )

    invalidateIrBlockCache(blockId)
    await syncCardTagPriority(blockId, state.priority)
  } catch (error) {
    console.error("[IR] 保存渐进阅读状态失败:", error)
    orca.notify("error", "保存渐进阅读状态失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 删除渐进阅读状态（移除所有 ir.* 属性）
 */
export async function deleteIRState(blockId: DbId): Promise<void> {
  try {
    const block = await getBlockCached(blockId)
    const propertyNames = block?.properties
      ?.filter(prop => prop.name.startsWith("ir."))
      .map(prop => prop.name) ?? []

    if (propertyNames.length === 0) {
      return
    }

    await orca.commands.invokeEditorCommand(
      "core.editor.deleteProperties",
      null,
      [blockId],
      propertyNames
    )

    invalidateIrBlockCache(blockId)
  } catch (error) {
    console.error("[IR] 删除渐进阅读状态失败:", error)
    orca.notify("error", "删除渐进阅读状态失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 确保块存在渐进阅读状态（仅在缺失时初始化）
 */
export async function ensureIRState(blockId: DbId): Promise<IRState> {
  try {
    const now = new Date()
    const block = await getBlockCached(blockId)
    const state = await loadIRState(blockId)

    const props = block?.properties ?? []
    const hasPriority = props.some(prop => prop.name === "ir.priority")
    const hasLastRead = props.some(prop => prop.name === "ir.lastRead")
    const hasReadCount = props.some(prop => prop.name === "ir.readCount")
    const hasDue = props.some(prop => prop.name === "ir.due")
    const hasIntervalDays = props.some(prop => prop.name === "ir.intervalDays")
    const hasPostponeCount = props.some(prop => prop.name === "ir.postponeCount")
    const hasStage = props.some(prop => prop.name === "ir.stage")
    const hasLastAction = props.some(prop => prop.name === "ir.lastAction")
    const hasPosition = props.some(prop => prop.name === "ir.position")
    const hasResumeBlockId = props.some(prop => prop.name === "ir.resumeBlockId")

    const cardType = block ? extractCardType(block) : "basic"
    const isTopic = cardType === "topic"

    const rawPriority = parseNumber(readProp(block, "ir.priority"), DEFAULT_PRIORITY)
    const normalizedPriority = normalizePriority(rawPriority)
    const rawDue = parseDate(readProp(block, "ir.due"), null)
    const rawPosition = parseOptionalNumber(readProp(block, "ir.position"))
    const rawIntervalDays = parseNumber(readProp(block, "ir.intervalDays"), Number.NaN)
    const rawPostponeCount = parseNumber(readProp(block, "ir.postponeCount"), Number.NaN)
    const rawStage = parseString(readProp(block, "ir.stage"), null)
    const rawLastAction = parseString(readProp(block, "ir.lastAction"), null)

    const isLegacy = !hasIntervalDays
    const baseIntervalDays = computeBaseIntervalDays(block, normalizedPriority)
    const intervalDays = clampIntervalDays(
      cardType,
      Number.isFinite(rawIntervalDays) ? rawIntervalDays : (isLegacy ? baseIntervalDays : state.intervalDays)
    )
    // 兼容 Book IR：批量初始化章节时会预设分散 due（但旧版本没写 intervalDays）。
    // 对“未读的新卡”（readCount=0 且 lastRead=null）保留预设 due，避免分散排期被迁移覆盖。
    const preservePresetDue = Boolean(isLegacy && rawDue && state.readCount === 0 && !state.lastRead)
    const due = preservePresetDue
      ? rawDue!
      : (isLegacy
        ? computeDueFromIntervalDays(now, intervalDays)
        : (rawDue ?? computeDueFromIntervalDays(now, intervalDays)))

    const postponeCount = Math.max(
      0,
      Math.floor(Number.isFinite(rawPostponeCount) ? rawPostponeCount : state.postponeCount)
    )
    const stage = ((rawStage as IRStage | null) ?? state.stage) ?? getInitialStage(cardType)
    const lastAction = (isLegacy ? "migrate" : ((rawLastAction as IRLastAction | null) ?? state.lastAction ?? "init"))

    const shouldWrite = !hasPriority
      || !hasLastRead
      || !hasReadCount
      || !hasDue
      || !hasIntervalDays
      || !hasPostponeCount
      || !hasStage
      || !hasLastAction
      || !hasResumeBlockId
      || (isTopic && !hasPosition)
      || rawPriority !== normalizedPriority
      || !rawDue
      || (isTopic && rawPosition === null)
      || !Number.isFinite(rawIntervalDays)
      || !Number.isFinite(rawPostponeCount)

    if (shouldWrite) {
      // Topic 的队列位置独立于优先级；缺失时初始化为当前时间戳（越新越靠后）。
      const nextPosition = isTopic ? (rawPosition ?? state.position ?? Date.now()) : state.position
      const normalizedState: IRState = {
        priority: normalizedPriority,
        lastRead: state.lastRead,
        readCount: state.readCount,
        intervalDays,
        postponeCount,
        stage,
        lastAction,
        // 迁移：直接按新规则立刻重算 due（避免旧规则导致的长期高频/排序失真）
        due,
        position: nextPosition,
        resumeBlockId: state.resumeBlockId
      }
      await saveIRState(blockId, normalizedState)
      return normalizedState
    }

    return state
  } catch (error) {
    console.error("[IR] 初始化渐进阅读状态失败:", error)
    orca.notify("error", "初始化渐进阅读状态失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 标记已读：更新 lastRead/readCount/due
 */
export async function markAsRead(blockId: DbId): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"
    const nextIntervalDays = growIntervalDays(cardType, prev.intervalDays)
    const nextState: IRState = {
      priority: prev.priority,
      lastRead: now,
      readCount: prev.readCount + 1,
      intervalDays: nextIntervalDays,
      postponeCount: prev.postponeCount,
      stage: prev.stage,
      lastAction: "read",
      due: computeDueFromIntervalDays(now, nextIntervalDays),
      position: prev.position,
      resumeBlockId: prev.resumeBlockId
    }
    await saveIRState(blockId, nextState)
    return nextState
  } catch (error) {
    console.error("[IR] 标记已读失败:", error)
    orca.notify("error", "标记已读失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 标记已读并更新优先级：更新 priority/lastRead/readCount/due
 */
export async function markAsReadWithPriority(
  blockId: DbId,
  newPriority: number
): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const block = await getBlockCached(blockId)
    const normalizedPriority = normalizePriority(newPriority)
    const cardType = block ? extractCardType(block) : "topic"
    const nextIntervalDays = clampIntervalDays(
      cardType,
      computeBaseIntervalDays(block, normalizedPriority)
    )
    const nextState: IRState = {
      priority: normalizedPriority,
      lastRead: now,
      readCount: prev.readCount + 1,
      intervalDays: nextIntervalDays,
      postponeCount: prev.postponeCount,
      stage: prev.stage,
      lastAction: "priority",
      due: computeDueFromIntervalDays(now, nextIntervalDays),
      position: prev.position,
      resumeBlockId: prev.resumeBlockId
    }
    await saveIRState(blockId, nextState)
    return nextState
  } catch (error) {
    console.error("[IR] 标记已读并更新优先级失败:", error)
    orca.notify("error", "标记已读并更新优先级失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 更新优先级并重算 due（基于当前时间）
 */
export async function updatePriority(blockId: DbId, newPriority: number): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const normalizedPriority = normalizePriority(newPriority)
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"
    const nextIntervalDays = clampIntervalDays(
      cardType,
      computeBaseIntervalDays(block, normalizedPriority)
    )

    const nextState: IRState = {
      priority: normalizedPriority,
      lastRead: prev.lastRead,
      readCount: prev.readCount,
      intervalDays: nextIntervalDays,
      postponeCount: prev.postponeCount,
      stage: prev.stage,
      lastAction: "priority",
      due: computeDueFromIntervalDays(now, nextIntervalDays),
      position: prev.position,
      resumeBlockId: prev.resumeBlockId
    }

    await saveIRState(blockId, nextState)
    return nextState
  } catch (error) {
    console.error("[IR] 更新优先级失败:", error)
    orca.notify("error", "更新优先级失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 批量更新优先级
 */
export async function bulkUpdatePriority(
  blockIds: DbId[],
  newPriority: number
): Promise<{ success: DbId[]; failed: Array<{ id: DbId; error: string }> }> {
  if (blockIds.length === 0) {
    return { success: [], failed: [] }
  }

  const results = await Promise.allSettled(
    blockIds.map(blockId => updatePriority(blockId, newPriority))
  )

  const success: DbId[] = []
  const failed: Array<{ id: DbId; error: string }> = []

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      success.push(blockIds[index])
      return
    }
    const reason = result.reason
    failed.push({
      id: blockIds[index],
      error: reason instanceof Error ? reason.message : String(reason ?? "未知错误")
    })
  })

  return { success, failed }
}

/**
 * 更新“继续阅读”进度：仅修改 ir.resumeBlockId，不改变其它 IR 状态
 */
export async function updateResumeBlockId(
  blockId: DbId,
  resumeBlockId: DbId | null
): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const nextState: IRState = {
      ...prev,
      resumeBlockId
    }
    await saveIRState(blockId, nextState)
    return nextState
  } catch (error) {
    console.error("[IR] 更新阅读进度失败:", error)
    orca.notify("error", "更新阅读进度失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 推后（Postpone）：写回 due/intervalDays/postponeCount/lastAction
 *
 * 天数按数值优先级自动决定（高优先级推后更短，低优先级推后更长）
 */
export async function postpone(blockId: DbId): Promise<{ state: IRState; days: number }> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"

    const irCardType = cardType === "extracts" ? "extracts" : "topic"
    const days = getPostponeDays(irCardType, prev.priority)
    const nextIntervalDays = clampIntervalDays(cardType, days)

    const nextState: IRState = {
      ...prev,
      intervalDays: nextIntervalDays,
      postponeCount: prev.postponeCount + 1,
      lastAction: "postpone",
      due: computeDueFromIntervalDays(now, nextIntervalDays)
    }

    await saveIRState(blockId, nextState)
    return { state: nextState, days }
  } catch (error) {
    console.error("[IR] 推后失败:", error)
    orca.notify("error", "推后失败", { title: "渐进阅读" })
    throw error
  }
}
