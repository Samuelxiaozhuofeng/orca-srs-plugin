import { describe, expect, it } from "vitest"
import { formatExtractCreatedScheduleMessage } from "./irSessionCompleteCopy"

describe("formatExtractCreatedScheduleMessage", () => {
  const now = new Date(2026, 6, 23, 12, 0, 0)

  it("uses conservative copy when due is missing", () => {
    expect(formatExtractCreatedScheduleMessage(null, now)).toContain("将按阅读节奏")
    expect(formatExtractCreatedScheduleMessage(undefined, now)).toContain("将按阅读节奏")
  })

  it("mentions near-term queue when due is very soon", () => {
    const due = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    expect(formatExtractCreatedScheduleMessage(due, now)).toContain("很快")
    expect(formatExtractCreatedScheduleMessage(due, now)).toContain("错开")
  })

  it("formats a day range for farther due dates", () => {
    const due = new Date(now.getTime() + 4.2 * 24 * 60 * 60 * 1000)
    const msg = formatExtractCreatedScheduleMessage(due, now)
    expect(msg).toMatch(/大约 4/)
    expect(msg).toContain("错开")
  })
})
