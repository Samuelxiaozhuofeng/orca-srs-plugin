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
  await completeIRCard(blockId, pluginName)
  return { state: null, leftCard: true }
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
