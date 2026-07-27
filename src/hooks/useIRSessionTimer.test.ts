import { describe, expect, it } from "vitest"
import {
  calculateActiveElapsedSeconds,
  calculateElapsedSeconds,
  formatElapsedLabel
} from "./irSessionTimerUtils"

describe("IR session timer", () => {
  it("calculates elapsed seconds from the current reset origin", () => {
    expect(calculateElapsedSeconds(10_000, 12_999)).toBe(2)
    expect(calculateElapsedSeconds(20_000, 19_000)).toBe(0)
  })

  it("formats elapsed time as mm:ss and switches to h:mm:ss past an hour", () => {
    expect(formatElapsedLabel(0)).toBe("0:00")
    expect(formatElapsedLabel(65)).toBe("1:05")
    expect(formatElapsedLabel(600)).toBe("10:00")
    expect(formatElapsedLabel(3600)).toBe("1:00:00")
    expect(formatElapsedLabel(3725)).toBe("1:02:05")
  })

  it("never renders a negative label", () => {
    expect(formatElapsedLabel(-30)).toBe("0:00")
  })

  it("freezes accumulated time while paused and resumes without adding the gap", () => {
    // 活跃 10s 后暂停
    const afterActive = calculateActiveElapsedSeconds({
      accumulatedSeconds: 0,
      currentSegmentStartedAt: 1_000,
      now: 11_000
    })
    expect(afterActive).toBe(10)

    // 暂停 1 小时：只看冻结值
    const whilePaused = calculateActiveElapsedSeconds({
      accumulatedSeconds: afterActive,
      currentSegmentStartedAt: null,
      now: 11_000 + 3_600_000
    })
    expect(whilePaused).toBe(10)

    // 恢复后再活跃 5s → 15s，不含暂停的 1 小时
    const afterResume = calculateActiveElapsedSeconds({
      accumulatedSeconds: whilePaused,
      currentSegmentStartedAt: 11_000 + 3_600_000,
      now: 11_000 + 3_600_000 + 5_000
    })
    expect(afterResume).toBe(15)
  })

  it("reset semantics: zero accumulated with no open segment", () => {
    expect(
      calculateActiveElapsedSeconds({
        accumulatedSeconds: 0,
        currentSegmentStartedAt: null,
        now: 99_999
      })
    ).toBe(0)
  })
})
