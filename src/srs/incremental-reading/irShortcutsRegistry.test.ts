import { beforeEach, describe, expect, it, vi } from "vitest"

const assign = vi.fn(async () => undefined)

// @ts-expect-error focused Orca shortcut API mock
globalThis.orca = {
  state: { shortcuts: {} },
  shortcuts: { assign }
}

import { registerIRDefaultShortcuts } from "./irShortcutsRegistry"

describe("IR default shortcut registration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orca.state.shortcuts = {}
  })

  it("does not recreate a default when the command was rebound", async () => {
    orca.state.shortcuts = { "ctrl+x": "orca-srs.createExtract" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+x", "orca-srs.createExtract")
    expect(assign).toHaveBeenCalledWith("alt+z", "orca-srs.createCloze")
  })

  it("never overwrites an occupied default shortcut", async () => {
    orca.state.shortcuts = { "alt+x": "other-plugin.command" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+x", "orca-srs.createExtract")
  })
})
