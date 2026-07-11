import { beforeEach, describe, expect, it } from "vitest"
import {
  consumePendingIRWorkspaceMode,
  setPendingIRWorkspaceMode
} from "./irWorkspaceLaunch"

describe("irWorkspaceLaunch", () => {
  beforeEach(() => {
    consumePendingIRWorkspaceMode("panel-a", undefined, "library")
    consumePendingIRWorkspaceMode("panel-b", undefined, "library")
  })

  it("consumes a panel-specific launch mode once", () => {
    setPendingIRWorkspaceMode("panel-a", "reading")

    expect(consumePendingIRWorkspaceMode("panel-a", undefined, "library")).toBe("reading")
    expect(consumePendingIRWorkspaceMode("panel-a", undefined, "library")).toBe("library")
  })

  it("does not leak launch intent between panels", () => {
    setPendingIRWorkspaceMode("panel-a", "reading")

    expect(consumePendingIRWorkspaceMode("panel-b", undefined, "library")).toBe("library")
    expect(consumePendingIRWorkspaceMode("panel-a", undefined, "library")).toBe("reading")
  })
})