/**
 * Again/Hard 短期重新入队（F2-04）
 *
 * 纯逻辑模块：pending 幂等 upsert、generation/timer token、到期选择、
 * 队尾提交（仅对未处理尾部去重）。不依赖 React；Demo 用 ref 持有状态并
 * 调度唯一 timer。
 *
 * 规则摘要：
 * - 仅正式 Again/Hard，且 FSRS due 落在短期窗口（默认 5 分钟）内才追踪
 * - 同一 cardKey 幂等 upsert 到最新 card snapshot + due；generation 单调递增
 * - 定时器带 token；更新 due 后必须重排，旧 token 触发时判 stale
 * - 到期后追加到队尾；去重只检查 currentIndex+1 之后的未处理尾部
 * - 历史副本（currentIndex 及之前）不阻止重入
 * - 接纳成功（含「已在尾部」）后才从 pending 移除；scope/budget 拒绝或提交失败保留
 * - fixed/repeat 纯训练、List 辅助预览不得伪造正式 pending
 * - 本模块不持久化（F2-09）
 * - pending 生命周期（与 Demo 一致）：**到达队尾 / 完成 UI 出现时不清 pending**
 *   （最后一张 Again/Hard 仍可到期重入）；仅用户明确完成按钮、关闭、
 *   组件卸载、再复习新一轮时 `deactivateAndClearPending`
 */

import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  selectPendingDueCardsForRequeue,
  type ReviewSessionScope
} from "./reviewSessionScope"
import type { SessionRootCardBudget } from "./reviewSessionBudget"

/** 正式 Again/Hard 短期重学窗口（ms） */
export const SHORT_RELEARN_WINDOW_MS = 5 * 60 * 1000

/** 定时器最小延迟，避免 0ms 忙等 */
export const PENDING_TIMER_MIN_DELAY_MS = 1000

/** 到期后再多等一点再检查，避免边界抖动 */
export const PENDING_TIMER_POST_DUE_BUFFER_MS = 500

/** 单张 pending 记录 */
export type PendingDueEntry = {
  readonly cardKey: string
  /** 最新卡片快照（含更新后的 srs） */
  readonly card: ReviewCard
  /** 绝对到期时刻（ms） */
  readonly dueTime: number
  /** 该 key 的单调 generation；upsert 时递增 */
  readonly generation: number
}

/**
 * Pending 内存状态（会话内；F2-09 前不落盘）。
 * entries 用可变 Map 以支持高效 upsert，但对外 API 尽量返回新引用语义。
 */
export type PendingDueState = {
  readonly entries: Map<string, PendingDueEntry>
  /**
   * 当前已调度 wake 的 token。每次 planNextPendingWake 递增。
   * timer callback 必须携带调度时的 token 并与此比对。
   */
  scheduledToken: number
  /** 全局 generation 分配器（跨 key 单调，便于诊断） */
  nextGeneration: number
  /**
   * 会话是否仍接受 pending 入队。
   * false：完成 / 关闭 / 卸载 / 新轮次清理后；任何 wake 不得 setState。
   */
  active: boolean
}

export type UpsertPendingStatus =
  | "tracked"
  | "out_of_window"
  | "inactive"
  | "invalid_due"

export type UpsertPendingResult = {
  readonly state: PendingDueState
  readonly status: UpsertPendingStatus
  readonly cardKey: string | null
  readonly entry: PendingDueEntry | null
  /** 是否因 due 变早/变晚需要重排 timer */
  readonly needsReschedule: boolean
}

export type PendingWakePlan = {
  readonly token: number
  readonly delayMs: number
  readonly fireAtMs: number
  readonly nearestDue: number
}

export type PlanWakeResult = {
  readonly state: PendingDueState
  readonly plan: PendingWakePlan | null
}

export type CommitQueueResult = {
  readonly queue: ReviewCard[]
  readonly appended: ReviewCard[]
  /** 未处理尾部已有同 key，未重复追加 */
  readonly skippedInTail: readonly string[]
  readonly appendedKeys: readonly string[]
}

