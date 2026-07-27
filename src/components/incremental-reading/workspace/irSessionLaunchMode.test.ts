import { describe, expect, it } from "vitest"
import {
  buildUnifiedSessionNotice,
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

describe("buildUnifiedSessionNotice", () => {
  it("reports pure reading when nothing is due for review", () => {
    expect(
      buildUnifiedSessionNotice({
        mixedEnabledForSession: true,
        readingCount: 3,
        reviewCount: 0
      })
    ).toBe("本次未安排到期复习卡，已按纯阅读进行")
  })

  it("explains a review-only session instead of looking empty", () => {
    expect(
      buildUnifiedSessionNotice({
        mixedEnabledForSession: true,
        readingCount: 0,
        reviewCount: 5
      })
    ).toBe("今天没有到期阅读材料，本次复习 5 张记忆卡")
  })

  it("stays quiet for a normal mixed queue", () => {
    expect(
      buildUnifiedSessionNotice({
        mixedEnabledForSession: true,
        readingCount: 6,
        reviewCount: 100
      })
    ).toBeNull()
  })

  it("returns null when mixed is off or there is nothing at all", () => {
    expect(
      buildUnifiedSessionNotice({
        mixedEnabledForSession: false,
        readingCount: 3,
        reviewCount: 0
      })
    ).toBeNull()
    expect(
      buildUnifiedSessionNotice({
        mixedEnabledForSession: true,
        readingCount: 0,
        reviewCount: 0
      })
    ).toBeNull()
  })
})
