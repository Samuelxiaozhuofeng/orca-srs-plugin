import { describe, expect, it } from "vitest"
import { parseIRWorkspacePanelArgs } from "./panelViewArgs"

describe("parseIRWorkspacePanelArgs", () => {
  it("reads a valid workspace mode and plugin name", () => {
    expect(parseIRWorkspacePanelArgs({ mode: "reading", pluginName: "orca-srs" })).toEqual({
      mode: "reading",
      pluginName: "orca-srs"
    })
  })

  it("uses safe defaults for invalid arguments", () => {
    expect(parseIRWorkspacePanelArgs({ mode: "unknown", pluginName: "" })).toEqual({
      mode: "library",
      pluginName: null
    })
  })
})
