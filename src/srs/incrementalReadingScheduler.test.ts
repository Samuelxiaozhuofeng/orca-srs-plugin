import { describe, expect, it, vi } from "vitest"
import {
  calculateNextDue,
  getBaseIntervalDays,
  getPostponeDays,
  normalizePriority
} from "./incrementalReadingScheduler"

describe("incrementalReadingScheduler", () => {
  it("should normalize priority to 0-100", () => {
    expect(normalizePriority(Number.NaN)).toBe(50)
    expect(normalizePriority(-10)).toBe(0)
    expect(normalizePriority(0)).toBe(0)
    expect(normalizePriority(50.4)).toBe(50)
    expect(normalizePriority(100)).toBe(100)
    expect(normalizePriority(101)).toBe(100)
  })

  it("should map priority to base interval days", () => {
    expect(getBaseIntervalDays("topic", 0)).toBe(14)
    expect(getBaseIntervalDays("topic", 100)).toBe(2)
    expect(getBaseIntervalDays("extracts", 0)).toBe(7)
    expect(getBaseIntervalDays("extracts", 100)).toBe(1)
  })

  it("should calculate next due based on base date (deterministic with mocked random)", () => {
    const spy = vi.spyOn(Math, "random")
    spy.mockReturnValue(0)

    const baseDate = new Date("2025-01-01T00:00:00Z")
    const due = calculateNextDue("extracts", 100, baseDate)
    expect(due.toISOString().startsWith("2025-01-02")).toBe(true)

    spy.mockRestore()
  })

  it("should randomize postpone days within expected range", () => {
    const spy = vi.spyOn(Math, "random")

    spy.mockReturnValue(0)
    expect(getPostponeDays("topic", 0)).toBe(7)
    expect(getPostponeDays("extracts", 100)).toBe(1)

    spy.mockReturnValue(0.999)
    expect(getPostponeDays("topic", 0)).toBe(14)
    expect(getPostponeDays("extracts", 0)).toBe(10)

    spy.mockRestore()
  })
})
