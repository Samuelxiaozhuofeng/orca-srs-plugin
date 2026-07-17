import { describe, expect, it } from "vitest"
import {
  findPanelIdByBlockView,
  isPanelMainBlockView,
  shouldInvokePanelWideViewToggle,
  shouldManageHostEditorChrome
} from "./panelTreeUtils"

describe("findPanelIdByBlockView", () => {
  it("finds a block view inside a nested panel tree", () => {
    const panels = {
      id: "root",
      children: [
        { id: "journal", view: "journal" },
        {
          id: "column",
          children: [{ id: "ir-panel", view: "block", viewArgs: { blockId: 42 } }]
        }
      ]
    }

    expect(findPanelIdByBlockView(panels, 42)).toBe("ir-panel")
  })

  it("returns null when the block view is absent", () => {
    const panels = {
      id: "root",
      children: [{ id: "other", view: "block", viewArgs: { blockId: 99 } }]
    }

    expect(findPanelIdByBlockView(panels, 42)).toBeNull()
  })

  it("does not match non-block views with the same blockId", () => {
    const panels = {
      id: "root",
      children: [{ id: "journal", view: "journal", viewArgs: { blockId: 42 } }]
    }

    expect(findPanelIdByBlockView(panels, 42)).toBeNull()
  })
})

describe("isPanelMainBlockView", () => {
  it("returns true when panel view is block and viewArgs.blockId matches", () => {
    expect(
      isPanelMainBlockView(
        { id: "review-panel", view: "block", viewArgs: { blockId: 14878 } },
        14878
      )
    ).toBe(true)
  })

  it("returns false for null/undefined panel", () => {
    expect(isPanelMainBlockView(null, 14878)).toBe(false)
    expect(isPanelMainBlockView(undefined, 14878)).toBe(false)
  })

  it("returns false when view is not block (e.g. Journal embedding host)", () => {
    // Journal「当日创建的」embeds srs.review-session; outer panel is still journal
    expect(
      isPanelMainBlockView(
        { id: "journal-panel", view: "journal", viewArgs: { date: "2026-07-13" } },
        14878
      )
    ).toBe(false)
  })

  it("returns false when blockId does not match panel main view", () => {
    expect(
      isPanelMainBlockView(
        { id: "page-panel", view: "block", viewArgs: { blockId: 100 } },
        14878
      )
    ).toBe(false)
  })

  it("returns false when viewArgs.blockId is missing", () => {
    expect(
      isPanelMainBlockView({ id: "panel", view: "block", viewArgs: {} }, 14878)
    ).toBe(false)
    expect(
      isPanelMainBlockView({ id: "panel", view: "block" }, 14878)
    ).toBe(false)
  })
})

describe("shouldManageHostEditorChrome", () => {
  const reviewBlockId = 14878
  const reviewPanel = {
    id: "side-review",
    view: "block" as const,
    viewArgs: { blockId: reviewBlockId }
  }

  it("allows host chrome only for the panel whose main view is the review session block", () => {
    expect(
      shouldManageHostEditorChrome(reviewPanel, "side-review", reviewBlockId)
    ).toBe(true)
  })

  it("denies host chrome when panelId is missing", () => {
    expect(shouldManageHostEditorChrome(reviewPanel, undefined, reviewBlockId)).toBe(false)
    expect(shouldManageHostEditorChrome(reviewPanel, null, reviewBlockId)).toBe(false)
    expect(shouldManageHostEditorChrome(reviewPanel, "", reviewBlockId)).toBe(false)
  })

  it("denies host chrome when panel lookup returned null (not found)", () => {
    expect(shouldManageHostEditorChrome(null, "side-review", reviewBlockId)).toBe(false)
  })

  it("denies host chrome when looked-up panel id does not match panelId", () => {
    expect(
      shouldManageHostEditorChrome(reviewPanel, "other-panel", reviewBlockId)
    ).toBe(false)
  })

  it("denies host chrome when panel.id is missing (fail-closed)", () => {
    const panelWithoutId = {
      view: "block" as const,
      viewArgs: { blockId: reviewBlockId }
    }
    expect(
      shouldManageHostEditorChrome(panelWithoutId, "side-review", reviewBlockId)
    ).toBe(false)
  })

  it("denies host chrome for Journal panel even if panelId is present", () => {
    const journalPanel = {
      id: "journal-panel",
      view: "journal" as const,
      viewArgs: { date: "2026-07-13" }
    }
    expect(
      shouldManageHostEditorChrome(journalPanel, "journal-panel", reviewBlockId)
    ).toBe(false)
  })

  it("denies host chrome when main block is a different page that embeds the session", () => {
    // Review session appears inside page block 100 as query/ref embed
    const pagePanel = {
      id: "page-panel",
      view: "block" as const,
      viewArgs: { blockId: 100 }
    }
    expect(
      shouldManageHostEditorChrome(pagePanel, "page-panel", reviewBlockId)
    ).toBe(false)
  })
})

describe("shouldInvokePanelWideViewToggle", () => {
  it("invokes only when host chrome is allowed and panel is not already wide", () => {
    expect(shouldInvokePanelWideViewToggle(true, undefined, false)).toBe(true)
    expect(shouldInvokePanelWideViewToggle(true, false, false)).toBe(true)
  })

  it("does not invoke when panel.wide is already true (would narrow on toggle)", () => {
    expect(shouldInvokePanelWideViewToggle(true, true, false)).toBe(false)
  })

  it("does not invoke when host chrome management is denied (fail-closed)", () => {
    expect(shouldInvokePanelWideViewToggle(false, false, false)).toBe(false)
    expect(shouldInvokePanelWideViewToggle(false, undefined, false)).toBe(false)
  })

  it("does not invoke again during the same mount after already attempted", () => {
    expect(shouldInvokePanelWideViewToggle(true, false, true)).toBe(false)
    expect(shouldInvokePanelWideViewToggle(true, undefined, true)).toBe(false)
  })
})
