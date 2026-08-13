import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearQuickCardPrefsCache,
  getQuickCardPrefs,
  hydrateQuickCardPrefs,
  normalizeQuickCardPrefs,
  QUICK_CARD_MAX_CAP,
  QUICK_CARD_PREFS_DATA_KEY,
  saveQuickCardPrefs
} from "./aiQuickCardPrefs"
import {
  AI_CUSTOM_INSTRUCTION_MAX,
  AUTO_CARD_CAP_FALLBACK
} from "./aiDraftTypes"

const PLUGIN = "test-quick-card"

function installOrca(store: Record<string, string> = {}) {
  const setData = vi.fn(async (_n: string, key: string, value: string) => {
    store[key] = value
  })
  const getData = vi.fn(async (_n: string, key: string) => store[key])
  ;(globalThis as any).orca = { plugins: { setData, getData } }
  return { setData, getData, store }
}

describe("normalizeQuickCardPrefs", () => {
  it("falls back to safe defaults", () => {
    expect(normalizeQuickCardPrefs(null)).toEqual({
      cardLanguage: "auto",
      customInstruction: "",
      model: "",
      maxCards: 2
    })
  })

  it("rejects an unknown language rather than passing it through", () => {
    expect(
      normalizeQuickCardPrefs({ cardLanguage: "klingon" as never }).cardLanguage
    ).toBe("auto")
  })

  it("trims and clips the custom instruction", () => {
    const long = "x".repeat(AI_CUSTOM_INSTRUCTION_MAX + 50)
    const prefs = normalizeQuickCardPrefs({ customInstruction: `  ${long}  ` })
    expect(prefs.customInstruction).toHaveLength(AI_CUSTOM_INSTRUCTION_MAX)
  })

  it("trims the model id", () => {
    expect(normalizeQuickCardPrefs({ model: "  m1  " }).model).toBe("m1")
  })

  it("normalizes maxCards: 0 stays as auto, negatives/NaN fall back, over-cap clamps", () => {
    expect(QUICK_CARD_MAX_CAP).toBe(AUTO_CARD_CAP_FALLBACK)
    expect(normalizeQuickCardPrefs({ maxCards: 0 }).maxCards).toBe(0)
    expect(normalizeQuickCardPrefs({ maxCards: -3 }).maxCards).toBe(2)
    expect(normalizeQuickCardPrefs({ maxCards: Number.NaN }).maxCards).toBe(2)
    expect(normalizeQuickCardPrefs({ maxCards: "5" as never }).maxCards).toBe(5)
    expect(normalizeQuickCardPrefs({ maxCards: 999 }).maxCards).toBe(
      AUTO_CARD_CAP_FALLBACK
    )
    expect(normalizeQuickCardPrefs({ maxCards: undefined }).maxCards).toBe(2)
  })
})

describe("quick card prefs persistence", () => {
  beforeEach(() => clearQuickCardPrefsCache())
  afterEach(() => {
    clearQuickCardPrefsCache()
    vi.unstubAllGlobals()
  })

  it("round-trips through plugin data", async () => {
    const { setData, store } = installOrca()
    await saveQuickCardPrefs(PLUGIN, {
      cardLanguage: "en",
      customInstruction: "只做定义类",
      model: "m1",
      maxCards: 0
    })
    expect(setData).toHaveBeenCalledWith(
      PLUGIN,
      QUICK_CARD_PREFS_DATA_KEY,
      expect.any(String)
    )

    clearQuickCardPrefsCache()
    installOrca(store)
    const loaded = await hydrateQuickCardPrefs(PLUGIN)
    expect(loaded).toEqual({
      cardLanguage: "en",
      customInstruction: "只做定义类",
      model: "m1",
      maxCards: 0
    })
  })

  it("uses defaults when nothing is stored", async () => {
    installOrca()
    const prefs = await hydrateQuickCardPrefs(PLUGIN)
    expect(prefs.cardLanguage).toBe("auto")
  })

  it("falls back to defaults on unreadable data but leaves a trace", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).orca = {
      plugins: {
        getData: vi.fn(async () => "{ not json"),
        setData: vi.fn()
      }
    }
    const prefs = await hydrateQuickCardPrefs(PLUGIN)
    expect(prefs.cardLanguage).toBe("auto")
    // 静默回落会让用户以为偏好没保存成功
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("getQuickCardPrefs is safe before hydrate", () => {
    expect(getQuickCardPrefs(PLUGIN).cardLanguage).toBe("auto")
  })
})
