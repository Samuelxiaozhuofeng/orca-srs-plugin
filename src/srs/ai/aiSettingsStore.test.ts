import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AI_CONNECTION_DATA_KEY,
  clearAISettingsCache,
  getAISettings,
  hydrateAISettings,
  saveAISettings
} from "./aiSettingsSchema"
import {
  clearWebImportSettingsCache,
  FIRECRAWL_CONNECTION_DATA_KEY,
  getWebImportSettings,
  hydrateWebImportSettings,
  saveWebImportSettings
} from "../settings/webImportSettingsSchema"

const PLUGIN = "orca-srs"

describe("AI / Firecrawl settings setData store", () => {
  afterEach(() => {
    clearAISettingsCache()
    clearWebImportSettingsCache()
    delete (globalThis as any).orca
    vi.restoreAllMocks()
  })

  it("getAISettings falls back to plugin settings before hydrate", () => {
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "sk-from-settings",
              "ai.apiUrl": "https://example.test/v1/chat/completions",
              "ai.model": "gpt-test"
            }
          }
        }
      }
    }
    expect(getAISettings(PLUGIN)).toEqual({
      apiKey: "sk-from-settings",
      apiUrl: "https://example.test/v1/chat/completions",
      model: "gpt-test",
      enableNativeWebSearch: false,
      reasoningEffort: "default"
    })
  })

  it("saveAISettings uses setData and does not call setSettings", async () => {
    const dataStore: Record<string, string> = {}
    const setData = vi.fn(async (_n: string, key: string, value: string) => {
      dataStore[key] = value
    })
    const setSettings = vi.fn()
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "old",
              "review.something": "keep"
            }
          }
        }
      },
      plugins: {
        setData,
        setSettings,
        getData: async (_n: string, key: string) => dataStore[key] ?? null
      }
    }

    const saved = await saveAISettings(PLUGIN, {
      apiKey: " sk-new ",
      apiUrl: " https://api.deepseek.com/chat/completions ",
      model: " deepseek-chat ",
      enableNativeWebSearch: true,
      reasoningEffort: "high"
    })
    expect(setSettings).not.toHaveBeenCalled()
    expect(setData).toHaveBeenCalledWith(
      PLUGIN,
      AI_CONNECTION_DATA_KEY,
      JSON.stringify({
        apiKey: "sk-new",
        apiUrl: "https://api.deepseek.com/chat/completions",
        model: "deepseek-chat",
        enableNativeWebSearch: true,
        reasoningEffort: "high"
      })
    )
    expect(saved.apiKey).toBe("sk-new")
    expect(saved.enableNativeWebSearch).toBe(true)
    expect(saved.reasoningEffort).toBe("high")
    expect(getAISettings(PLUGIN).apiKey).toBe("sk-new")
    expect(getAISettings(PLUGIN).enableNativeWebSearch).toBe(true)
    expect(orca.state.plugins[PLUGIN]?.settings?.["review.something"]).toBe(
      "keep"
    )
  })

  it("hydrateAISettings migrates settings → setData", async () => {
    const dataStore: Record<string, string | null> = {}
    const setData = vi.fn(async (_n: string, key: string, value: string) => {
      dataStore[key] = value
    })
    const getData = vi.fn(async (_n: string, key: string) => dataStore[key] ?? null)
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "ai.apiKey": "migrate-me",
              "ai.apiUrl": "https://x.test/v1/chat/completions",
              "ai.model": "m1"
            }
          }
        }
      },
      plugins: { getData, setData, setSettings: vi.fn() }
    }

    const ai = await hydrateAISettings(PLUGIN)
    expect(ai.apiKey).toBe("migrate-me")
    expect(ai.enableNativeWebSearch).toBe(false)
    expect(ai.reasoningEffort).toBe("default")
    expect(setData).toHaveBeenCalled()
    expect(getAISettings(PLUGIN).model).toBe("m1")
  })

  it("normalizeAISettings rejects invalid reasoningEffort and keeps booleans", async () => {
    const dataStore: Record<string, string> = {}
    ;(globalThis as any).orca = {
      state: { plugins: { [PLUGIN]: { settings: {} } } },
      plugins: {
        setData: async (_n: string, key: string, value: string) => {
          dataStore[key] = value
        },
        getData: async (_n: string, key: string) => dataStore[key] ?? null,
        setSettings: vi.fn()
      }
    }
    const saved = await saveAISettings(PLUGIN, {
      apiKey: "k",
      apiUrl: "https://x.test/v1/chat/completions",
      model: "m",
      // @ts-expect-error intentional invalid
      reasoningEffort: "ultra",
      enableNativeWebSearch: true
    })
    expect(saved.reasoningEffort).toBe("default")
    expect(saved.enableNativeWebSearch).toBe(true)
  })

  it("saveWebImportSettings uses setData only", async () => {
    const setData = vi.fn(async () => {})
    const setSettings = vi.fn()
    ;(globalThis as any).orca = {
      state: { plugins: { [PLUGIN]: { settings: {} } } },
      plugins: { setData, setSettings }
    }
    await saveWebImportSettings(PLUGIN, {
      firecrawlApiKey: " fc-1 ",
      firecrawlApiUrl: " https://api.firecrawl.dev/v2/scrape "
    })
    expect(setSettings).not.toHaveBeenCalled()
    expect(setData).toHaveBeenCalledWith(
      PLUGIN,
      FIRECRAWL_CONNECTION_DATA_KEY,
      JSON.stringify({
        firecrawlApiKey: "fc-1",
        firecrawlApiUrl: "https://api.firecrawl.dev/v2/scrape"
      })
    )
    expect(getWebImportSettings(PLUGIN).firecrawlApiKey).toBe("fc-1")
  })

  it("hydrateWebImportSettings prefers setData", async () => {
    const getData = vi.fn(async () =>
      JSON.stringify({
        firecrawlApiKey: "from-data",
        firecrawlApiUrl: "https://custom.example/scrape"
      })
    )
    const setData = vi.fn()
    ;(globalThis as any).orca = {
      state: {
        plugins: {
          [PLUGIN]: {
            settings: {
              "webImport.firecrawlApiKey": "from-settings"
            }
          }
        }
      },
      plugins: { getData, setData }
    }
    const w = await hydrateWebImportSettings(PLUGIN)
    expect(w.firecrawlApiKey).toBe("from-data")
    expect(setData).not.toHaveBeenCalled()
  })
})
