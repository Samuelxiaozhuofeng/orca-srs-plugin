import { describe, expect, it } from "vitest"
import { findPanelIdByBlockView } from "./panelTreeUtils"

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
