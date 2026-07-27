import { describe, expect, it } from "vitest"
import { calculateElapsedSeconds, formatElapsedLabel } from "./irSessionTimerUtils"

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
})