export type ProcessPendingWakeResult = {
  readonly state: PendingDueState
  readonly queue: ReviewCard[]
  /** 旧 token / 会话已停用时为 false */
  readonly applied: boolean
  readonly stale: boolean
  readonly inactive: boolean
  readonly appended: ReviewCard[]
  readonly skippedInTail: readonly string[]
  /**
   * 到期但未接纳（scope/budget）的 key：仍保留在 pending，可重试。
   * 不得静默删除。
   */
  readonly retainedRejected: readonly string[]
  /** 明确诊断信息（scope/budget 拒绝等） */
  readonly diagnostics: readonly string[]
  /** 若仍有 pending，返回下一次最近 due（供调用方 plan wake） */
  readonly nextNearestDue: number | null
}

/**
 * 创建空 pending 状态（会话开始 / 新轮次 / 清理后）。
 */
export function createEmptyPendingDueState(
  active: boolean = true
): PendingDueState {
  return {
    entries: new Map(),
    scheduledToken: 0,
    nextGeneration: 0,
    active
  }
}

/**
 * 是否应追踪正式短期重学（纯条件，不含 scope）。
 * repeat / auxiliary 一律 false；仅 again/hard 且在窗口内。
 */
export function shouldTrackFormalShortRelearn(params: {
  grade: string
  dueTimeMs: number
  nowMs: number
  isRepeatMode?: boolean
  isAuxiliaryPreview?: boolean
  windowMs?: number
}): boolean {
  if (params.isRepeatMode) return false
  if (params.isAuxiliaryPreview) return false
  if (params.grade !== "again" && params.grade !== "hard") return false
  if (!Number.isFinite(params.dueTimeMs)) return false
  const windowMs = params.windowMs ?? SHORT_RELEARN_WINDOW_MS
  return params.dueTimeMs - params.nowMs <= windowMs
}

/**
 * 幂等 upsert：同一 cardKey 覆盖为最新 snapshot + due，generation++。
 * 超出窗口 / 无效 due / 会话 inactive → 不写入。
 */
export function upsertPendingDueCard(
  state: PendingDueState,
  card: ReviewCard,
  dueTimeMs: number,
  nowMs: number,
  windowMs: number = SHORT_RELEARN_WINDOW_MS
): UpsertPendingResult {
  if (!state.active) {
    return {
      state,
      status: "inactive",
      cardKey: null,
      entry: null,
      needsReschedule: false
    }
  }

  if (!Number.isFinite(dueTimeMs)) {
    return {
      state,
      status: "invalid_due",
      cardKey: null,
      entry: null,
      needsReschedule: false
    }
  }

  const cardKey = cardKeyFromReviewCard(card)
  if (dueTimeMs - nowMs > windowMs) {
    return {
      state,
      status: "out_of_window",
      cardKey,
      entry: null,
      needsReschedule: false
    }
  }

  const generation = state.nextGeneration + 1
  const entry: PendingDueEntry = {
    cardKey,
    card,
    dueTime: dueTimeMs,
    generation
  }

  const nextEntries = new Map(state.entries)
  nextEntries.set(cardKey, entry)

  const nextState: PendingDueState = {
    entries: nextEntries,
    scheduledToken: state.scheduledToken,
    nextGeneration: generation,
    active: state.active
  }

  return {
    state: nextState,
    status: "tracked",
    cardKey,
    entry,
    needsReschedule: true
  }
}

/**
 * 最近下一次到期时刻；无 pending 返回 null。
 */
export function getNearestPendingDueTime(
  state: PendingDueState
): number | null {
  if (state.entries.size === 0) return null
  let nearest = Infinity
  for (const { dueTime } of state.entries.values()) {
    if (dueTime < nearest) nearest = dueTime
  }
  return Number.isFinite(nearest) ? nearest : null
}

/**
 * 根据最近 due 计算 delay（至少 MIN，到期后 + BUFFER）。
 */
export function computePendingTimerDelay(
  nearestDueMs: number,
  nowMs: number,
  minDelayMs: number = PENDING_TIMER_MIN_DELAY_MS,
  postDueBufferMs: number = PENDING_TIMER_POST_DUE_BUFFER_MS
): number {
  return Math.max(minDelayMs, nearestDueMs - nowMs + postDueBufferMs)
}

