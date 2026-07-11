import { describe, expect, it } from "vitest"
import { findPanelIdByView } from "./panelTreeUtils"

describe("findPanelIdByView", () => {
  it("finds a custom view inside a nested panel tree", () => {
    const panels = {
      id: "root",
      children: [
        { id: "journal", view: "journal" },
        {
          id: "column",
          children: [{ id: "ir-panel", view: "srs.ir-workspace" }]
        }
      ]
    }

    expect(findPanelIdByView(panels, "srs.ir-workspace")).toBe("ir-panel")
  })

  it("returns null when the view is absent", () => {
    expect(findPanelIdByView({ id: "root", children: [] }, "srs.ir-workspace")).toBeNull()
  })
})
