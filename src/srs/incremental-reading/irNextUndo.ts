/**
 * 会话内「撤销上一篇」（单步）纯逻辑
 *
 * 语义：只回撤**最近一次**「下一篇」，覆盖三件事——
 * 1. 队列：把被移出的阅读条目按原下标回插并切回；
 * 2. 阅读位置：用点「下一篇」之前的 IR 快照修正 card（断点 / resume 由此驱动恢复）；
 * 3. 排期：快照整体写回由 `undoPerformNext` 负责（本模块只做纯数据变换）。
 *
 * 边界：不做无限历史；任何后续会写库的会话动作都应清空记录（调用方负责）。
 */

import type { DbId } from "../../orca.d.ts"
import type { IRCard } from "../incrementalReadingCollector"
import type { IRSessionEntry } from "./irMixedQueuePolicy"
import type { IRState } from "./irTypes"

export type IRNextUndoRecord = {
  cardId: DbId
  /** 被移出的阅读条目（保留原 key，回插后仍是同一条目） */
  entry: IRSessionEntry
  /** 移出前所在的队列下标 */
  index: number
  /** 点「下一篇」之前的完整 IR 状态；撤销时整体写回 */
  snapshot: IRState
  createdAt: number
}

export function createNextUndoRecord(params: {
  entry: IRSessionEntry
  index: number
  snapshot: IRState
  now?: number
}): IRNextUndoRecord | null {
  const { entry, index, snapshot } = params
  // 只支持阅读条目；复习条目自有评分路径，不走本撤销
  if (entry.kind !== "reading") return null
  return {
    cardId: entry.card.id,
    entry,
    index: Math.max(0, Math.floor(index)),
    snapshot,
    createdAt: params.now ?? Date.now()
  }
}

/**
 * 用 IR 快照修正队列卡片：撤销后必须按**离开时**的断点/排期渲染与恢复，
 * 而不是会话装配时的旧快照（否则只回 UI、位置仍回到开头）。
 */
export function applyIRStateToCard(card: IRCard, state: IRState): IRCard {
  return {
    ...card,
    priority: state.priority,
    position: state.position,
    due: state.due,
    intervalDays: state.intervalDays,
    postponeCount: state.postponeCount,
    stage: state.stage,
    lastAction: state.lastAction,
    lastRead: state.lastRead,
    readCount: state.readCount,
    // 与收集器一致：未读过即为新卡
    isNew: !state.lastRead,
    resumeBlockId: state.resumeBlockId,
    readingBreakpoint: state.readingBreakpoint ?? null
  }
}

export type ReinsertUndoResult = {
  queue: IRSessionEntry[]
  /** 撤销后应切换到的 currentIndex */
  index: number
  /** 队列中已存在同一条目时为 false（不重复插入） */
  inserted: boolean
}

/**
 * 把撤销条目按原下标回插；下标越界时钳到队尾。
 * 队列中已存在同 key 条目（异常重入）时不重复插入，只切回该条目。
 */
export function reinsertUndoEntry(
  queue: IRSessionEntry[],
  entry: IRSessionEntry,
  index: number
): ReinsertUndoResult {
  const existing = queue.findIndex(item => item.key === entry.key)
  if (existing >= 0) {
    return { queue, index: existing, inserted: false }
  }
  const target = Math.min(Math.max(0, Math.floor(index)), queue.length)
  const next = [...queue.slice(0, target), entry, ...queue.slice(target)]
  return { queue: next, index: target, inserted: true }
}

/** 撤销入口是否可用：有记录、会话仍在阅读、且当前无进行中的写入 */
export function canUndoNext(params: {
  record: IRNextUndoRecord | null
  showSummary: boolean
  queueLength: number
  isWorking: boolean
}): boolean {
  const { record, showSummary, queueLength, isWorking } = params
  if (!record) return false
  if (showSummary) return false
  if (queueLength <= 0) return false
  if (isWorking) return false
  return true
}
