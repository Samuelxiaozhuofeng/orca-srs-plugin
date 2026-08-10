import { beforeEach, describe, expect, it } from "vitest"

;(globalThis as any).window = (globalThis as any).window ?? {}
;(globalThis as any).window.Valtio = { proxy: <T,>(value: T) => value }

const {
  aiQuickInteractState,
  openAIQuickInteract,
  setQuickError,
  setQuickGenerating,
  setQuickResult
} = await import("./aiQuickInteractState")

describe("AI quick interact connection settings error action", () => {
  beforeEach(() => {
    openAIQuickInteract({
      pluginName: "orca-srs",
      blockId: 1,
      selectedText: "文本",
      blockText: "文本",
      promptLabel: "解释",
      promptText: "解释这段文本",
      mode: "preset"
    })
  })

  it("preserves an auth error and clears its action on retry", () => {
    setQuickError("Forbidden", true)
    expect(aiQuickInteractState.errorMessage).toBe("Forbidden")
    expect(aiQuickInteractState.canOpenConnectionSettings).toBe(true)

    setQuickGenerating(true)
    expect(aiQuickInteractState.canOpenConnectionSettings).toBe(false)
  })

  it("does not mark ordinary errors and clears a previous mark on success", () => {
    setQuickError("请求超时")
    expect(aiQuickInteractState.canOpenConnectionSettings).toBe(false)

    setQuickError("Unauthorized", true)
    setQuickResult("结果")
    expect(aiQuickInteractState.canOpenConnectionSettings).toBe(false)
  })
})
