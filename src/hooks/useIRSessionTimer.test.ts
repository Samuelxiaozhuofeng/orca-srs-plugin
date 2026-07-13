import { describe, expect, it } from "vitest"
import { calculateElapsedSeconds, shouldFireExpire } from "./irSessionTimerUtils"

describe("IR session timer", () => {
  it("calculates elapsed seconds from the current reset origin", () => {
    expect(calculateElapsedSeconds(10_000, 12_999)).toBe(2)
    expect(calculateElapsedSeconds(20_000, 19_000)).toBe(0)
  })

  it("fires expire only once per cycle while elapsed stays past budget", () => {
    const budgetSeconds = 600
    expect(shouldFireExpire(599, budgetSeconds, false)).toBe(false)
    expect(shouldFireExpire(600, budgetSeconds, false)).toBe(true)
    // After first fire, subsequent ticks must not re-fire
    expect(shouldFireExpire(600, budgetSeconds, true)).toBe(false)
    expect(shouldFireExpire(601, budgetSeconds, true)).toBe(false)
    expect(shouldFireExpire(1200, budgetSeconds, true)).toBe(false)
  })

  it("allows expire again after a new cycle (hasFiredThisCycle reset)", () => {
    const budgetSeconds = 600
    expect(shouldFireExpire(600, budgetSeconds, true)).toBe(false)
    // reset() clears hasFiredThisCycle → next cycle can fire once
    expect(shouldFireExpire(0, budgetSeconds, false)).toBe(false)
    expect(shouldFireExpire(600, budgetSeconds, false)).toBe(true)
  })
})
