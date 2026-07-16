/**
 * 渐进阅读状态持久化：load / save / delete / ensure
 */

import type { DbId } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"
import { syncCardTagPriority } from "../cardTagRefData"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"
import { normalizePriority } from "../incrementalReadingScheduler"
import { getBlockCached, invalidateIrBlockCache } from "./irBlockCache"
import {
  IR_SCHEDULING_PROPERTY_NAMES,
  parseDate,
  parseNumber,
  parseOptionalNumber,
  parseReadingBreakpoint,
  parseString,
  readProp,
  serializeReadingBreakpoint
} from "./irPropertyCodec"
import {
  clampIntervalDays,
  computeBaseIntervalDays,
  computeDispersedSchedule,
  DEFAULT_PRIORITY,
  getInitialStage,
  isNewCard
} from "./irSchedulingHelpers"
import type { IRLastAction, IRStage, IRState } from "./irTypes"

/**
 * 加载渐进阅读状态
 */
export async function loadIRState(blockId: DbId): Promise<IRState> {
  const now = new Date()

  try {
    const block = await getBlockCached(blockId)
    if (!block) {
      throw new Error(`读取渐进阅读状态失败：块 #${blockId} 不存在`)
    }

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
    const readingBreakpoint = parseReadingBreakpoint(readProp(block, "ir.breakpoint"))
    const autoPostponeBatchId = parseString(readProp(block, "ir.autoPostponeBatchId"), null)

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
      resumeBlockId,
      readingBreakpoint,
      autoPostponeBatchId
    }
  } catch (error) {
    console.error("[IR] 读取渐进阅读状态失败:", error)
    orca.notify("error", "读取渐进阅读状态失败", { title: "渐进阅读" })
    // 不得用默认状态伪装成功，否则收集器会把失败当成“无到期”
    throw error instanceof Error ? error : new Error(String(error))
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
      { name: "ir.resumeBlockId", value: state.resumeBlockId ?? null, type: 3 },
      { name: "ir.breakpoint", value: serializeReadingBreakpoint(state.readingBreakpoint), type: 2 },
      { name: "ir.autoPostponeBatchId", value: state.autoPostponeBatchId ?? null, type: 2 }
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
 * 结束块的渐进阅读调度身份，同时保留 ir.source* 等来源追溯字段。
 */
export async function deleteIRSchedulingState(blockId: DbId): Promise<void> {
  try {
    const block = await getBlockCached(blockId)
    const propertyNames = block?.properties
      ?.filter(prop => IR_SCHEDULING_PROPERTY_NAMES.has(prop.name))
      .map(prop => prop.name) ?? []

    if (propertyNames.length === 0) return

    await orca.commands.invokeEditorCommand(
      "core.editor.deleteProperties",
      null,
      [blockId],
      propertyNames
    )
    invalidateIrBlockCache(blockId)
  } catch (error) {
    console.error("[IR] 删除渐进阅读调度状态失败:", error)
    orca.notify("error", "结束渐进阅读调度失败", { title: "渐进阅读" })
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
    const shouldRecomputeSchedule = !preservePresetDue && (isLegacy || !rawDue)
    const nextSchedule = shouldRecomputeSchedule
      ? computeDispersedSchedule(blockId, cardType, now, intervalDays, { isNew: isNewCard(state) })
      : null
    const due = preservePresetDue
      ? rawDue!
      : (nextSchedule?.due ?? rawDue ?? computeDueFromIntervalDays(now, intervalDays))
    const nextIntervalDays = nextSchedule?.intervalDays ?? intervalDays

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
        intervalDays: nextIntervalDays,
        postponeCount,
        stage,
        lastAction,
        // 迁移：直接按新规则立刻重算 due（避免旧规则导致的长期高频/排序失真）
        due,
        position: nextPosition,
        resumeBlockId: state.resumeBlockId,
        readingBreakpoint: state.readingBreakpoint ?? null,
        autoPostponeBatchId: state.autoPostponeBatchId ?? null
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
