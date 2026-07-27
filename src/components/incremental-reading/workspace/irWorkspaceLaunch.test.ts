import { beforeEach, describe, expect, it } from "vitest"
import {
  consumePendingIRWorkspaceLaunch,
  consumePendingIRWorkspaceMode,
  setPendingIRWorkspaceLaunch,
  setPendingIRWorkspaceMode
} from "./irWorkspaceLaunch"

describe("irWorkspaceLaunch", () => {
  beforeEach(() => {
    consumePendingIRWorkspaceMode("panel-a", undefined, "library")
    consumePendingIRWorkspaceMode("panel-b", undefined, "library")
  })

  it("consumes a panel-specific launch mode once (legacy mode API)", () => {
    setPendingIRWorkspaceMode("panel-a", "reading")

    expect(consumePendingIRWorkspaceMode("panel-a", undefined, "library")).toBe("reading")
    expect(consumePendingIRWorkspaceMode("panel-a", undefined, "library")).toBe("library")
  })

  it("does not leak launch intent between panels", () => {
    setPendingIRWorkspaceMode("panel-a", "reading")

    expect(consumePendingIRWorkspaceMode("panel-b", undefined, "library")).toBe("library")
    expect(consumePendingIRWorkspaceMode("panel-a", undefined, "library")).toBe("reading")
  })

  it("passes and one-shot consumes autoStart + mixed", () => {
    setPendingIRWorkspaceLaunch("panel-a", {
      mode: "reading",
      autoStart: true,
      sessionLaunchMode: "mixed"
    })

    const first = consumePendingIRWorkspaceLaunch("panel-a", undefined, "library")
    expect(first).toEqual({
      mode: "reading",
      autoStart: true,
      sessionLaunchMode: "mixed"
    })
    const second = consumePendingIRWorkspaceLaunch("panel-a", undefined, "library")
    expect(second).toEqual({ mode: "library" })
    expect(second.autoStart).toBeUndefined()
  })
})