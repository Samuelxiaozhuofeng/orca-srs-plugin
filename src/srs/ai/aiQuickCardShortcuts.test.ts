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
  QUICK_CARD_SHORTCUTS_SEEDED_DATA_KEY,
  registerQuickCardDefaultShortcuts
} from "./aiQuickCardShortcuts"

describe("quick-card default shortcut registration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orca.state.shortcuts = {}
    getData.mockResolvedValue(null)
  })

  it("seeds the auto command default on first load and marks seeding done", async () => {
    await registerQuickCardDefaultShortcuts("orca-srs")
    expect(assign).toHaveBeenCalledWith("alt+c", "orca-srs.quickAutoCard")
    expect(setData).toHaveBeenCalledWith(
      "orca-srs",
      QUICK_CARD_SHORTCUTS_SEEDED_DATA_KEY,
      "1"
    )
  })

  it("does not recreate the default when the command was rebound", async () => {
    orca.state.shortcuts = { "ctrl+shift+c": "orca-srs.quickAutoCard" }
    await registerQuickCardDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+c", "orca-srs.quickAutoCard")
  })

  it("never overwrites an occupied default shortcut", async () => {
    orca.state.shortcuts = { "alt+c": "other-plugin.command" }
    await registerQuickCardDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalledWith("alt+c", "orca-srs.quickAutoCard")
  })

  it("does not re-seed after the flag is set (user unbind survives reloads)", async () => {
    getData.mockResolvedValue("1")
    await registerQuickCardDefaultShortcuts("orca-srs")
    expect(assign).not.toHaveBeenCalled()
    expect(setData).not.toHaveBeenCalled()
  })

  it("skips seeding conservatively when the flag cannot be read", async () => {
    getData.mockRejectedValue(new Error("data backend unavailable"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      await registerQuickCardDefaultShortcuts("orca-srs")
      expect(assign).not.toHaveBeenCalled()
      expect(setData).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it("marks seeding done even when the default was skipped as occupied", async () => {
    orca.state.shortcuts = { "alt+c": "other-plugin.command" }
    await registerQuickCardDefaultShortcuts("orca-srs")
    expect(setData).toHaveBeenCalledWith(
      "orca-srs",
      QUICK_CARD_SHORTCUTS_SEEDED_DATA_KEY,
      "1"
    )
  })
})
