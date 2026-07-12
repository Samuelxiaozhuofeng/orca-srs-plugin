import { describe, expect, it } from "vitest"
import {
  buildActionFailure,
  buildActionSuccess,
  describePrimaryActions,
  resolveItemizeFailure,
  resolveSessionItemizeIntercept,
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

describe("resolveSessionItemizeIntercept", () => {
  const sessionPanelId = "ir-panel-1"
  const topicId = 100
  const extractId = 200

  it("intercepts Topic when target is the current Topic block", () => {
    expect(resolveSessionItemizeIntercept({
      sessionPanelId,
      eventPanelId: sessionPanelId,
      currentCardId: topicId,
      currentCardType: "topic",
      targetBlockId: topicId
    })).toEqual({ handle: true, kind: "topic_block" })
  })

  it("intercepts Extract queue card when target matches current Extract", () => {
    expect(resolveSessionItemizeIntercept({
      sessionPanelId,
      eventPanelId: sessionPanelId,
      currentCardId: extractId,
      currentCardType: "extracts",
      targetBlockId: extractId
    })).toEqual({ handle: true, kind: "extract_block" })
  })

  it("does not intercept when Topic queue card but target is child Extract", () => {
    expect(resolveSessionItemizeIntercept({
      sessionPanelId,
      eventPanelId: sessionPanelId,
      currentCardId: topicId,
      currentCardType: "topic",
      targetBlockId: extractId
    })).toEqual({ handle: false })
  })

  it("does not intercept when panelId mismatches", () => {
    expect(resolveSessionItemizeIntercept({
      sessionPanelId,
      eventPanelId: "other-panel",
      currentCardId: topicId,
      currentCardType: "topic",
      targetBlockId: topicId
    })).toEqual({ handle: false })
  })

  it("does not intercept ordinary blocks outside the current queue card", () => {
    expect(resolveSessionItemizeIntercept({
      sessionPanelId,
      eventPanelId: sessionPanelId,
      currentCardId: topicId,
      currentCardType: "topic",
      targetBlockId: 999
    })).toEqual({ handle: false })
  })

  it("does not intercept when targetBlockId is missing", () => {
    expect(resolveSessionItemizeIntercept({
      sessionPanelId,
      eventPanelId: sessionPanelId,
      currentCardId: extractId,
      currentCardType: "extracts",
      targetBlockId: undefined
    })).toEqual({ handle: false })
  })

  it("itemize failure contract still preserves extract and IR state", () => {
    const result = resolveItemizeFailure(true, true, "conversion failed")
    expect(result.ok).toBe(false)
    expect(result.preserveExtract).toBe(true)
    expect(result.leavesCard).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("conversion failed")
    }
  })
})
