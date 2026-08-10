import { afterEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import { clearAISettingsCache } from "./aiSettingsSchema"

;(globalThis as any).window = (globalThis as any).window ?? {}
;(globalThis as any).window.Valtio = { proxy: <T,>(value: T) => value }

const PLUGIN = "orca-srs"

function makeCursor(options: {
  anchorIndex?: number
  anchorOffset: number
  focusIndex?: number
  focusOffset: number
}): CursorData {
  const anchorIndex = options.anchorIndex ?? 0
  return {
    isForward: true,
    panelId: "panel-1",
    rootBlockId: 1,
    anchor: {
      blockId: 1,
      isInline: true,
      index: anchorIndex,
      offset: options.anchorOffset
    },
    focus: {
      blockId: 1,
      isInline: true,
      index: options.focusIndex ?? anchorIndex,
      offset: options.focusOffset
    }
  }
}

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

describe("startAIFlashcardFlow source selection", () => {
  afterEach(() => {
    clearAISettingsCache()
    vi.resetModules()
    delete (globalThis as any).orca
  })

  function installOrca(blocks: Record<number, any>) {
    const invokeBackend = vi.fn(async (_command: string, blockId: number) =>
      blocks[blockId] ?? null
    )
    ;(globalThis as any).orca = {
      invokeBackend,
      notify: vi.fn(),
      state: {
        blocks,
        plugins: {
          [PLUGIN]: { settings: { "ai.apiKey": "test-key" } }
        }
      }
    }
    clearAISettingsCache()
    return invokeBackend
  }

  it("uses only a single-fragment partial selection", async () => {
    const invokeBackend = installOrca({
      1: {
        id: 1,
        children: [],
        text: "Alpha selected omega",
        content: [{ t: "t", v: "Alpha selected omega" }]
      }
    })
    const { aiDialogState } = await import("./aiDialogState")
    const { startAIFlashcardFlow } = await import("./aiFlashcardFlow")

    await startAIFlashcardFlow(
      makeCursor({ anchorOffset: 6, focusOffset: 14 }),
      PLUGIN
    )

    expect(aiDialogState.sourceText).toBe("selected")
    expect(aiDialogState.sourceBlockId).toBe(1)
    expect(invokeBackend).not.toHaveBeenCalled()
  })

  it("uses only a same-block selection spanning styled fragments", async () => {
    const invokeBackend = installOrca({
      1: {
        id: 1,
        children: [],
        text: "Alpha Beta Gamma",
        content: [
          { t: "t", v: "Alpha " },
          { t: "t", v: "Beta", f: "b" },
          { t: "t", v: " Gamma" }
        ]
      }
    })
    const { aiDialogState } = await import("./aiDialogState")
    const { startAIFlashcardFlow } = await import("./aiFlashcardFlow")

    await startAIFlashcardFlow(
      makeCursor({
        anchorIndex: 0,
        anchorOffset: 6,
        focusIndex: 2,
        focusOffset: 6
      }),
      PLUGIN
    )

    expect(aiDialogState.sourceText).toBe("Beta Gamma")
    expect(aiDialogState.sourceBlockId).toBe(1)
    expect(invokeBackend).not.toHaveBeenCalled()
  })

  it("keeps full block plus bounded subtree for a collapsed cursor", async () => {
    const blocks = {
      1: {
        id: 1,
        children: [2],
        text: "Parent",
        content: [{ t: "t", v: "Parent" }]
      },
      2: {
        id: 2,
        parent: 1,
        children: [],
        text: "Child",
        content: [{ t: "t", v: "Child" }]
      }
    }
    const invokeBackend = installOrca(blocks)
    const { aiDialogState } = await import("./aiDialogState")
    const { startAIFlashcardFlow } = await import("./aiFlashcardFlow")

    await startAIFlashcardFlow(
      makeCursor({ anchorOffset: 3, focusOffset: 3 }),
      PLUGIN
    )

    expect(aiDialogState.sourceText).toBe("Parent\n  Child")
    expect(aiDialogState.sourceBlockId).toBe(1)
    expect(invokeBackend).toHaveBeenCalledWith("get-block", 1)
  })
})
