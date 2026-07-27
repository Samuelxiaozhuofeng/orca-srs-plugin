/**
 * 统一会话（IR mixed）内 Again/Hard 短期重学：按真实 FSRS due 回流。
 *
 * 与独立 SRS 会话的 pendingDueRequeue 同语义，但队列项是 IRSessionEntry，
 * scope 冻结为「本次会话已选中的复习身份」，budget=null（不二次消耗日额度）。
 */

import { cardKeyFromReviewCard } from "../cardIdentity"
import {
  getNearestPendingDueTime,
  isPendingWakeTokenCurrent,
  removePendingKeys,
  selectDuePendingEntries,
  upsertPendingDueCard,
  type PendingDueState
} from "../pendingDueRequeue"
import { createFixedScope, type ReviewSessionScope } from "../reviewSessionScope"
import type { ReviewCard } from "../types"
import {
  reviewEntryKey,
  shouldRequeueReviewInSession,
  type IRSessionEntry
} from "./irMixedQueuePolicy"

export type IRMixedPendingWakeResult = {
  readonly state: PendingDueState
  readonly queue: IRSessionEntry[]
  readonly applied: boolean
  readonly stale: boolean
  readonly inactive: boolean
  readonly appended: ReviewCard[]
  readonly skippedInTail: readonly string[]
  readonly retainedRejected: readonly string[]
  readonly diagnostics: readonly string[]
  readonly nextNearestDue: number | null
  /** 完成 UI 下因 pending 真正追加后应 reopen 会话 */
  readonly shouldReopenSession: boolean
}

/** 从会话初始条目冻结允许回流的复习身份（fixed scope，无动态扫描）。 */
export function freezeIRMixedReviewScope(
  entries: readonly IRSessionEntry[]
): ReviewSessionScope {
  const reviews = entries
    .filter((e): e is Extract<IRSessionEntry, { kind: "review" }> => e.kind === "review")
    .map((e) => e.card)
  return createFixedScope(reviews)
}

export function isReviewCardInFrozenScope(
  card: ReviewCard,
  scope: ReviewSessionScope
): boolean {
  if (scope.kind !== "fixed") return true
  const key = cardKeyFromReviewCard(card)
  return scope.cardKeys.includes(key)
}

/**
 * 是否应进入「跟踪、到期后再入队」（而非 800ms 后立刻 append）。
 */
export function shouldTrackIRMixedPending(params: {
  grade: string
  updatedCard: ReviewCard
  nowMs: number
}): boolean {
  return shouldRequeueReviewInSession(params)
}

export function trackIRMixedPendingCard(
  state: PendingDueState,
  card: ReviewCard,
  nowMs: number,
  scope: ReviewSessionScope
): {
  state: PendingDueState
  status: "tracked" | "out_of_window" | "inactive" | "invalid_due" | "out_of_scope"
  needsReschedule: boolean
  dueTimeMs: number | null
} {
  if (!isReviewCardInFrozenScope(card, scope)) {
    return {
      state,
      status: "out_of_scope",
      needsReschedule: false,
      dueTimeMs: null
    }
  }
  const dueTimeMs = card.srs.due.getTime()
  const upsert = upsertPendingDueCard(state, card, dueTimeMs, nowMs)
  return {
    state: upsert.state,
    status: upsert.status,
    needsReschedule: upsert.needsReschedule,
    dueTimeMs
  }
}

/** 未处理 tail 上的复习 cardKey（IR 队列）。 */
export function getUnprocessedIRReviewTailKeys(
  queue: readonly IRSessionEntry[],
  currentIndex: number
): Set<string> {
  const keys = new Set<string>()
  const start = Math.max(0, currentIndex + 1)
  for (let i = start; i < queue.length; i++) {
    const entry = queue[i]
    if (entry.kind === "review") {
      keys.add(cardKeyFromReviewCard(entry.card))
    }
  }
  return keys
}

/**
 * 处理一次 pending wake：仅当 now >= due 才 append；不耗日额度。
 * 完成态下成功 append 时 shouldReopenSession=true。
 */
export function processIRMixedPendingWake(params: {
  state: PendingDueState
  wakeToken: number
  nowMs: number
  queue: readonly IRSessionEntry[]
  currentIndex: number
  scope: ReviewSessionScope
  /** 可见队列是否已耗尽（完成 UI） */
  sessionVisiblyComplete: boolean
}): IRMixedPendingWakeResult {
  const { state, wakeToken, nowMs, queue, currentIndex, scope, sessionVisiblyComplete } =
    params

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
      diagnostics: ["IR mixed pending wake ignored: session inactive"],
      nextNearestDue: null,
      shouldReopenSession: false
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
        `IR mixed pending wake ignored: stale token ${wakeToken} (current ${state.scheduledToken})`
      ],
      nextNearestDue: getNearestPendingDueTime(state),
      shouldReopenSession: false
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
      nextNearestDue: getNearestPendingDueTime(state),
      shouldReopenSession: false
    }
  }

  const accepted: ReviewCard[] = []
  const retainedRejected: string[] = []
  const diagnostics: string[] = []

  for (const entry of dueEntries) {
    if (!isReviewCardInFrozenScope(entry.card, scope)) {
      retainedRejected.push(entry.cardKey)
      diagnostics.push(
        `IR mixed pending rejected (out of frozen scope), retained: ${entry.cardKey}`
      )
      continue
    }
    accepted.push(entry.card)
  }

  const tailKeys = getUnprocessedIRReviewTailKeys(queue, currentIndex)
  const appended: ReviewCard[] = []
  const skippedInTail: string[] = []
  const appendedKeys: string[] = []

  for (const card of accepted) {
    const key = cardKeyFromReviewCard(card)
    if (tailKeys.has(key)) {
      skippedInTail.push(key)
      continue
    }
    appended.push(card)
    appendedKeys.push(key)
    tailKeys.add(key)
  }

  const reviewEntries: IRSessionEntry[] = appended.map((card) => ({
    kind: "review" as const,
    card,
    key: reviewEntryKey(card)
  }))
  const nextQueue: IRSessionEntry[] =
    reviewEntries.length > 0 ? [...queue, ...reviewEntries] : [...queue]

  const removeKeys = [...appendedKeys, ...skippedInTail]
  const nextState = removePendingKeys(state, removeKeys)

  if (skippedInTail.length > 0) {
    diagnostics.push(
      `IR mixed pending skipped (already in unprocessed tail): ${skippedInTail.join(", ")}`
    )
  }

  return {
    state: nextState,
    queue: nextQueue,
    applied: true,
    stale: false,
    inactive: false,
    appended,
    skippedInTail,
    retainedRejected,
    diagnostics,
    nextNearestDue: getNearestPendingDueTime(nextState),
    shouldReopenSession: sessionVisiblyComplete && appended.length > 0
  }
}
