/**
 * 「读到文末」门闩：
 * - 触底 / 一屏装下全文为末区信号；中途滚动不算
 * - 离开末区取消计时，重新进入重新计时
 * - 停留不足不弹（短摘录扫一眼就走不该被打断）
 * - 会话级抑制后不再弹
 */

import { describe, expect, it } from "vitest"
import {
  advanceEndZoneState,
  END_ZONE_DWELL_MS,
  formatEndOfContentCompleteHint,
  formatEndOfContentLaterHint,
  resolveEndZoneReason,
  shouldGateNext,
  type EndZoneState
} from "./irEndOfContentGate"

describe("resolveEndZoneReason", () => {
  it("reports bottom when the scroll owner is within epsilon of the end", () => {
    expect(resolveEndZoneReason({ scrollTop: 1990, clientHeight: 800, scrollHeight: 2800 }))
      .toBe("bottom")
    expect(resolveEndZoneReason({ scrollTop: 2000, clientHeight: 800, scrollHeight: 2800 }))
      .toBe("bottom")
  })

  it("reports nothing mid-article", () => {
    expect(resolveEndZoneReason({ scrollTop: 400, clientHeight: 800, scrollHeight: 2800 }))
      .toBeNull()
  })

  it("treats a one-screen article as already seen to the end", () => {
    expect(resolveEndZoneReason({ scrollTop: 0, clientHeight: 800, scrollHeight: 600 }))
      .toBe("fits")
    expect(resolveEndZoneReason({ scrollTop: 0, clientHeight: 800, scrollHeight: 810 }))
      .toBe("fits")
  })

  it("returns null for unusable geometry instead of guessing", () => {
    expect(resolveEndZoneReason({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBeNull()
    expect(resolveEndZoneReason({ scrollTop: Number.NaN, clientHeight: 800, scrollHeight: 900 }))
      .toBeNull()
  })
})

describe("advanceEndZoneState", () => {
  const idle: EndZoneState = { reason: null, enteredAt: null }

  it("starts the clock on entering the end zone", () => {
    expect(advanceEndZoneState(idle, "bottom", 1000)).toEqual({ reason: "bottom", enteredAt: 1000 })
  })

  it("keeps the original entry time while staying in the end zone", () => {
    const entered = advanceEndZoneState(idle, "bottom", 1000)
    expect(advanceEndZoneState(entered, "bottom", 5000).enteredAt).toBe(1000)
    // 内容展开使一屏信号变触底信号时也不重新计时
    expect(advanceEndZoneState(entered, "fits", 5000).enteredAt).toBe(1000)
  })

  it("cancels the gate when the reader scrolls back up", () => {
    const entered = advanceEndZoneState(idle, "bottom", 1000)
    const left = advanceEndZoneState(entered, null, 2000)
    expect(left).toEqual({ reason: null, enteredAt: null })
    // 再次触底重新计时
    expect(advanceEndZoneState(left, "bottom", 3000).enteredAt).toBe(3000)
  })
})

describe("shouldGateNext", () => {
  it("gates only after the dwell threshold in the end zone", () => {
    const state: EndZoneState = { reason: "bottom", enteredAt: 1000 }
    expect(shouldGateNext({ state, now: 1000 + END_ZONE_DWELL_MS - 1, suppressed: false })).toBe(false)
    expect(shouldGateNext({ state, now: 1000 + END_ZONE_DWELL_MS, suppressed: false })).toBe(true)
  })

  it("never gates outside the end zone", () => {
    expect(shouldGateNext({
      state: { reason: null, enteredAt: null },
      now: 999_999,
      suppressed: false
    })).toBe(false)
  })

  it("stays quiet once the reader has resolved the gate in this session", () => {
    expect(shouldGateNext({
      state: { reason: "fits", enteredAt: 0 },
      now: 999_999,
      suppressed: true
    })).toBe(false)
  })
})

describe("copy", () => {
  it("names the sequential unlock path for an active chapter", () => {
    expect(formatEndOfContentCompleteHint(true)).toContain("解锁下一章")
    expect(formatEndOfContentCompleteHint(false)).toContain("退出本条阅读队列")
    expect(formatEndOfContentLaterHint(true)).toContain("保存阅读位置")
  })
})
