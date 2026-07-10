import { describe, expect, it } from "vitest"
import {
  buildActionFailure,
  buildActionSuccess,
  describePrimaryActions,
  resolveItemizeFailure,
  shouldLeaveCardAfterAction
} from "./irSessionActionsLogic"

describe("IR session action baseline", () => {
  it("limits primary actions to at most three", () => {
    expect(describePrimaryActions("topic")).toHaveLength(3)
    expect(describePrimaryActions("extracts")).toHaveLength(3)
  })

  it("next/postpone/archive leave the card; extract does not", () => {
    expect(shouldLeaveCardAfterAction("next")).toBe(true)
    expect(shouldLeaveCardAfterAction("postpone")).toBe(true)
    expect(shouldLeaveCardAfterAction("archive")).toBe(true)
    expect(shouldLeaveCardAfterAction("extract")).toBe(false)
    expect(buildActionSuccess("extract").leavesCard).toBe(false)
  })

  it("itemize failure keeps extract and IR state intact contract", () => {
    const result = resolveItemizeFailure(true, true, "srs init failed")
    expect(result.ok).toBe(false)
    expect(result.leavesCard).toBe(false)
    expect(result.preserveExtract).toBe(true)
    if (!result.ok) {
      expect(result.error).toContain("srs init failed")
    }
  })

  it("action failure never leaves the card", () => {
    const result = buildActionFailure("next", "save breakpoint failed")
    expect(result.ok).toBe(false)
    expect(result.leavesCard).toBe(false)
  })
})
