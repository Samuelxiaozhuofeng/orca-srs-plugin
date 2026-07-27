import { describe, expect, it } from "vitest"
import { decideTodayLearningLaunch } from "./todayLearningLaunch"

describe("decideTodayLearningLaunch", () => {
  it("opens mixed when both sides are exact and at least one is positive", () => {
    expect(decideTodayLearningLaunch({ ir: 3, srs: 2 })).toEqual({ kind: "mixed" })
    expect(decideTodayLearningLaunch({ ir: 0, srs: 5 })).toEqual({ kind: "mixed" })
    expect(decideTodayLearningLaunch({ ir: 4, srs: 0 })).toEqual({ kind: "mixed" })
  })

  it("uses independent SRS when only SRS is trusted and positive", () => {
    expect(decideTodayLearningLaunch({ ir: null, srs: 5 })).toEqual({
      kind: "srs-independent"
    })
  })

  it("uses IR read-only when only IR is trusted and positive", () => {
    expect(decideTodayLearningLaunch({ ir: 3, srs: null })).toEqual({
      kind: "ir-read-only"
    })
  })

  it("does not launch when there is no trusted positive task", () => {
    expect(decideTodayLearningLaunch({ ir: 0, srs: 0 })).toEqual({ kind: "none" })
    expect(decideTodayLearningLaunch({ ir: null, srs: null })).toEqual({ kind: "none" })
    expect(decideTodayLearningLaunch({ ir: null, srs: 0 })).toEqual({ kind: "none" })
    expect(decideTodayLearningLaunch({ ir: 0, srs: null })).toEqual({ kind: "none" })
  })
})
