import { describe, expect, it } from "vitest"
import { IR_WORKSPACE_PANEL_TYPE } from "./panelTypes"
import { registerIRWorkspacePanel, unregisterIRWorkspacePanel } from "./panelRegistration"

describe("panels registry", () => {
  it("should register IR_WORKSPACE_PANEL_TYPE when orca.panels is available", () => {
    let registerCall: [string, any] | null = null
    let unregisterCall: string | null = null

    function handleRegister(type: string, renderer: any) {
      registerCall = [type, renderer]
    }
    function handleUnregister(type: string) {
      unregisterCall = type
    }

    const registry = {
      registerPanel: handleRegister,
      unregisterPanel: handleUnregister
    }
    const renderer = () => null

    registerIRWorkspacePanel(registry, renderer)
    expect(registerCall && registerCall[0]).toBe(IR_WORKSPACE_PANEL_TYPE)
    expect(registerCall && registerCall[1]).toBe(renderer)

    unregisterIRWorkspacePanel(registry)
    expect(unregisterCall).toBe(IR_WORKSPACE_PANEL_TYPE)
  })
})
