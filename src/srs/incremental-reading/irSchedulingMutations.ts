/**
 * 渐进阅读调度变更：已读、优先级、推后、到期提前、断点/进度写入
 */

import type { DbId } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"
import { getPostponeDays, normalizePriority } from "../incrementalReadingScheduler"
import {
  BLOCK_PREFETCH_CONCURRENCY,
  runBoundedConcurrency
} from "../storage"
import { getBlockCached } from "./irBlockCache"
import {
  normalizeReadingBreakpoint,
  type IRReadingBreakpointSelection,
  type IRState
} from "./irPropertyCodec"
import {
  adjustIntervalForPriorityChange,
  clampIntervalDays,
  clampSacIntervalDays,
  computeBaseIntervalDays,
  computeDispersedSchedule,
  computeNewExtractQueueDelayDays,
  computeReadingProgressKey,
  computeSacIntervalDays,
  getMaxIntervalDays,
  growIntervalDays,
  isNewCard,
  isSequentialActiveChapter,
  nextSacStagnation
} from "./irSchedulingHelpers"
import { loadIRState, saveIRState } from "./irStatePersistence"

/**
 * 标记已读：更新 lastRead/readCount/due
 *
 * - 普通 Topic/Extract/distributed：interval *= growth factor
 * - 顺序 Book IR 当前 active 章：Sequential Active Cadence（短节奏，无 1.25 增长）
 * - 不在「打开卡片」时改写 due；仅本动作与 postpone/priority 等显式写路径改排期
 */
export type MarkAsReadOptions = {
  /**
   * 本张卡在会话中的停留毫秒。顺序激活章 SAC 用其避免「认真读了但断点未变」被误判停滞。
   */
  dwellMs?: number | null
}

