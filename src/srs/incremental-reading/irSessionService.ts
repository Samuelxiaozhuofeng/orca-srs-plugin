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
import {
  computeSacIntervalDays,
  isSequentialActiveChapter
} from "./irSchedulingHelpers"
import { parseOptionalNumber } from "./irPropertyCodec"
import type { NextChapterSchedule } from "../../importers/epub/types"

export type SessionActionOutcome = {
  state: IRState | null
  leftCard: boolean
}

export type ArchiveOptions = {
  /**
   * 顺序解锁完成本章后下一章 due 安排。普通 IR 归档忽略此字段。
   * 必须由调用方显式传入；服务内不使用隐式全局状态。
   */
  nextChapterSchedule?: NextChapterSchedule
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
  pluginName = "orca-srs",
  options?: ArchiveOptions
): Promise<SessionActionOutcome> {
  // 顺序书籍：完成本章并解锁下一章（与「跳过」区分 outcome）
  const sequential = await tryAdvanceSequentialBook(blockId, "completed", pluginName, {
    nextChapterSchedule: options?.nextChapterSchedule
  })
  if (sequential === "advanced" || sequential === "partial") {
    return { state: null, leftCard: true }
  }
  // not_applicable → 普通归档
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
  return { state: null, leftCard: true }
}

type SequentialAdvanceAttempt = "advanced" | "partial" | "not_applicable"

type SequentialAdvanceOptions = {
  nextChapterSchedule?: NextChapterSchedule
}

/**
 * Attempt sequential book progression.
 * - not_applicable: no sequential plan for this card → caller may use plain complete
 * - advanced/partial: progression service ran (including partial next-init failure)
 * Throws on hard failure after progression started — do NOT plain-complete (plan may be mutated).
 */
async function tryAdvanceSequentialBook(
  blockId: DbId,
  outcome: "completed" | "skipped",
  pluginName: string,
  options?: SequentialAdvanceOptions
): Promise<SequentialAdvanceAttempt> {
  const block =
    (orca.state.blocks?.[blockId] as { properties?: Array<{ name: string; value: unknown }> } | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as
      | { properties?: Array<{ name: string; value: unknown }> }
      | undefined)
  // Coerce like isSequentialActiveChapter / collectors — Orca may surface PropType.Number as string.
  // Strict typeof === "number" would fall through to plain completeIRCard and strip the only live
  // sequential chapter without unlocking the next → whole book leaves the IR queue.
  const bookId = parseOptionalNumber(
    block?.properties?.find((p) => p.name === "ir.sourceBookId")?.value
  )
  if (bookId === null) return "not_applicable"

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

  // Errors propagate — no silent failed return / plain-complete fallback.
  // Next-init failure throws before plan/current mutation (activate-before-strip).
  const { advanceSequentialBook } = await import("../book-ir/bookIRProgression")
  const result = await advanceSequentialBook({
    bookBlockId: bookId,
    chapterId: blockId,
    outcome,
    pluginName,
    nextChapterSchedule: options?.nextChapterSchedule
  })
  if (result.message) {
    orca.notify(
      result.kind === "partial" ? "warn" : "success",
      result.message,
      { title: "渐进阅读" }
    )
  }
  // Partial after progression started must not look like total success to callers that
  // only check leftCard; still return partial so UI can leave the session card path
  // while the warn notify exposes the incomplete strip / plan lag.
  return result.kind === "partial" ? "partial" : "advanced"
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
  const useSac = await isSequentialActiveChapter(blockId)
  // SAC：显式改优先级按短节奏重算；普通 Topic 仍比例修正
  const nextInterval = useSac
    ? computeSacIntervalDays(normalized, prev.sacStagnantCount ?? 0)
    : adjustIntervalForPriorityChange(prev.intervalDays, prev.priority, normalized)
  const now = new Date()
  const nextState: IRState = {
    ...prev,
    priority: normalized,
    intervalDays: nextInterval,
    due: computeDueFromIntervalDays(now, nextInterval),
    lastAction: "priority",
    sacProgressKey: prev.sacProgressKey ?? null,
    sacStagnantCount: prev.sacStagnantCount ?? 0
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
