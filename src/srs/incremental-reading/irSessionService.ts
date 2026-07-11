/**
 * 会话动作服务：下一篇、推后、归档，并推进 stage
 */

import type { DbId } from "../../orca.d.ts"
import {
  loadIRState,
  markAsRead,
  postpone,
  saveIRState,
  type IRState
} from "../incrementalReadingStorage"
import { completeIRCard } from "../irSessionActions"
import { advanceIRStage, type StageTriggerAction } from "./irStageTransitions"
import { adjustIntervalForPriorityChange } from "./irQueuePolicy"
import { normalizePriority } from "../incrementalReadingScheduler"
import { computeDueFromIntervalDays } from "../incrementalReadingDispersal"

export type SessionActionOutcome = {
  state: IRState | null
  leftCard: boolean
}

export async function performNext(blockId: DbId): Promise<SessionActionOutcome> {
  const prev = await loadIRState(blockId)
  const transition = advanceIRStage(prev.stage, "next")
  const nextState = await markAsRead(blockId)
  if (transition.nextStage && transition.nextStage !== nextState.stage) {
    const withStage: IRState = {
      ...nextState,
      stage: transition.nextStage,
      lastAction: transition.lastAction as any
    }
    await saveIRState(blockId, withStage)
    return { state: withStage, leftCard: true }
  }
  return { state: nextState, leftCard: true }
}

export async function performPostpone(
  blockId: DbId,
  days?: number
): Promise<SessionActionOutcome & { days: number }> {
  const result = await postpone(blockId, days)
  return { state: result.state, leftCard: true, days: result.days }
}

export async function performArchive(
  blockId: DbId,
  pluginName = "orca-srs"
): Promise<SessionActionOutcome> {
  // 顺序书籍：完成本章并解锁下一章（与「跳过」区分 outcome）
  const sequential = await tryAdvanceSequentialBook(blockId, "completed", pluginName)
  if (sequential === "advanced" || sequential === "partial") {
    return { state: null, leftCard: true }
  }
  if (sequential === "failed") {
    // Do NOT fall through to plain completeIRCard — plan may already be mutated.
    throw new Error("顺序推进失败，计划状态请检查后重试（不会再次按普通完成清理）")
  }
  await completeIRCard(blockId, pluginName)
  return { state: null, leftCard: true }
}

/**
 * 跳过本章并继续（仅顺序 Book IR）。
 */
export async function performSkipChapter(
  blockId: DbId,
  pluginName = "orca-srs"
): Promise<SessionActionOutcome> {
  const sequential = await tryAdvanceSequentialBook(blockId, "skipped", pluginName)
  if (sequential === "not_applicable") {
    throw new Error("当前卡片不是顺序解锁书籍的激活章节")
  }
  if (sequential === "failed") {
    throw new Error("跳过并推进失败，请检查书籍计划后重试")
  }
  return { state: null, leftCard: true }
}

type SequentialAdvanceAttempt = "advanced" | "partial" | "not_applicable" | "failed"

/**
 * Attempt sequential book progression.
 * - not_applicable: no sequential plan for this card → caller may use plain complete
 * - advanced/partial: progression service ran (including partial next-init failure)
 * - failed: progression threw after starting → do NOT plain-complete
 */
async function tryAdvanceSequentialBook(
  blockId: DbId,
  outcome: "completed" | "skipped",
  pluginName: string
): Promise<SequentialAdvanceAttempt> {
  const block =
    (orca.state.blocks?.[blockId] as { properties?: Array<{ name: string; value: unknown }> } | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as
      | { properties?: Array<{ name: string; value: unknown }> }
      | undefined)
  const bookId = block?.properties?.find((p) => p.name === "ir.sourceBookId")?.value
  if (typeof bookId !== "number") return "not_applicable"

  const { loadBookIRPlan } = await import("../book-ir/bookIRPlanRepository")
  let plan
  try {
    plan = await loadBookIRPlan(bookId)
  } catch (error) {
    // Malformed plan must surface — not silent plain-complete
    console.error("[IR Session] ir.bookPlan invalid:", error)
    throw error
  }
  if (!plan || plan.mode !== "sequential") return "not_applicable"
  if (plan.activeChapterId !== blockId) return "not_applicable"

  try {
    const { advanceSequentialBook } = await import("../book-ir/bookIRProgression")
    const result = await advanceSequentialBook({
      bookBlockId: bookId,
      chapterId: blockId,
      outcome,
      pluginName
    })
    if (result.message) {
      orca.notify(
        result.kind === "partial" ? "warn" : "success",
        result.message,
        { title: "渐进阅读" }
      )
    }
    return result.kind === "partial" ? "partial" : "advanced"
  } catch (error) {
    console.error("[IR Session] sequential advance failed:", error)
    orca.notify(
      "error",
      error instanceof Error ? error.message : String(error),
      { title: "渐进阅读" }
    )
    return "failed"
  }
}

/**
 * 调整重要性：比例修正间隔，不无条件清空已有间隔增长
 */
export async function performPriorityAdjust(
  blockId: DbId,
  newPriority: number
): Promise<IRState> {
  const prev = await loadIRState(blockId)
  const normalized = normalizePriority(newPriority)
  const nextInterval = adjustIntervalForPriorityChange(
    prev.intervalDays,
    prev.priority,
    normalized
  )
  const now = new Date()
  const nextState: IRState = {
    ...prev,
    priority: normalized,
    intervalDays: nextInterval,
    due: computeDueFromIntervalDays(now, nextInterval),
    lastAction: "priority"
  }
  await saveIRState(blockId, nextState)
  return nextState
}

export async function performStageAction(
  blockId: DbId,
  action: StageTriggerAction
): Promise<IRState | null> {
  if (action === "archive" || action === "complete" || action === "itemize") {
    const transition = advanceIRStage((await loadIRState(blockId)).stage, action)
    if (transition.clearIR) {
      await completeIRCard(blockId)
      return null
    }
  }
  const prev = await loadIRState(blockId)
  const transition = advanceIRStage(prev.stage, action)
  if (transition.clearIR) {
    await completeIRCard(blockId)
    return null
  }
  const next: IRState = {
    ...prev,
    stage: transition.nextStage ?? prev.stage,
    lastAction: transition.lastAction as any
  }
  await saveIRState(blockId, next)
  return next
}
