import { afterEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import { clearAISettingsCache } from "./aiSettingsSchema"

describe("startAIQuickInteractFlow missing configuration", () => {
  afterEach(() => {
    clearAISettingsCache()
    vi.resetModules()
    vi.doUnmock("./aiDialogState")
    vi.doUnmock("./aiQuickInteractState")
    vi.doUnmock("./aiServiceSettingsState")
    delete (globalThis as any).orca
  })

  it("opens connection settings without opening the interaction dialog", async () => {
    const openAIQuickInteract = vi.fn()
    const openAIServiceSettings = vi.fn(async () => undefined)
    vi.doMock("./aiDialogState", () => ({
      isAIDialogBusyOrInReview: () => false
    }))
    vi.doMock("./aiQuickInteractState", () => ({
      isAIQuickInteractOpen: () => false,
      openAIQuickInteract
    }))
    vi.doMock("./aiServiceSettingsState", () => ({ openAIServiceSettings }))
    ;(globalThis as any).orca = {
      notify: vi.fn(),
      state: {
        blocks: {},
        plugins: { "orca-srs": { settings: { "ai.apiKey": "" } } }
      }
    }
    clearAISettingsCache()
    const { startAIQuickInteractFlow } = await import("./aiQuickInteract")

    await startAIQuickInteractFlow(
      {
        anchor: { blockId: 1 },
        focus: { blockId: 1 }
      } as CursorData,
      "orca-srs",
      { mode: "custom" }
    )

    expect(openAIServiceSettings).toHaveBeenCalledWith("orca-srs")
    expect(openAIQuickInteract).not.toHaveBeenCalled()
    expect((globalThis as any).orca.notify).not.toHaveBeenCalled()
  })
})