/**
 * 规划下一次唯一有效 wake：递增 scheduledToken。
 * 无 pending 或 inactive → plan=null，token 仍递增以作废旧 timer。
 */
export function planNextPendingWake(
  state: PendingDueState,
  nowMs: number
): PlanWakeResult {
  const nextToken = state.scheduledToken + 1
  const nearest = state.active ? getNearestPendingDueTime(state) : null

  if (nearest == null) {
    return {
      state: {
        ...state,
        entries: state.entries,
        scheduledToken: nextToken,
        active: state.active
      },
      plan: null
    }
  }

  const delayMs = computePendingTimerDelay(nearest, nowMs)
  return {
    state: {
      ...state,
      entries: state.entries,
      scheduledToken: nextToken,
      active: state.active
    },
    plan: {
      token: nextToken,
      delayMs,
      fireAtMs: nowMs + delayMs,
      nearestDue: nearest
    }
  }
}

/**
 * timer callback 携带的 token 是否仍是当前 scheduledToken。
 */
export function isPendingWakeTokenCurrent(
  state: PendingDueState,
  token: number
): boolean {
  return state.active && state.scheduledToken === token
}

/**
 * 取出已到期条目（不修改 state）。
 * 排序：dueTime 升序，cardKey 字典序稳定 tie-break。
 */
export function selectDuePendingEntries(
  state: PendingDueState,
  nowMs: number
): PendingDueEntry[] {
  const due: PendingDueEntry[] = []
  for (const entry of state.entries.values()) {
    if (nowMs >= entry.dueTime) {
      due.push(entry)
    }
  }
  return sortPendingEntriesForRequeue(due)
}

/**
 * 多卡同到期时间：dueTime 升序，再用 cardKey 稳定 tie-break。
 */
export function sortPendingEntriesForRequeue(
  entries: readonly PendingDueEntry[]
): PendingDueEntry[] {
  return [...entries].sort((a, b) => {
    if (a.dueTime !== b.dueTime) return a.dueTime - b.dueTime
    if (a.cardKey < b.cardKey) return -1
    if (a.cardKey > b.cardKey) return 1
    return 0
  })
}

/**
 * 未处理尾部（currentIndex+1 .. end）的 cardKey 集合。
 * currentIndex 及之前的历史副本不在此集合中，故不阻止重入。
 */
export function getUnprocessedTailCardKeys(
  queue: readonly ReviewCard[],
  currentIndex: number
): Set<string> {
  const keys = new Set<string>()
  const start = Math.max(0, currentIndex + 1)
  for (let i = start; i < queue.length; i++) {
    keys.add(cardKeyFromReviewCard(queue[i]))
  }
  return keys
}

/**
 * 将已接纳卡片追加到队尾；仅对未处理尾部去重。
 * 纯函数：不碰 pending、不碰 budget。
 */
export function commitPendingRequeueToQueue(
  queue: readonly ReviewCard[],
  currentIndex: number,
  acceptedCards: readonly ReviewCard[]
): CommitQueueResult {
  const tailKeys = getUnprocessedTailCardKeys(queue, currentIndex)
  const appended: ReviewCard[] = []
  const skippedInTail: string[] = []
  const appendedKeys: string[] = []

  for (const card of acceptedCards) {
    const key = cardKeyFromReviewCard(card)
    if (tailKeys.has(key)) {
      skippedInTail.push(key)
      continue
    }
    appended.push(card)
    appendedKeys.push(key)
    tailKeys.add(key)
  }

  if (appended.length === 0) {
    return {
      queue: [...queue],
      appended,
      skippedInTail,
      appendedKeys
    }
  }

  return {
    queue: [...queue, ...appended],
    appended,
    skippedInTail,
    appendedKeys
  }
}

/**
 * 从 pending 移除指定 keys（接纳成功 / 已在尾部 / 显式清理）。
 */
