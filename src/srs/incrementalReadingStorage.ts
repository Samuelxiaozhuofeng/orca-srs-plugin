/**
 * 渐进阅读状态存储模块
 *
 * 使用 Block Properties 存储 ir.* 状态：
 * - ir.priority: number (1-10)
 * - ir.lastRead: Date | null
 * - ir.readCount: number
 * - ir.due: Date
 * - ir.position: number | null (Topic 队列位置，数值越小越靠前)
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { calculateNextDue, getPriorityFromTag, normalizePriority } from "./incrementalReadingScheduler"

export type IRState = {
  priority: number
  lastRead: Date | null
  readCount: number
  due: Date
  position: number | null
}

const DEFAULT_PRIORITY = 5

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

const parseDate = (value: any, fallback: Date | null): Date | null => {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

const buildDefaultState = (priority: number, lastRead: Date | null): IRState => {
  const normalizedPriority = normalizePriority(priority)
  const baseDate = lastRead ?? new Date()
  return {
    priority: normalizedPriority,
    lastRead,
    readCount: 0,
    due: calculateNextDue(normalizedPriority, baseDate),
    position: null
  }
}

const computeNextDue = (
  block: Block | undefined,
  numericPriority: number,
  baseDate: Date
): Date => {
  if (block) {
    const cardType = extractCardType(block)
    if (cardType === "extracts") {
      const tagPriority = getPriorityFromTag(block)
      if (tagPriority) {
        return calculateNextDue(tagPriority, baseDate)
      }
    }
  }
  return calculateNextDue(numericPriority, baseDate)
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
    const position = parseOptionalNumber(readProp(block, "ir.position"))

    const priority = normalizePriority(rawPriority)
    const normalizedDue = due ?? computeNextDue(block, priority, lastRead ?? now)

    return {
      priority,
      lastRead,
      readCount,
      due: normalizedDue,
      position
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
      { name: "ir.position", value: state.position ?? null, type: 3 }
    ]

    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      props
    )

    invalidateIrBlockCache(blockId)
  } catch (error) {
    console.error("[IR] 保存渐进阅读状态失败:", error)
    orca.notify("error", "保存渐进阅读状态失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 确保块存在渐进阅读状态（仅在缺失时初始化）
 */
export async function ensureIRState(blockId: DbId): Promise<IRState> {
  try {
    const block = await getBlockCached(blockId)
    const state = await loadIRState(blockId)

    const props = block?.properties ?? []
    const hasPriority = props.some(prop => prop.name === "ir.priority")
    const hasLastRead = props.some(prop => prop.name === "ir.lastRead")
    const hasReadCount = props.some(prop => prop.name === "ir.readCount")
    const hasDue = props.some(prop => prop.name === "ir.due")
    const hasPosition = props.some(prop => prop.name === "ir.position")

    const cardType = block ? extractCardType(block) : "basic"
    const isTopic = cardType === "topic"

    const rawPriority = parseNumber(readProp(block, "ir.priority"), DEFAULT_PRIORITY)
    const normalizedPriority = normalizePriority(rawPriority)
    const rawDue = parseDate(readProp(block, "ir.due"), null)
    const rawPosition = parseOptionalNumber(readProp(block, "ir.position"))

    const shouldWrite = !hasPriority
      || !hasLastRead
      || !hasReadCount
      || !hasDue
      || (isTopic && !hasPosition)
      || rawPriority !== normalizedPriority
      || !rawDue
      || (isTopic && rawPosition === null)

    if (shouldWrite) {
      // Topic 的队列位置独立于优先级；缺失时初始化为当前时间戳（越新越靠后）。
      const nextPosition = isTopic ? (rawPosition ?? state.position ?? Date.now()) : state.position
      const normalizedState: IRState = {
        priority: normalizedPriority,
        lastRead: state.lastRead,
        readCount: state.readCount,
        // 保留已有 due（如 Book IR 的分散排期），仅在缺失时由 loadIRState 补齐。
        due: state.due,
        position: nextPosition
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
    const nextState: IRState = {
      priority: prev.priority,
      lastRead: now,
      readCount: prev.readCount + 1,
      due: computeNextDue(block, prev.priority, now),
      position: prev.position
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
 * 更新优先级并重算 due（基于当前时间）
 */
export async function updatePriority(blockId: DbId, newPriority: number): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const normalizedPriority = normalizePriority(newPriority)
    const block = await getBlockCached(blockId)

    const nextState: IRState = {
      priority: normalizedPriority,
      lastRead: prev.lastRead,
      readCount: prev.readCount,
      due: computeNextDue(block, normalizedPriority, now),
      position: prev.position
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
