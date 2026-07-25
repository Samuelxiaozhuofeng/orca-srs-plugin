/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../orca.d.ts"
import {
  BreakpointRestoreRunGuard,
  defaultAlignTarget,
  getRestoreTargetKey,
  planCardEnterScroll,
  resetScrollContainerTop,
  isRestoreTargetNone,
  resolveRestoreTarget,
  scheduleBreakpointRestore,
  ScrollCaptureSuppression,
  shouldAllowScrollVisibleCapture,
  shouldRunRestoreForTarget
} from "./irBreakpointRestore"

function mockAlignTarget() {
  return vi.fn((_el: HTMLElement, _offset: number | null, scrollOwner: HTMLElement | null) => {
    if (scrollOwner && "scrollTop" in scrollOwner) {
      // simulate successful alignment
      ;(scrollOwner as { scrollTop: number }).scrollTop = 72
    }
    return 0
  })
}

describe("irBreakpointRestore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("uses stable restore target keys for the same card and resume target", () => {
    const target = resolveRestoreTarget(3790, null, 3852)
    expect(getRestoreTargetKey(target)).toBe("3790:3790:3852:line:nosel")
    expect(shouldRunRestoreForTarget("3790:3790:3852:line:nosel", "3790:3790:3852:line:nosel")).toBe(false)
  })

  it("includes viewport anchor offset in restore target key", () => {
    const target = resolveRestoreTarget(100, {
      previewBlockId: null,
      selection: null,
      updatedAt: null,
      schemaVersion: 2,
      viewportAnchor: { rootBlockId: 100, blockId: 200, topOffsetPx: 72.4 }
    }, null)
    expect(getRestoreTargetKey(target)).toBe("100:100:200:72:nosel")
    expect(isRestoreTargetNone(target)).toBe(false)
    if (!isRestoreTargetNone(target)) {
      expect(target.topOffsetPx).toBe(72.4)
    }
  })

  it("plans top-only enter for cards without a breakpoint", () => {
    const target = resolveRestoreTarget(100, null, null)
    expect(planCardEnterScroll(target)).toEqual({ kind: "top-only", cardId: 100 })
  })

  it("plans reset-then-restore when a resume target exists", () => {
    const target = resolveRestoreTarget(100, null, 200)
    expect(planCardEnterScroll(target)).toEqual({
      kind: "reset-then-restore",
      cardId: 100,
      targetRootBlockId: 100,
      targetBlockId: 200
    })
  })

  it("resets scroll to top for cards without breakpoint before success", async () => {
    const scroll = { scrollTop: 420 }
    const onSuccess = vi.fn()
    const target = resolveRestoreTarget(100, null, null)

    scheduleBreakpointRestore(target, {
      getContentContainer: () => document.createElement("div"),
      getScrollContainer: () => scroll,
      restoreSelection: vi.fn(async () => undefined),
      alignTarget: mockAlignTarget(),
      onSuccess
    })

    expect(scroll.scrollTop).toBe(0)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("resets scroll first then aligns target block for cards with breakpoint", async () => {
    const scroll = document.createElement("div") as HTMLElement & { scrollTop: number }
    scroll.scrollTop = 800
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-200"
    content.appendChild(block)
    const alignTarget = vi.fn()
    const order: string[] = []

    const target = resolveRestoreTarget(100, null, 200)
    scheduleBreakpointRestore(target, {
      getContentContainer: () => {
        order.push("container")
        return content
      },
      getScrollContainer: () => {
        order.push(`reset@${scroll.scrollTop}`)
        return scroll
      },
      restoreSelection: vi.fn(async () => undefined),
      alignTarget: (el, offset, owner) => {
        order.push("align")
        alignTarget(el, offset, owner)
        scroll.scrollTop = 55
        return 0
      },
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      // 稳定轮询立即完成：残差 0
      stabilityConsecutiveOk: 1,
      stabilityMaxWaitMs: 0
    })

    expect(scroll.scrollTop).toBe(0)
    expect(order[0]).toBe("reset@800")

    await vi.advanceTimersByTimeAsync(60)
    expect(alignTarget).toHaveBeenCalled()
    expect(order).toContain("align")
    expect(order.indexOf("reset@800")).toBeLessThan(order.indexOf("align"))
  })

  it("aligns legacy resume-only targets with null topOffsetPx (reading line)", async () => {
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-200"
    content.appendChild(block)
    const alignTarget = mockAlignTarget()
    const onSuccess = vi.fn()

    scheduleBreakpointRestore(resolveRestoreTarget(100, null, 200), {
      getContentContainer: () => content,
      getScrollContainer: () => document.createElement("div"),
      restoreSelection: vi.fn(async () => undefined),
      alignTarget,
      onSuccess,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      stabilityConsecutiveOk: 1,
      stabilityMaxWaitMs: 0
    })

    await vi.advanceTimersByTimeAsync(60)
    expect(alignTarget.mock.calls[0][1]).toBeNull()
    expect(onSuccess).toHaveBeenCalled()
  })

  it("defaultAlignTarget returns 0 when owner lacks getBoundingClientRect", () => {
    const el = document.createElement("div")
    const owner = { scrollTop: 10 } as unknown as HTMLElement
    expect(defaultAlignTarget(el, 72, owner)).toBe(0)
  })

  it("resetScrollContainerTop is a no-op for null containers", () => {
    expect(() => resetScrollContainerTop(null)).not.toThrow()
    const el = { scrollTop: 12 }
    resetScrollContainerTop(el)
    expect(el.scrollTop).toBe(0)
  })

  it("ScrollCaptureSuppression begin/end uses generation tokens and force-end", () => {
    const suppress = new ScrollCaptureSuppression()
    expect(suppress.isActive()).toBe(false)

    const t1 = suppress.begin()
    expect(suppress.isActive()).toBe(true)

    const t2 = suppress.begin()
    expect(t2).not.toBe(t1)
    suppress.end(t1)
    expect(suppress.isActive()).toBe(true)

    suppress.end(t2)
    expect(suppress.isActive()).toBe(false)

    suppress.begin()
    suppress.end()
    expect(suppress.isActive()).toBe(false)
  })

  it("shouldAllowScrollVisibleCapture blocks while suppressed or card mismatch", () => {
    expect(shouldAllowScrollVisibleCapture({
      suppressActive: true,
      listeningForCardId: 1,
      activeCardId: 1
    })).toBe(false)
    expect(shouldAllowScrollVisibleCapture({
      suppressActive: false,
      listeningForCardId: 1,
      activeCardId: 2
    })).toBe(false)
    expect(shouldAllowScrollVisibleCapture({
      suppressActive: false,
      listeningForCardId: 1,
      activeCardId: 1
    })).toBe(true)
  })

  it("cancel path releases suppression so capture is not permanently stuck", () => {
    const suppress = new ScrollCaptureSuppression()
    const token = suppress.begin()
    let released = false
    const release = () => {
      if (released) return
      released = true
      suppress.end(token)
    }

    const content = document.createElement("div")
    const target = resolveRestoreTarget(100, null, 200)
    const handle = scheduleBreakpointRestore(target, {
      getContentContainer: () => content,
      getScrollContainer: () => ({ scrollTop: 50 }),
      restoreSelection: vi.fn(async () => undefined),
      alignTarget: mockAlignTarget(),
      maxAttempts: 2,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      onSuccess: release,
      onFailure: release
    })

    expect(suppress.isActive()).toBe(true)
    handle.cancel()
    release()
    expect(suppress.isActive()).toBe(false)
    expect(shouldAllowScrollVisibleCapture({
      suppressActive: suppress.isActive(),
      listeningForCardId: 100,
      activeCardId: 100
    })).toBe(true)
  })

  it("allows restore once after cardId changes", () => {
    const firstKey = getRestoreTargetKey(resolveRestoreTarget(3790, null, 3852))
    const secondKey = getRestoreTargetKey(resolveRestoreTarget(4353, null, 4400))

    expect(shouldRunRestoreForTarget(null, firstKey)).toBe(true)
    expect(shouldRunRestoreForTarget(firstKey, secondKey)).toBe(true)
  })

  it("calls alignTarget only once when the same restore target is already completed", async () => {
    const alignTarget = mockAlignTarget()
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-3852"
    content.appendChild(block)

    const target = resolveRestoreTarget(3790, null, 3852)
    const targetKey = getRestoreTargetKey(target)
    let completedKey: string | null = null

    const maybeStart = () => {
      if (!shouldRunRestoreForTarget(completedKey, targetKey)) return null
      return scheduleBreakpointRestore(target, {
        getContentContainer: () => content,
        restoreSelection: vi.fn(async () => undefined),
        alignTarget,
        onSuccess: () => {
          completedKey = targetKey
        },
        schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
        clearSchedule: (id) => window.clearTimeout(id),
        stabilityConsecutiveOk: 1,
        stabilityMaxWaitMs: 0
      })
    }

    const first = maybeStart()
    await vi.advanceTimersByTimeAsync(60)
    const callsAfterFirst = alignTarget.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1)

    const second = maybeStart()
    expect(second).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(alignTarget.mock.calls.length).toBe(callsAfterFirst)

    first?.cancel()
  })

  it("does not start a duplicate restore while the same target is in flight", () => {
    const guard = new BreakpointRestoreRunGuard()

    expect(guard.begin("3790:3790:3852:line:nosel")).toBe(true)
    expect(guard.begin("3790:3790:3852:line:nosel")).toBe(false)

    guard.cancel("3790:3790:3852:line:nosel")
    expect(guard.begin("3790:3790:3852:line:nosel")).toBe(true)

    guard.complete("3790:3790:3852:line:nosel")
    expect(guard.begin("3790:3790:3852:line:nosel")).toBe(false)
  })

  it("allows a later retry when the current restore attempt is cancelled", () => {
    const guard = new BreakpointRestoreRunGuard()
    const targetKey = "3790:3790:3852:line:nosel"

    expect(guard.begin(targetKey)).toBe(true)
    guard.cancel(targetKey)
    expect(guard.begin(targetKey)).toBe(true)
  })

  it("restores a card again after entering another target that never completed", () => {
    const guard = new BreakpointRestoreRunGuard()
    const firstKey = "3790:3790:3852:line:nosel"
    const secondKey = "4353:4353:4400:line:nosel"

    expect(guard.begin(firstKey)).toBe(true)
    guard.complete(firstKey)

    expect(guard.begin(secondKey)).toBe(true)
    guard.cancel(secondKey)

    expect(guard.begin(firstKey)).toBe(true)
  })

  it("retries until the target block renders and can be cancelled", async () => {
    const alignTarget = mockAlignTarget()
    const content = document.createElement("div")
    const onFailure = vi.fn()

    const target = resolveRestoreTarget(3790, null, 3852)
    const handle = scheduleBreakpointRestore(target, {
      getContentContainer: () => content,
      restoreSelection: vi.fn(async () => undefined),
      alignTarget,
      onFailure,
      maxAttempts: 3,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      stabilityConsecutiveOk: 1,
      stabilityMaxWaitMs: 0
    })

    await vi.advanceTimersByTimeAsync(60)
    expect(alignTarget).not.toHaveBeenCalled()

    const block = document.createElement("div")
    block.id = "block-3852"
    content.appendChild(block)

    await vi.advanceTimersByTimeAsync(260)
    expect(alignTarget).toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()

    handle.cancel()
    await vi.advanceTimersByTimeAsync(500)
  })

  it("reports failure after max attempts when the target never renders", async () => {
    const onFailure = vi.fn()
    const target = resolveRestoreTarget(3790, null, 3852)

    scheduleBreakpointRestore(target, {
      getContentContainer: () => document.createElement("div"),
      restoreSelection: vi.fn(async () => undefined),
      alignTarget: mockAlignTarget(),
      onFailure,
      maxAttempts: 2,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id)
    })

    await vi.advanceTimersByTimeAsync(60)
    await vi.advanceTimersByTimeAsync(260)
    await vi.advanceTimersByTimeAsync(260)

    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0]?.message).toContain("断点恢复超时")
  })

  it("keeps scroll restoration when selection restore fails", async () => {
    const alignTarget = mockAlignTarget()
    const onSuccess = vi.fn()
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-3852"
    content.appendChild(block)

    const target = resolveRestoreTarget(3790, {
      previewBlockId: null,
      selection: {
        rootBlockId: 3790,
        anchor: { blockId: 3852, offset: 0, isInline: false, index: 0 },
        focus: { blockId: 3852, offset: 4, isInline: false, index: 0 },
        isForward: true
      },
      updatedAt: new Date()
    }, null)

    scheduleBreakpointRestore(target, {
      getContentContainer: () => content,
      restoreSelection: vi.fn(async () => {
        throw new Error("selection failed")
      }),
      alignTarget,
      onSuccess,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      stabilityConsecutiveOk: 1,
      stabilityMaxWaitMs: 0
    })

    await vi.advanceTimersByTimeAsync(60)

    expect(alignTarget).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("does not report success after cancellation during selection restore", async () => {
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-3852"
    content.appendChild(block)
    let finishSelection!: () => void
    const selectionPending = new Promise<void>(resolve => {
      finishSelection = resolve
    })
    const onSuccess = vi.fn()

    const target = resolveRestoreTarget(3790, {
      previewBlockId: null,
      selection: {
        rootBlockId: 3790,
        anchor: { blockId: 3852, offset: 0, isInline: false, index: 0 },
        focus: { blockId: 3852, offset: 4, isInline: false, index: 0 },
        isForward: true
      },
      updatedAt: new Date()
    }, null)

    const handle = scheduleBreakpointRestore(target, {
      getContentContainer: () => content,
      restoreSelection: () => selectionPending,
      alignTarget: mockAlignTarget(),
      onSuccess,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      stabilityConsecutiveOk: 1,
      stabilityMaxWaitMs: 0
    })

    await vi.advanceTimersByTimeAsync(60)
    handle.cancel()
    finishSelection()
    await Promise.resolve()

    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("calls onFailure and settles when alignTarget throws on first align", async () => {
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-200"
    content.appendChild(block)
    const onFailure = vi.fn()
    const onSuccess = vi.fn()

    scheduleBreakpointRestore(resolveRestoreTarget(100, null, 200), {
      getContentContainer: () => content,
      getScrollContainer: () => document.createElement("div"),
      restoreSelection: vi.fn(async () => undefined),
      alignTarget: () => {
        throw new Error("align boom")
      },
      onSuccess,
      onFailure,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id)
    })

    await vi.advanceTimersByTimeAsync(60)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0]?.message).toContain("align boom")
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("calls onFailure when alignTarget throws during stability poll", async () => {
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-200"
    content.appendChild(block)
    const onFailure = vi.fn()
    let calls = 0

    scheduleBreakpointRestore(resolveRestoreTarget(100, null, 200), {
      getContentContainer: () => content,
      getScrollContainer: () => document.createElement("div"),
      restoreSelection: vi.fn(async () => undefined),
      alignTarget: () => {
        calls += 1
        if (calls === 1) return 40
        throw new Error("poll boom")
      },
      onFailure,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      stabilityEpsilonPx: 8,
      stabilityConsecutiveOk: 2,
      stabilityPollMs: 50,
      stabilityMaxWaitMs: 2000
    })

    await vi.advanceTimersByTimeAsync(60)
    await vi.advanceTimersByTimeAsync(50)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0]?.message).toContain("poll boom")
  })

  it("holds success until residual stays within epsilon twice", async () => {
    const content = document.createElement("div")
    const block = document.createElement("div")
    block.id = "block-200"
    content.appendChild(block)
    const onSuccess = vi.fn()
    let call = 0
    const alignTarget = vi.fn(() => {
      call += 1
      // first two residuals large, then stable
      return call < 3 ? 40 : 2
    })

    scheduleBreakpointRestore(resolveRestoreTarget(100, null, 200), {
      getContentContainer: () => content,
      getScrollContainer: () => document.createElement("div"),
      restoreSelection: vi.fn(async () => undefined),
      alignTarget,
      onSuccess,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      stabilityEpsilonPx: 8,
      stabilityConsecutiveOk: 2,
      stabilityPollMs: 50,
      stabilityMaxWaitMs: 2000
    })

    await vi.advanceTimersByTimeAsync(60)
    expect(onSuccess).not.toHaveBeenCalled()

    // settleAlign: initial tick + polls
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(50)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(alignTarget.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
