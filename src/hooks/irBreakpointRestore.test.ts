/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../orca.d.ts"
import {
  BreakpointRestoreRunGuard,
  getRestoreTargetKey,
  resolveRestoreTarget,
  scheduleBreakpointRestore,
  shouldRunRestoreForTarget
} from "./irBreakpointRestore"

describe("irBreakpointRestore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("uses stable restore target keys for the same card and resume target", () => {
    const target = resolveRestoreTarget(3790, null, 3852)
    expect(getRestoreTargetKey(target)).toBe("3790:3790:3852")
    expect(shouldRunRestoreForTarget("3790:3790:3852", "3790:3790:3852")).toBe(false)
  })

  it("allows restore once after cardId changes", () => {
    const firstKey = getRestoreTargetKey(resolveRestoreTarget(3790, null, 3852))
    const secondKey = getRestoreTargetKey(resolveRestoreTarget(4353, null, 4400))

    expect(shouldRunRestoreForTarget(null, firstKey)).toBe(true)
    expect(shouldRunRestoreForTarget(firstKey, secondKey)).toBe(true)
  })

  it("calls scrollIntoView only once when the same restore target is already completed", async () => {
    const scrollIntoView = vi.fn()
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
        scrollIntoView,
        onSuccess: () => {
          completedKey = targetKey
        },
        schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
        clearSchedule: (id) => window.clearTimeout(id)
      })
    }

    const first = maybeStart()
    await vi.advanceTimersByTimeAsync(60)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    const second = maybeStart()
    expect(second).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    first?.cancel()
  })

  it("does not start a duplicate restore while the same target is in flight", () => {
    const guard = new BreakpointRestoreRunGuard()

    expect(guard.begin("3790:3790:3852")).toBe(true)
    expect(guard.begin("3790:3790:3852")).toBe(false)

    guard.cancel("3790:3790:3852")
    expect(guard.begin("3790:3790:3852")).toBe(true)

    guard.complete("3790:3790:3852")
    expect(guard.begin("3790:3790:3852")).toBe(false)
  })

  it("allows a later retry when the current restore attempt is cancelled", () => {
    const guard = new BreakpointRestoreRunGuard()
    const targetKey = "3790:3790:3852"

    expect(guard.begin(targetKey)).toBe(true)
    guard.cancel(targetKey)
    expect(guard.begin(targetKey)).toBe(true)
  })

  it("restores a card again after entering another target that never completed", () => {
    const guard = new BreakpointRestoreRunGuard()
    const firstKey = "3790:3790:3852"
    const secondKey = "4353:4353:4400"

    expect(guard.begin(firstKey)).toBe(true)
    guard.complete(firstKey)

    expect(guard.begin(secondKey)).toBe(true)
    guard.cancel(secondKey)

    expect(guard.begin(firstKey)).toBe(true)
  })

  it("retries until the target block renders and can be cancelled", async () => {
    const scrollIntoView = vi.fn()
    const content = document.createElement("div")
    const onFailure = vi.fn()

    const target = resolveRestoreTarget(3790, null, 3852)
    const handle = scheduleBreakpointRestore(target, {
      getContentContainer: () => content,
      restoreSelection: vi.fn(async () => undefined),
      scrollIntoView,
      onFailure,
      maxAttempts: 3,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id)
    })

    await vi.advanceTimersByTimeAsync(60)
    expect(scrollIntoView).not.toHaveBeenCalled()

    const block = document.createElement("div")
    block.id = "block-3852"
    content.appendChild(block)

    await vi.advanceTimersByTimeAsync(260)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(onFailure).not.toHaveBeenCalled()

    handle.cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it("reports failure after max attempts when the target never renders", async () => {
    const onFailure = vi.fn()
    const target = resolveRestoreTarget(3790, null, 3852)

    scheduleBreakpointRestore(target, {
      getContentContainer: () => document.createElement("div"),
      restoreSelection: vi.fn(async () => undefined),
      scrollIntoView: vi.fn(),
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
    const scrollIntoView = vi.fn()
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
      scrollIntoView,
      onSuccess,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id)
    })

    await vi.advanceTimersByTimeAsync(60)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
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
      scrollIntoView: vi.fn(),
      onSuccess,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id)
    })

    await vi.advanceTimersByTimeAsync(60)
    handle.cancel()
    finishSelection()
    await Promise.resolve()

    expect(onSuccess).not.toHaveBeenCalled()
  })
})
