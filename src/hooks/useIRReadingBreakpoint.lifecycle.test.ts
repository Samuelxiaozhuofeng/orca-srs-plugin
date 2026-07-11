/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest"
import {
  BreakpointRestoreRunGuard,
  getRestoreTargetKey,
  resolveRestoreTarget
} from "./irBreakpointRestore"

describe("useIRReadingBreakpoint restore lifecycle", () => {
  it("does not rerun restore when only callback identity would have changed", () => {
    const cardId = 3790 as const
    const targetKey = getRestoreTargetKey(resolveRestoreTarget(cardId, null, 3852))
    const guard = new BreakpointRestoreRunGuard()

    const runEffect = () => {
      if (!guard.begin(targetKey)) return false
      guard.complete(targetKey)
      return true
    }

    expect(runEffect()).toBe(true)

    const nextCallbacks = {
      onSaveError: vi.fn(),
      onRestoreSuccess: vi.fn()
    }
    void nextCallbacks

    expect(runEffect()).toBe(false)
  })

  it("reruns restore when cardId changes even if callbacks keep changing", () => {
    const guard = new BreakpointRestoreRunGuard()

    const firstKey = getRestoreTargetKey(resolveRestoreTarget(3790, null, 3852))
    const secondKey = getRestoreTargetKey(resolveRestoreTarget(4353, null, 4400))

    expect(guard.begin(firstKey)).toBe(true)
    guard.complete(firstKey)

    expect(guard.begin(firstKey)).toBe(false)
    expect(guard.begin(secondKey)).toBe(true)
  })

  it("treats returning to a previous card as a new restore lifecycle", () => {
    const guard = new BreakpointRestoreRunGuard()
    const firstKey = getRestoreTargetKey(resolveRestoreTarget(3790, null, 3852))
    const secondKey = getRestoreTargetKey(resolveRestoreTarget(4353, null, 4400))

    expect(guard.begin(firstKey)).toBe(true)
    guard.complete(firstKey)
    expect(guard.begin(secondKey)).toBe(true)
    guard.cancel(secondKey)
    expect(guard.begin(firstKey)).toBe(true)
  })
})
