/**
 * 渐进阅读调度变更：已读、优先级、推后、到期提前、断点/进度写入
 */

import type { DbId } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"
import { getPostponeDays, normalizePriority } from "../incrementalReadingScheduler"
import { getBlockCached } from "./irBlockCache"
import {
  normalizeReadingBreakpoint,
  type IRReadingBreakpointSelection,
  type IRState
} from "./irPropertyCodec"
import {
  clampIntervalDays,
  computeBaseIntervalDays,
  computeDispersedSchedule,
  computeNewExtractQueueDelayDays,
  growIntervalDays,
  isNewCard
} from "./irSchedulingHelpers"
import { loadIRState, saveIRState } from "./irStatePersistence"

/**
 * 标记已读：更新 lastRead/readCount/due
 */
export async function markAsRead(blockId: DbId): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"
    const baseIntervalDays = growIntervalDays(cardType, prev.intervalDays)
    const schedule = computeDispersedSchedule(blockId, cardType, now, baseIntervalDays, { isNew: isNewCard(prev) })

    // 真实动作推进 ir.stage（不阻止用户操作）
    let nextStage = prev.stage
    if (cardType === "topic" && prev.stage === "topic.preview") {
      nextStage = "topic.work"
    }

    const nextState: IRState = {
      priority: prev.priority,
      lastRead: now,
      readCount: prev.readCount + 1,
      intervalDays: schedule.intervalDays,
      postponeCount: prev.postponeCount,
      stage: nextStage,
      lastAction: "next",
      due: schedule.due,
      position: prev.position,
      resumeBlockId: prev.resumeBlockId,
      readingBreakpoint: prev.readingBreakpoint ?? null,
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null
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
    const baseIntervalDays = clampIntervalDays(
      cardType,
      computeBaseIntervalDays(block, normalizedPriority)
    )
    const schedule = computeDispersedSchedule(blockId, cardType, now, baseIntervalDays, { isNew: isNewCard(prev) })
    const nextState: IRState = {
      priority: normalizedPriority,
      lastRead: now,
      readCount: prev.readCount + 1,
      intervalDays: schedule.intervalDays,
      postponeCount: prev.postponeCount,
      stage: prev.stage,
      lastAction: "priority",
      due: schedule.due,
      position: prev.position,
      resumeBlockId: prev.resumeBlockId,
      readingBreakpoint: prev.readingBreakpoint ?? null,
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null
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
 * 更新优先级并按比例修正已有间隔（不无条件清空间隔增长成果）
 *
 * 新卡（init/migrate）仍按基础间隔 + 分散抖动初始化，避免新 Extract 失去排队延迟。
 */
export async function updatePriority(blockId: DbId, newPriority: number): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const normalizedPriority = normalizePriority(newPriority)
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"

    const isFreshInit = isNewCard(prev) && (prev.lastAction === "init" || prev.lastAction === "migrate")
    if (isFreshInit) {
      const baseIntervalDays = clampIntervalDays(
        cardType,
        computeBaseIntervalDays(block, normalizedPriority)
      )
      const shouldApplyQueueDelay = Boolean(block && cardType === "extracts")
      const queueDelayDays = shouldApplyQueueDelay
        ? await computeNewExtractQueueDelayDays(blockId, block!, baseIntervalDays)
        : 0
      const schedule = computeDispersedSchedule(blockId, cardType, now, baseIntervalDays, {
        isNew: true,
        queueDelayDays
      })
      const nextState: IRState = {
        priority: normalizedPriority,
        lastRead: prev.lastRead,
        readCount: prev.readCount,
        intervalDays: schedule.intervalDays,
        postponeCount: prev.postponeCount,
        stage: prev.stage,
        lastAction: "priority",
        due: schedule.due,
        position: prev.position,
        resumeBlockId: prev.resumeBlockId,
        readingBreakpoint: prev.readingBreakpoint ?? null,
        autoPostponeBatchId: prev.autoPostponeBatchId ?? null
      }
      await saveIRState(blockId, nextState)
      return nextState
    }

    // 比例修正：保留已增长的间隔，factor 限制在 0.6..1.6
    const oldP = prev.priority
    const rawFactor = 1 + (oldP - normalizedPriority) / 200
    const factor = Math.min(1.6, Math.max(0.6, rawFactor))
    const nextIntervalDays = clampIntervalDays(cardType, Math.max(1, prev.intervalDays * factor))
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
      resumeBlockId: prev.resumeBlockId,
      readingBreakpoint: prev.readingBreakpoint ?? null,
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null
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
 * 更新阅读断点：可同时写回 resumeBlockId / 预览上下文 / 文本选择
 */
export async function updateReadingBreakpoint(
  blockId: DbId,
  patch: {
    resumeBlockId?: DbId | null
    previewBlockId?: DbId | null
    selection?: IRReadingBreakpointSelection | null
  }
): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const nextResumeBlockId = patch.resumeBlockId !== undefined ? patch.resumeBlockId : prev.resumeBlockId
    const baseBreakpoint = prev.readingBreakpoint ?? {
      previewBlockId: null,
      selection: null,
      updatedAt: null
    }
    const nextBreakpoint = normalizeReadingBreakpoint({
      previewBlockId: patch.previewBlockId !== undefined ? patch.previewBlockId : baseBreakpoint.previewBlockId,
      selection: patch.selection !== undefined ? patch.selection : baseBreakpoint.selection,
      updatedAt: new Date()
    })

    const nextState: IRState = {
      ...prev,
      resumeBlockId: nextResumeBlockId ?? null,
      readingBreakpoint: nextBreakpoint,
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null
    }

    await saveIRState(blockId, nextState)
    return nextState
  } catch (error) {
    console.error("[IR] 更新阅读断点失败:", error)
    orca.notify("error", "更新阅读断点失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 推后（Postpone）：写回 due/intervalDays/postponeCount/lastAction
 *
 * @param days 可选指定天数；未提供时按优先级自动决定
 */
export async function postpone(
  blockId: DbId,
  days?: number
): Promise<{ state: IRState; days: number }> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"

    const irCardType = cardType === "extracts" ? "extracts" : "topic"
    const resolvedDays = typeof days === "number" && Number.isFinite(days) && days > 0
      ? days
      : getPostponeDays(irCardType, prev.priority)
    const nextIntervalDays = clampIntervalDays(cardType, resolvedDays)

    const nextState: IRState = {
      ...prev,
      intervalDays: nextIntervalDays,
      postponeCount: prev.postponeCount + 1,
      lastAction: "postpone",
      due: computeDueFromIntervalDays(now, nextIntervalDays),
      // 用户手动推后不属于自动批次
      autoPostponeBatchId: null
    }

    await saveIRState(blockId, nextState)
    return { state: nextState, days: nextIntervalDays }
  } catch (error) {
    console.error("[IR] 推后失败:", error)
    orca.notify("error", "推后失败", { title: "渐进阅读" })
    throw error
  }
}

/** 推后三档 → 固定天数（会话菜单） */
export function postponeDaysForChoice(choice: "soon" | "week" | "later"): number {
  if (choice === "soon") return 1.5
  if (choice === "week") return 4
  return 10
}

/**
 * 提前到“今天”：仅修改 ir.due，不改变其它 IR 状态
 *
 * - 以本地日 00:00 作为“今天”边界，确保会话面板能识别为“今天到期”
 */
export async function advanceDueToToday(
  blockId: DbId,
  options: { now?: Date } = {}
): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = options.now ?? new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nextState: IRState = {
      ...prev,
      due: todayStart
    }
    await saveIRState(blockId, nextState)
    return nextState
  } catch (error) {
    console.error("[IR] advanceDueToToday failed:", error)
    orca.notify("error", "提前学失败（写入排期失败）", { title: "渐进阅读" })
    throw error
  }
}
