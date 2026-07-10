import { describe, expect, it } from "vitest"
import { calculateElapsedSeconds } from "./irSessionTimerUtils"

describe("IR session timer", () => {
  it("calculates elapsed seconds from the current reset origin", () => {
    expect(calculateElapsedSeconds(10_000, 12_999)).toBe(2)
    expect(calculateElapsedSeconds(20_000, 19_000)).toBe(0)
  })
})
