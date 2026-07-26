import { beforeEach, describe, expect, it, vi } from "vitest"

const assign = vi.fn(async () => undefined)
const getData = vi.fn(async (): Promise<unknown> => null)
const setData = vi.fn(async () => undefined)

// @ts-expect-error focused Orca shortcut API mock
globalThis.orca = {
  state: { shortcuts: {} },
  shortcuts: { assign },
  plugins: { getData, setData }
}

import {
  IR_SHORTCUT_DEFAULTS_SEEDED_DATA_KEY,
  registerIRDefaultShortcuts
} from "./irShortcutsRegistry"

describe("IR default shortcut registration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orca.state.shortcuts = {}
    getData.mockResolvedValue(null)
  })

  it("seeds all defaults on first load and marks seeding done", async () => {
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).toHaveBeenCalledWith("alt+x", "orca-srs.createExtract")
    expect(assign).toHaveBeenCalledWith("alt+z", "orca-srs.createCloze")
    expect(assign).toHaveBeenCalledWith("alt+r", "orca-srs.irToggleViewMode")
    expect(setData).toHaveBeenCalledWith(
      "orca-srs",
      IR_SHORTCUT_DEFAULTS_SEEDED_DATA_KEY,
      "1"
    )
  })

  it("does not recreate a default when the command was rebound", async () => {
    orca.state.shortcuts = { "ctrl+x": "orca-srs.createExtract" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+x", "orca-srs.createExtract")
    expect(assign).toHaveBeenCalledWith("alt+z", "orca-srs.createCloze")
    expect(assign).toHaveBeenCalledWith("alt+r", "orca-srs.irToggleViewMode")
  })

  it("never overwrites an occupied default shortcut", async () => {
    orca.state.shortcuts = { "alt+x": "other-plugin.command" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+x", "orca-srs.createExtract")
  })

  it("preserves a user-rebound reading mode command", async () => {
    orca.state.shortcuts = { "ctrl+shift+r": "orca-srs.irToggleViewMode" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+r", "orca-srs.irToggleViewMode")
  })

  it("does not overwrite Alt+R when another command already uses it", async () => {
    orca.state.shortcuts = { "alt+r": "other-plugin.command" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+r", "orca-srs.irToggleViewMode")
  })

  it("does not re-seed after the seeded flag is set (user unbind survives reloads)", async () => {
    getData.mockResolvedValue("1")
    // 用户已解绑全部默认键：shortcuts 为空，但已播种过 → 不得写回
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalled()
    expect(setData).not.toHaveBeenCalled()
  })

  it("still cleans up stale Enter bindings even when already seeded", async () => {
    getData.mockResolvedValue("1")
    orca.state.shortcuts = { enter: "orca-srs.irSessionNext" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(assign).toHaveBeenCalledWith("", "orca-srs.irSessionNext")
    expect(assign).not.toHaveBeenCalledWith("alt+x", "orca-srs.createExtract")
  })

  it("skips seeding conservatively when the seed flag cannot be read", async () => {
    getData.mockRejectedValue(new Error("data backend unavailable"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      await registerIRDefaultShortcuts("orca-srs")
      // 无法排除「用户已解绑」→ 不 assign、不写标记，错误保持可见
      expect(assign).not.toHaveBeenCalled()
      expect(setData).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it("marks seeding done even when some defaults were skipped as occupied", async () => {
    orca.state.shortcuts = { "alt+x": "other-plugin.command" }
    await registerIRDefaultShortcuts("orca-srs")
    expect(setData).toHaveBeenCalledWith(
      "orca-srs",
      IR_SHORTCUT_DEFAULTS_SEEDED_DATA_KEY,
      "1"
    )
  })
})
