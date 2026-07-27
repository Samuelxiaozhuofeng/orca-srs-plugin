import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  activateEmptyPendingDueState,
  createEmptyPendingDueState,
  planNextPendingWake
} from "../pendingDueRequeue"
import type { ReviewCard } from "../types"
import {
  freezeIRMixedReviewScope,
  processIRMixedPendingWake,
  shouldTrackIRMixedPending,
  trackIRMixedPendingCard
} from "./irMixedPendingDue"
import { reviewCardsToEntries, type IRSessionEntry } from "./irMixedQueuePolicy"

function review(
  partial: Partial<ReviewCard> & Pick<ReviewCard, "id">
): ReviewCard {
  const due = partial.srs?.due ?? new Date("2026-01-19T08:00:00")
  return {
    id: partial.id,
    front: partial.front ?? "front",
    back: partial.back ?? "back",
    srs: partial.srs ?? {
      stability: 1,
      difficulty: 5,
      interval: 3,
      due,
      lastReviewed: new Date("2026-01-18T08:00:00"),
      reps: 2,
      lapses: 0
    },
    deck: partial.deck ?? "deck",
    cardType: partial.cardType ?? "basic",
    isNew: partial.isNew ?? false,
    clozeNumber: partial.clozeNumber,
    directionType: partial.directionType,
    listItemId: partial.listItemId,
    listItemIndex: partial.listItemIndex,
    listItemIds: partial.listItemIds,
    isAuxiliaryPreview: partial.isAuxiliaryPreview
  }
}

describe("IR mixed pending real-due requeue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-27T10:00:00.000Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("tracks Again/Hard short relearn but does not append before due", () => {
    const now = Date.now()
    const dueMs = now + 6 * 60 * 1000
    const card = review({
      id: 1,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 0,
        due: new Date(dueMs),
        lastReviewed: new Date(now),
        reps: 1,
        lapses: 1
      }
    })
    expect(
      shouldTrackIRMixedPending({ grade: "again", updatedCard: card, nowMs: now })
    ).toBe(true)

    const scope = freezeIRMixedReviewScope(reviewCardsToEntries([card]))
    let state = activateEmptyPendingDueState()
    const tracked = trackIRMixedPendingCard(state, card, now, scope)
    expect(tracked.status).toBe("tracked")
    state = tracked.state

    const planned = planNextPendingWake(state, now)
    state = planned.state
    expect(planned.plan).not.toBeNull()

    // 800ms：仍未 due
    const at800 = processIRMixedPendingWake({
      state,
      wakeToken: planned.plan!.token,
      nowMs: now + 800,
      queue: [],
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: true
    })
    expect(at800.appended).toHaveLength(0)
    expect(at800.queue).toHaveLength(0)
    expect(at800.shouldReopenSession).toBe(false)

    // due - 1ms：仍不入队
    const justBefore = processIRMixedPendingWake({
      state,
      wakeToken: planned.plan!.token,
      nowMs: dueMs - 1,
      queue: [],
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: true
    })
    expect(justBefore.appended).toHaveLength(0)

    // at due：入队一次，可 reopen
    const atDue = processIRMixedPendingWake({
      state,
      wakeToken: planned.plan!.token,
      nowMs: dueMs,
      queue: [],
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: true
    })
    expect(atDue.appended).toHaveLength(1)
    expect(atDue.queue).toHaveLength(1)
    expect(atDue.queue[0].kind).toBe("review")
    expect(atDue.shouldReopenSession).toBe(true)
    expect(atDue.state.entries.size).toBe(0)
  })

  it("does not append twice on stale or duplicate wake", () => {
    const now = Date.now()
    const dueMs = now + 1000
    const card = review({
      id: 2,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 0,
        due: new Date(dueMs),
        lastReviewed: new Date(now),
        reps: 1,
        lapses: 1
      }
    })
    const scope = freezeIRMixedReviewScope(reviewCardsToEntries([card]))
    let state = activateEmptyPendingDueState()
    state = trackIRMixedPendingCard(state, card, now, scope).state
    const plan1 = planNextPendingWake(state, now)
    state = plan1.state
    // 重新 plan 使旧 token stale
    const plan2 = planNextPendingWake(state, now)
    state = plan2.state

    const stale = processIRMixedPendingWake({
      state,
      wakeToken: plan1.plan!.token,
      nowMs: dueMs + 10,
      queue: [],
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: true
    })
    expect(stale.stale).toBe(true)
    expect(stale.appended).toHaveLength(0)

    const first = processIRMixedPendingWake({
      state,
      wakeToken: plan2.plan!.token,
      nowMs: dueMs + 10,
      queue: [],
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: true
    })
    expect(first.appended).toHaveLength(1)

    // 同一 token 再 fire：state 已无 entry
    const second = processIRMixedPendingWake({
      state: first.state,
      wakeToken: plan2.plan!.token,
      nowMs: dueMs + 20,
      queue: first.queue,
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: false
    })
    expect(second.appended).toHaveLength(0)
    expect(second.queue).toHaveLength(1)
  })

  it("rejects identities outside the frozen session review set", () => {
    const now = Date.now()
    const inSession = review({ id: 10 })
    const outsider = review({
      id: 99,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 0,
        due: new Date(now + 1000),
        lastReviewed: new Date(now),
        reps: 1,
        lapses: 1
      }
    })
    const scope = freezeIRMixedReviewScope(reviewCardsToEntries([inSession]))
    const tracked = trackIRMixedPendingCard(
      activateEmptyPendingDueState(),
      outsider,
      now,
      scope
    )
    expect(tracked.status).toBe("out_of_scope")
  })

  it("marks reopen when the last card was pending and due arrives on empty queue", () => {
    const now = Date.now()
    const dueMs = now + 5000
    const card = review({
      id: 3,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 0,
        due: new Date(dueMs),
        lastReviewed: new Date(now),
        reps: 1,
        lapses: 1
      }
    })
    const scope = freezeIRMixedReviewScope(reviewCardsToEntries([card]))
    let state = activateEmptyPendingDueState()
    state = trackIRMixedPendingCard(state, card, now, scope).state
    const planned = planNextPendingWake(state, now)
    state = planned.state

    const emptyQueue: IRSessionEntry[] = []
    const wake = processIRMixedPendingWake({
      state,
      wakeToken: planned.plan!.token,
      nowMs: dueMs,
      queue: emptyQueue,
      currentIndex: 0,
      scope,
      sessionVisiblyComplete: true
    })
    expect(wake.shouldReopenSession).toBe(true)
    expect(wake.queue).toHaveLength(1)
  })

  it("starts inactive empty state without accepting tracks", () => {
    const card = review({ id: 4 })
    const scope = freezeIRMixedReviewScope(reviewCardsToEntries([card]))
    const tracked = trackIRMixedPendingCard(
      createEmptyPendingDueState(false),
      card,
      Date.now(),
      scope
    )
    expect(tracked.status).toBe("inactive")
  })
})
