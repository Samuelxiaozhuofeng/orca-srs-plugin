import { describe, expect, it } from "vitest"
import {
  buildMixedDegradedNotice,
  resolveSessionMixedEnabled
} from "./irSessionLaunchMode"

describe("resolveSessionMixedEnabled", () => {
  it("forces mixed off when session mode is read-only even if global is on", () => {
    expect(resolveSessionMixedEnabled("read-only", true)).toBe(false)
    expect(resolveSessionMixedEnabled("read-only", false)).toBe(false)
  })

  it("forces mixed on when session mode is mixed even if global is off", () => {
    expect(resolveSessionMixedEnabled("mixed", false)).toBe(true)
    expect(resolveSessionMixedEnabled("mixed", true)).toBe(true)
  })

  it("falls back to global when session mode is absent", () => {
    expect(resolveSessionMixedEnabled(null, true)).toBe(true)
    expect(resolveSessionMixedEnabled(null, false)).toBe(false)
    expect(resolveSessionMixedEnabled(undefined, true)).toBe(true)
    expect(resolveSessionMixedEnabled(undefined, false)).toBe(false)
  })
})

describe("buildMixedDegradedNotice", () => {
  it("returns notice only when mixed was intended but no reviews selected", () => {
    expect(
      buildMixedDegradedNotice({ mixedEnabledForSession: true, selectedReviewCount: 0 })
    ).toBe("本次未安排到期复习卡，已按纯阅读进行")
  })

  it("returns null when mixed is off or reviews were mixed in", () => {
    expect(
      buildMixedDegradedNotice({ mixedEnabledForSession: false, selectedReviewCount: 0 })
    ).toBeNull()
    expect(
      buildMixedDegradedNotice({ mixedEnabledForSession: true, selectedReviewCount: 2 })
    ).toBeNull()
  })
})