export function removePendingKeys(
  state: PendingDueState,
  keys: readonly string[]
): PendingDueState {
  if (keys.length === 0) return state
  const next = new Map(state.entries)
  for (const key of keys) {
    next.delete(key)
  }
  return {
    entries: next,
    scheduledToken: state.scheduledToken,
    nextGeneration: state.nextGeneration,
    active: state.active
  }
}

/**
 * 停用并清空 pending（完成 / 关闭 / 卸载 / 新轮次）。
 * scheduledToken 递增，使已调度 timer 全部 stale。
 */
export function deactivateAndClearPending(
  state: PendingDueState
): PendingDueState {
  return {
    entries: new Map(),
    scheduledToken: state.scheduledToken + 1,
    nextGeneration: state.nextGeneration,
    active: false
  }
}

/**
 * 重新激活空 pending（新轮次开始时）。
 */
export function activateEmptyPendingDueState(): PendingDueState {
  return createEmptyPendingDueState(true)
}

/**
 * 处理一次 timer wake 的完整纯流程：
 * 1) token / active 校验
 * 2) 选到期条目（暂不删）
 * 3) scope + budget 接纳
 * 4) 尾部去重提交
 * 5) 仅移除已追加或已在尾部的 keys；拒绝的保留
 */
export function processPendingWake(params: {
  state: PendingDueState
  wakeToken: number
  nowMs: number
  queue: readonly ReviewCard[]
  currentIndex: number
  scope: ReviewSessionScope
  budget: SessionRootCardBudget | null
}): ProcessPendingWakeResult {
  const { state, wakeToken, nowMs, queue, currentIndex, scope, budget } = params

  if (!state.active) {
    return {
      state,
      queue: [...queue],
      applied: false,
      stale: false,
      inactive: true,
      appended: [],
      skippedInTail: [],
      retainedRejected: [],
      diagnostics: ["pending wake ignored: session inactive"],
      nextNearestDue: null
    }
  }

  if (!isPendingWakeTokenCurrent(state, wakeToken)) {
    return {
      state,
      queue: [...queue],
      applied: false,
      stale: true,
      inactive: false,
      appended: [],
      skippedInTail: [],
      retainedRejected: [],
      diagnostics: [
        `pending wake ignored: stale token ${wakeToken} (current ${state.scheduledToken})`
      ],
      nextNearestDue: getNearestPendingDueTime(state)
    }
  }

  const dueEntries = selectDuePendingEntries(state, nowMs)
  if (dueEntries.length === 0) {
    return {
      state,
      queue: [...queue],
      applied: true,
      stale: false,
      inactive: false,
      appended: [],
      skippedInTail: [],
      retainedRejected: [],
      diagnostics: [],
      nextNearestDue: getNearestPendingDueTime(state)
    }
  }

  const dueCards = dueEntries.map((e) => e.card)
  const dueKeys = dueEntries.map((e) => e.cardKey)

  const accepted = selectPendingDueCardsForRequeue(dueCards, scope, budget)
  const acceptedKeys = new Set(accepted.map((c) => cardKeyFromReviewCard(c)))

  const retainedRejected: string[] = []
  const diagnostics: string[] = []

  for (const key of dueKeys) {
    if (!acceptedKeys.has(key)) {
      retainedRejected.push(key)
      diagnostics.push(
        `pending requeue rejected (scope/budget), retained for retry: ${key}`
      )
    }
  }

  const commit = commitPendingRequeueToQueue(queue, currentIndex, accepted)

  // 仅移除成功落地（追加）或已在尾部（无需再追）的 keys
  const removeKeys = [
    ...commit.appendedKeys,
    ...commit.skippedInTail
  ]
  let nextState = removePendingKeys(state, removeKeys)

  // retainedRejected 保持在 nextState.entries 中（未删除）
  if (commit.skippedInTail.length > 0) {
    diagnostics.push(
      `pending requeue skipped (already in unprocessed tail): ${commit.skippedInTail.join(", ")}`
    )
  }

  return {
    state: nextState,
    queue: commit.queue,
    applied: true,
    stale: false,
    inactive: false,
    appended: commit.appended,
    skippedInTail: commit.skippedInTail,
    retainedRejected,
    diagnostics,
    nextNearestDue: getNearestPendingDueTime(nextState)
  }
}
