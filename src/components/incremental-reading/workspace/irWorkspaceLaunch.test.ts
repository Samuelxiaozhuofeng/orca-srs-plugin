import { beforeEach, describe, expect, it } from "vitest"
import {
  consumePendingIRWorkspaceMode,
  setPendingIRWorkspaceMode
} from "./irWorkspaceLaunch"

describe("irWorkspaceLaunch", () => {
  beforeEach(() => {
    consumePendingIRWorkspaceMode("panel-a", "library")
    consumePendingIRWorkspaceMode("panel-b", "library")
  })

  it("consumes a panel-specific launch mode once", () => {
    setPendingIRWorkspaceMode("panel-a", "reading")

    expect(consumePendingIRWorkspaceMode("panel-a", "library")).toBe("reading")
    expect(consumePendingIRWorkspaceMode("panel-a", "library")).toBe("library")
  })

  it("does not leak launch intent between panels", () => {
    setPendingIRWorkspaceMode("panel-a", "reading")

    expect(consumePendingIRWorkspaceMode("panel-b", "library")).toBe("library")
    expect(consumePendingIRWorkspaceMode("panel-a", "library")).toBe("reading")
  })
})
