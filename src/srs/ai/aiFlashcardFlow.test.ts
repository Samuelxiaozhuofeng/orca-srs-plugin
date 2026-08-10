import { afterEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import { clearAISettingsCache } from "./aiSettingsSchema"

;(globalThis as any).window = (globalThis as any).window ?? {}
;(globalThis as any).window.Valtio = { proxy: <T,>(value: T) => value }

describe("startAIFlashcardFlow missing configuration", () => {
  afterEach(() => {
    clearAISettingsCache()
    vi.resetModules()
    vi.doUnmock("./aiServiceSettingsState")
    delete (globalThis as any).orca
  })

  it("opens connection settings instead of the generation dialog", async () => {
    const openAIServiceSettings = vi.fn(async () => undefined)
    vi.doMock("./aiServiceSettingsState", () => ({ openAIServiceSettings }))
    ;(globalThis as any).orca = {
      notify: vi.fn(),
      state: {
        blocks: {},
        plugins: { "orca-srs": { settings: { "ai.apiKey": "" } } }
      }
    }
    clearAISettingsCache()
    const { aiDialogState } = await import("./aiDialogState")
    const { startAIFlashcardFlow } = await import("./aiFlashcardFlow")

    await startAIFlashcardFlow(
      {
        anchor: { blockId: 1 },
        focus: { blockId: 1 }
      } as CursorData,
      "orca-srs"
    )

    expect(openAIServiceSettings).toHaveBeenCalledWith("orca-srs")
    expect(aiDialogState.isOpen).toBe(false)
    expect((globalThis as any).orca.notify).not.toHaveBeenCalled()
  })
})
