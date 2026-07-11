import { afterEach, describe, expect, it, vi } from "vitest"
import {
  consumePendingIRWorkspaceMode,
  setPendingIRWorkspaceMode,
  setPendingIRWorkspaceModeForBlock
} from "../../components/incremental-reading/workspace/irWorkspaceLaunch"
import { openIRWorkspaceWithDeps, type OpenIRWorkspaceDeps } from "./irWorkspacePanelLaunch"

function createDeps(overrides: Partial<OpenIRWorkspaceDeps> = {}): OpenIRWorkspaceDeps {
  return {
    getSessionBlockId: vi.fn(async () => 42),
    getActivePanelId: () => "panel-main",
    getPanels: () => ({ id: "root", children: [] }),
    nav: {
      goTo: vi.fn(),
      addTo: vi.fn(() => "panel-right"),
      switchFocusTo: vi.fn()
    },
    notify: vi.fn(),
    ...overrides
  }
}

describe("openIRWorkspaceWithDeps", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("opens a new block panel in the current panel with reading mode", async () => {
    const deps = createDeps()

    await openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "reading",
      openInCurrentPanel: true
    })

    expect(deps.nav.goTo).toHaveBeenCalledWith("block", { blockId: 42 }, "panel-main")
    expect(consumePendingIRWorkspaceMode("panel-main", 42, "library")).toBe("reading")
    expect(deps.notify).toHaveBeenCalledWith(
      "success",
      "渐进阅读面板已打开",
      { title: "渐进阅读" }
    )
  })

  it("opens a new block panel in the current panel with library mode", async () => {
    const deps = createDeps()

    await openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "library",
      openInCurrentPanel: true
    })

    expect(deps.nav.goTo).toHaveBeenCalledWith("block", { blockId: 42 }, "panel-main")
    expect(consumePendingIRWorkspaceMode("panel-main", 42, "reading")).toBe("library")
  })

  it("clears the panel launch intent when current-panel navigation throws", async () => {
    const deps = createDeps({
      nav: {
        goTo: vi.fn(() => { throw new Error("navigation failed") }),
        addTo: vi.fn(() => "panel-right"),
        switchFocusTo: vi.fn()
      }
    })

    await expect(openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "reading",
      openInCurrentPanel: true
    })).rejects.toThrow("navigation failed")

    expect(consumePendingIRWorkspaceMode("panel-main", 42, "library")).toBe("library")
  })

  it("creates a right-side block panel with the session block id", async () => {
    const deps = createDeps()

    await openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "reading"
    })

    expect(deps.nav.addTo).toHaveBeenCalledWith("panel-main", "right", {
      view: "block",
      viewArgs: { blockId: 42 },
      viewState: {}
    })
    expect(consumePendingIRWorkspaceMode("panel-other", 42, "library")).toBe("library")
    expect(consumePendingIRWorkspaceMode("panel-right", 42, "library")).toBe("reading")
    expect(deps.nav.switchFocusTo).toHaveBeenCalledWith("panel-right")
  })

  it("does not replace an unrelated right-side block panel", async () => {
    const deps = createDeps({
      getPanels: () => ({
        id: "root",
        children: [
          { id: "panel-main", view: "journal" },
          { id: "panel-notes", view: "block", viewArgs: { blockId: 99 } }
        ]
      })
    })

    await openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "reading"
    })

    expect(deps.nav.addTo).toHaveBeenCalledWith("panel-main", "right", {
      view: "block",
      viewArgs: { blockId: 42 },
      viewState: {}
    })
    expect(deps.nav.goTo).not.toHaveBeenCalled()
    expect(consumePendingIRWorkspaceMode("panel-right", 42, "library")).toBe("reading")
    expect(deps.nav.switchFocusTo).toHaveBeenCalledWith("panel-right")
  })

  it("clears the block launch intent when creating the right panel fails", async () => {
    const deps = createDeps({
      nav: {
        goTo: vi.fn(),
        addTo: vi.fn(() => null),
        switchFocusTo: vi.fn()
      }
    })

    await openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "reading"
    })

    expect(consumePendingIRWorkspaceMode("panel-later", 42, "library")).toBe("library")
    expect(deps.nav.switchFocusTo).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalledWith(
      "error",
      "无法创建侧边面板",
      { title: "渐进阅读" }
    )
  })

  it("clears the block launch intent when creating the right panel throws", async () => {
    const deps = createDeps({
      nav: {
        goTo: vi.fn(),
        addTo: vi.fn(() => { throw new Error("panel creation failed") }),
        switchFocusTo: vi.fn()
      }
    })

    await expect(openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "reading"
    })).rejects.toThrow("panel creation failed")

    expect(consumePendingIRWorkspaceMode("panel-later", 42, "library")).toBe("library")
  })

  it("focuses and dispatches mode when the session block panel already exists", async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal("window", { dispatchEvent })
    vi.stubGlobal("CustomEvent", class {
      detail: unknown
      constructor(_type: string, init: { detail: unknown }) {
        this.detail = init.detail
      }
    })

    const deps = createDeps({
      getPanels: () => ({
        id: "root",
        children: [{
          id: "column",
          children: [{ id: "panel-existing", view: "block", viewArgs: { blockId: 42 } }]
        }]
      })
    })

    await openIRWorkspaceWithDeps(deps, {
      pluginName: "test-plugin",
      mode: "library"
    })

    expect(deps.nav.goTo).not.toHaveBeenCalled()
    expect(deps.nav.addTo).not.toHaveBeenCalled()
    expect(deps.nav.switchFocusTo).toHaveBeenCalledWith("panel-existing")
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect((dispatchEvent.mock.calls[0][0] as { detail: { panelId: string; mode: string } }).detail)
      .toEqual({ panelId: "panel-existing", mode: "library" })
  })

  it("does not leak pending mode intent across different panel ids", async () => {
    setPendingIRWorkspaceMode("panel-a", "reading")
    setPendingIRWorkspaceModeForBlock(42, "library")

    expect(consumePendingIRWorkspaceMode("panel-a", 42, "library")).toBe("reading")
    expect(consumePendingIRWorkspaceMode("panel-b", 42, "reading")).toBe("reading")
  })
})
