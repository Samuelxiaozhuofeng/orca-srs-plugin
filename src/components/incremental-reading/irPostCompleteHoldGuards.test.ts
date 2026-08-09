import { describe, expect, it } from "vitest"
import { resolveIRSessionInteractionGuards } from "./irPostCompleteHoldGuards"

const base = {
  hasCurrentCard: true,
  showSummary: false,
  loadFailed: false,
  isReviewEntry: false,
  endGateOpen: false,
  completeChapterOpen: false,
  archiveConfirmOpen: false,
  chapterQuizConfirmOpen: false,
  postCompleteQuizHold: false,
  contextMode: "extract_focus"
}

describe("resolveIRSessionInteractionGuards", () => {
  it("normal reading: breakpoint, shortcuts, schedule actions all enabled", () => {
    const g = resolveIRSessionInteractionGuards(base)
    expect(g.breakpointEnabled).toBe(true)
    expect(g.allowCapture).toBe(true)
    expect(g.endZoneEnabled).toBe(true)
    expect(g.shortcutsEnabled).toBe(true)
    expect(g.scheduleActionsEnabled).toBe(true)
  })

  it("postCompleteQuizHold disables breakpoint capture, shortcuts, end zone, schedule actions", () => {
    const g = resolveIRSessionInteractionGuards({
      ...base,
      postCompleteQuizHold: true,
      chapterQuizConfirmOpen: true
    })
    expect(g.breakpointEnabled).toBe(false)
    expect(g.allowCapture).toBe(false)
    expect(g.endZoneEnabled).toBe(false)
    expect(g.shortcutsEnabled).toBe(false)
    expect(g.scheduleActionsEnabled).toBe(false)
  })

  it("chapterQuizConfirmOpen alone disables shortcuts but keeps schedule + breakpoint", () => {
    const g = resolveIRSessionInteractionGuards({
      ...base,
      chapterQuizConfirmOpen: true
    })
    expect(g.shortcutsEnabled).toBe(false)
    expect(g.breakpointEnabled).toBe(true)
    expect(g.allowCapture).toBe(true)
    expect(g.scheduleActionsEnabled).toBe(true)
  })

  it("chapter_browse already blocks allowCapture; hold still blocks enabled", () => {
    const g = resolveIRSessionInteractionGuards({
      ...base,
      contextMode: "chapter_browse",
      postCompleteQuizHold: true
    })
    expect(g.allowCapture).toBe(false)
    expect(g.breakpointEnabled).toBe(false)
  })
})

describe("IRSessionShell wires post-complete hold guards", () => {
  it("uses resolveIRSessionInteractionGuards for breakpoint and shortcuts", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const src = readFileSync(resolve(__dirname, "IRSessionShell.tsx"), "utf8")
    expect(src).toContain("resolveIRSessionInteractionGuards")
    expect(src).toContain("interactionGuards.breakpointEnabled")
    expect(src).toContain("interactionGuards.allowCapture")
    expect(src).toContain("interactionGuards.shortcutsEnabled")
    expect(src).toContain("interactionGuards.endZoneEnabled")
    expect(src).toContain("interactionGuards.scheduleActionsEnabled")
  })
})

