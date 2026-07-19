/**
 * 会话动作服务：下一篇、推后、归档，并推进 stage
 */

import type { Block, DbId } from "../../orca.d.ts"
import {
  loadIRState,
  markAsRead,
  postpone,
  saveIRState,
  updatePriority,
  type IRState
} from "../incrementalReadingStorage"
import { completeIRCard } from "../irSessionActions"
import { advanceIRStage, type StageTriggerAction } from "./irStageTransitions"
import { parseOptionalNumber } from "./irPropertyCodec"
import type { NextChapterSchedule } from "../../importers/epub/types"

export type SessionActionOutcome = {
  state: IRState | null
  /**
   * Whether the session should leave/remove the current card from the queue UI.
   * For sequential partial results, false when the current chapter was not stripped
   * (plan-save fail / strip fail) so the user can retry without losing the card.
   */
  leftCard: boolean
  /** Present when sequential advance ran (including partial). */
  sequential?: {
    kind: "advanced" | "partial"
    currentChapterRemoved: boolean
    planPersisted: boolean
    message?: string
  }
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
  if (sequential.status === "advanced" || sequential.status === "partial") {
    // Keep session card when current chapter was not stripped (retryable partial).
    const leftCard = sequential.currentChapterRemoved
    return {
      state: null,
      leftCard,
      sequential: {
        kind: sequential.status,
        currentChapterRemoved: sequential.currentChapterRemoved,
        planPersisted: sequential.planPersisted,
        message: sequential.message
      }
    }
  }
  // not_applicable only: no book / non-sequential plan → ordinary archive.
  // not_active throws inside tryAdvanceSequentialBook (never plain-complete).
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
  if (sequential.status === "not_applicable") {
    throw new Error("当前卡片不是顺序解锁书籍的激活章节")
  }
  const leftCard = sequential.currentChapterRemoved
  return {
    state: null,
    leftCard,
    sequential: {
      kind: sequential.status,
      currentChapterRemoved: sequential.currentChapterRemoved,
      planPersisted: sequential.planPersisted,
      message: sequential.message
    }
  }
}

type SequentialAdvanceAttempt =
  | { status: "not_applicable" }
  | {
      status: "advanced" | "partial"
      currentChapterRemoved: boolean
      planPersisted: boolean
      message?: string
    }

type SequentialAdvanceOptions = {
  nextChapterSchedule?: NextChapterSchedule
}

/**
 * Attempt sequential book progression.
 * - not_applicable: no sourceBookId / no plan / non-sequential → caller may plain-complete
 * - sequential plan but block is not activeChapterId → throws visible not_active (never plain-complete)
 * - advanced/partial: progression service ran (including partial next-init failure)
 * Throws on hard failure after progression started — do NOT plain-complete (plan may be mutated).
 */
async function tryAdvanceSequentialBook(
  blockId: DbId,
  outcome: "completed" | "skipped",
  pluginName: string,
  options?: SequentialAdvanceOptions
): Promise<SequentialAdvanceAttempt> {
  // Archive decisions must use backend truth. A stale state snapshot can omit
  // ir.sourceBookId after a prior property write and incorrectly fall through to
  // ordinary completeIRCard, which strips the only live sequential chapter.
  const block = await loadBackendBlockForArchive(blockId)
  const bookId = readSourceBookIdForArchive(block, blockId)
  if (bookId === null) return { status: "not_applicable" }

  const { loadBookIRPlan } = await import("../book-ir/bookIRPlanRepository")
  let plan
  try {
    plan = await loadBookIRPlan(bookId)
  } catch (error) {
    // Malformed plan must surface — not silent plain-complete
    console.error("[IR Session] ir.bookPlan invalid:", error)
    throw error
  }
  if (!plan || plan.mode !== "sequential") return { status: "not_applicable" }
  if (plan.activeChapterId !== blockId) {
    // Sequential plan exists but this chapter is not the active one (stale dual-live,
    // paused after strip-fail lag, or user opened a non-active outline chapter).
    // Never plain-complete: that would strip an obsolete IR card without reconciling plan.
    const activeLabel =
      plan.activeChapterId == null ? "null（可重试激活）" : `#${plan.activeChapterId}`
    throw new Error(
      `章节 #${blockId} 不是顺序书 #${bookId} 的当前激活章（active=${activeLabel}）。` +
        `请使用「重试激活」修复计划，或仅对激活章完成本章/跳过；禁止普通归档非激活顺序章。`
    )
  }

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
  // leftCard must follow strip success, not merely kind===partial.
  // - plan-save fail / strip fail: current still live → keep session card
  // - next #card verify fail after strip: current gone → leave card
  const currentChapterRemoved = result.currentChapterRemoved === true
  const planPersisted = result.planPersisted !== false
  return {
    status: result.kind === "partial" ? "partial" : "advanced",
    currentChapterRemoved,
    planPersisted,
    message: result.message
  }
}

async function loadBackendBlockForArchive(blockId: DbId): Promise<Block> {
  try {
    const block = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
    if (block) return block
    throw new Error(`章节块不存在或后端未返回数据`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[IR Session] 读取章节 #${blockId} 后端状态失败:`, error)
    throw new Error(`读取章节 #${blockId} 后端状态失败: ${message}`)
  }
}

function readSourceBookIdForArchive(block: Block, blockId: DbId): number | null {
  const property = block.properties?.find((item) => item.name === "ir.sourceBookId")
  if (!property || property.value == null || property.value === "") return null

  const raw = property.value
  const scalar = Array.isArray(raw)
    ? raw.length === 1
      ? raw[0]
      : undefined
    : raw

  if (scalar === undefined) {
    throw new Error(
      `章节 #${blockId} 的 ir.sourceBookId 属性形状不明确，无法安全归档`
    )
  }
  if (scalar == null || scalar === "") return null

  const parsed = parseOptionalNumber(scalar)
  if (parsed === null) {
    throw new Error(
      `章节 #${blockId} 的 ir.sourceBookId 无效（${String(scalar)}），无法安全归档`
    )
  }
  return parsed
}

/**
 * 调整重要性：委托 `updatePriority` 单一生产实现（含 cardType clamp / SAC / 新卡路径）。
 * 会话 UI 与公开 `updatePriority` 不得再保留两套公式。
 */
export async function performPriorityAdjust(
  blockId: DbId,
  newPriority: number
): Promise<IRState> {
  return updatePriority(blockId, newPriority)
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
