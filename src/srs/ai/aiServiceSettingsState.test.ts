import { describe, expect, it } from "vitest"

;(globalThis as any).window = (globalThis as any).window ?? {}
;(globalThis as any).window.Valtio = { proxy: <T,>(value: T) => value }

const { isAIConnectionAuthError } = await import("./aiServiceSettingsState")

describe("isAIConnectionAuthError", () => {
  it("matches only HTTP 401 and 403", () => {
    expect(isAIConnectionAuthError("HTTP_401")).toBe(true)
    expect(isAIConnectionAuthError("HTTP_403")).toBe(true)
    expect(isAIConnectionAuthError("NO_API_KEY")).toBe(false)
    expect(isAIConnectionAuthError("HTTP_400")).toBe(false)
    expect(isAIConnectionAuthError("HTTP_404")).toBe(false)
    expect(isAIConnectionAuthError("HTTP_500")).toBe(false)
  })
})