export async function markAsRead(
  blockId: DbId,
  options?: MarkAsReadOptions
): Promise<IRState> {
  try {
    const prev = await loadIRState(blockId)
    const now = new Date()
    const block = await getBlockCached(blockId)
    const cardType = block ? extractCardType(block) : "topic"
    const useSac = await isSequentialActiveChapter(blockId, block)

    let schedule: { intervalDays: number; due: Date }
    let sacProgressKey = prev.sacProgressKey ?? null
    let sacStagnantCount = prev.sacStagnantCount ?? 0

    if (useSac) {
      const currentKey = computeReadingProgressKey(prev)
      const stagnation = nextSacStagnation(
        prev.sacProgressKey,
        currentKey,
        prev.sacStagnantCount,
        { dwellMs: options?.dwellMs }
      )
      sacProgressKey = stagnation.progressKey
      sacStagnantCount = stagnation.stagnantCount
      const sacBase = computeSacIntervalDays(prev.priority, sacStagnantCount)
      // SAC 短节奏需可预期：非新卡不做 Topic 式 ± 分散（否则 6 天上限会被抖到 ~4.8）。
      // 新卡仅做小幅向前分散，避免同日多章扎堆。
      if (isNewCard(prev)) {
        const dispersed = computeDispersedSchedule(blockId, cardType, now, sacBase, {
          isNew: true
        })
        const intervalDays = clampSacIntervalDays(dispersed.intervalDays)
        schedule = {
          intervalDays,
          due: computeDueFromIntervalDays(now, intervalDays)
        }
      } else {
        const intervalDays = clampSacIntervalDays(sacBase)
        schedule = {
          intervalDays,
          due: computeDueFromIntervalDays(now, intervalDays)
        }
      }
    } else {
      const baseIntervalDays = growIntervalDays(cardType, prev.intervalDays)
      schedule = computeDispersedSchedule(blockId, cardType, now, baseIntervalDays, {
        isNew: isNewCard(prev)
      })
    }

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
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null,
      sacProgressKey,
      sacStagnantCount
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
    const useSac = await isSequentialActiveChapter(blockId, block)

    let schedule: { intervalDays: number; due: Date }
    if (useSac) {
      const sacBase = computeSacIntervalDays(normalizedPriority, prev.sacStagnantCount ?? 0)
      if (isNewCard(prev)) {
        const dispersed = computeDispersedSchedule(blockId, cardType, now, sacBase, {
          isNew: true
        })
        const intervalDays = clampSacIntervalDays(dispersed.intervalDays)
        schedule = {
          intervalDays,
          due: computeDueFromIntervalDays(now, intervalDays)
        }
      } else {
        const intervalDays = clampSacIntervalDays(sacBase)
        schedule = {
          intervalDays,
          due: computeDueFromIntervalDays(now, intervalDays)
        }
      }
    } else {
      const baseIntervalDays = clampIntervalDays(
        cardType,
        computeBaseIntervalDays(block, normalizedPriority)
      )
      schedule = computeDispersedSchedule(blockId, cardType, now, baseIntervalDays, {
        isNew: isNewCard(prev)
      })
    }

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
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null,
      sacProgressKey: prev.sacProgressKey ?? null,
      sacStagnantCount: prev.sacStagnantCount ?? 0
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

    const useSac = await isSequentialActiveChapter(blockId, block)
    const isFreshInit = isNewCard(prev) && (prev.lastAction === "init" || prev.lastAction === "migrate")
    if (isFreshInit) {
      const baseIntervalDays = useSac
        ? computeSacIntervalDays(normalizedPriority, prev.sacStagnantCount ?? 0)
        : clampIntervalDays(cardType, computeBaseIntervalDays(block, normalizedPriority))
      const shouldApplyQueueDelay = Boolean(block && cardType === "extracts" && !useSac)
      const queueDelayDays = shouldApplyQueueDelay
        ? await computeNewExtractQueueDelayDays(blockId, block!, baseIntervalDays)
        : 0
      const schedule = computeDispersedSchedule(blockId, cardType, now, baseIntervalDays, {
        isNew: true,
        queueDelayDays
      })
      const intervalDays = useSac
        ? clampSacIntervalDays(schedule.intervalDays)
        : schedule.intervalDays
      const nextState: IRState = {
        priority: normalizedPriority,
        lastRead: prev.lastRead,
        readCount: prev.readCount,
        intervalDays,
        postponeCount: prev.postponeCount,
        stage: prev.stage,
        lastAction: "priority",
        due: useSac ? computeDueFromIntervalDays(now, intervalDays) : schedule.due,
        position: prev.position,
        resumeBlockId: prev.resumeBlockId,
        readingBreakpoint: prev.readingBreakpoint ?? null,
        autoPostponeBatchId: prev.autoPostponeBatchId ?? null,
        sacProgressKey: prev.sacProgressKey ?? null,
        sacStagnantCount: prev.sacStagnantCount ?? 0
      }
      await saveIRState(blockId, nextState)
      return nextState
    }

    // SAC 激活章：显式改优先级时按新 priority 重算短节奏（保留停滞计数，不静默覆盖 postpone due——本路径会写 due 属用户意图）
    if (useSac) {
      const nextIntervalDays = computeSacIntervalDays(
        normalizedPriority,
        prev.sacStagnantCount ?? 0
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
        resumeBlockId: prev.resumeBlockId,
        readingBreakpoint: prev.readingBreakpoint ?? null,
        autoPostponeBatchId: prev.autoPostponeBatchId ?? null,
        sacProgressKey: prev.sacProgressKey ?? null,
        sacStagnantCount: prev.sacStagnantCount ?? 0
      }
      await saveIRState(blockId, nextState)
      return nextState
    }

    // 比例修正：保留已增长的间隔；统一 helper + cardType clamp
    const nextIntervalDays = adjustIntervalForPriorityChange(
      cardType,
      prev.intervalDays,
      prev.priority,
      normalizedPriority
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
      resumeBlockId: prev.resumeBlockId,
      readingBreakpoint: prev.readingBreakpoint ?? null,
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null,
      sacProgressKey: prev.sacProgressKey ?? null,
      sacStagnantCount: prev.sacStagnantCount ?? 0
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
 * 批量更新优先级（有界并发，禁止无界 Promise.all）
 */
export async function bulkUpdatePriority(
  blockIds: DbId[],
  newPriority: number
): Promise<{ success: DbId[]; failed: Array<{ id: DbId; error: string }> }> {
  if (blockIds.length === 0) {
    return { success: [], failed: [] }
  }

  const success: DbId[] = []
  const failed: Array<{ id: DbId; error: string }> = []

  await runBoundedConcurrency(
    blockIds,
    BLOCK_PREFETCH_CONCURRENCY,
    async (blockId) => {
      try {
        await updatePriority(blockId, newPriority)
        success.push(blockId)
      } catch (reason) {
        failed.push({
          id: blockId,
          error: reason instanceof Error ? reason.message : String(reason ?? "未知错误")
        })
      }
    }
  )

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
      resumeBlockId,
      sacProgressKey: prev.sacProgressKey ?? null,
      sacStagnantCount: prev.sacStagnantCount ?? 0
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
      autoPostponeBatchId: prev.autoPostponeBatchId ?? null,
      sacProgressKey: prev.sacProgressKey ?? null,
      sacStagnantCount: prev.sacStagnantCount ?? 0
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
 * 推后（Postpone）：只移动 due，保留 intentional `intervalDays`。
 * 允许更新：postponeCount / lastAction / 清空 autoPostponeBatchId。
 * 不增加 readCount，不改 AF，不借推后重置长期间隔。
 *
 * @param days 可选指定天数；未提供时按优先级自动决定 delay（仅用于 due）
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
    const rawDays = typeof days === "number" && Number.isFinite(days) && days > 0
      ? days
      : getPostponeDays(irCardType, prev.priority)
    // delay 只用于 due；仍做合理上下界，但不写回 intervalDays
    const resolvedDays = Math.min(
      getMaxIntervalDays(cardType),
      Math.max(0.1, rawDays)
    )

    const nextState: IRState = {
      ...prev,
      // 保留 intentional interval（不因 postpone 改写）
      intervalDays: prev.intervalDays,
      postponeCount: prev.postponeCount + 1,
      lastAction: "postpone",
      due: computeDueFromIntervalDays(now, resolvedDays),
      // 用户手动推后不属于自动批次
      autoPostponeBatchId: null,
      // 保留 SAC 进度指纹；不在打开时用 SAC 覆盖本 due（仅本动作写排期）
      sacProgressKey: prev.sacProgressKey ?? null,
      sacStagnantCount: prev.sacStagnantCount ?? 0
    }

    await saveIRState(blockId, nextState)
    return { state: nextState, days: resolvedDays }
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
