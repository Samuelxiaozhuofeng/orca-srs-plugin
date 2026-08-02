import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CHAPTER_QUIZ_COUNT_MAX,
  CHAPTER_QUIZ_COUNT_MIN,
  CHAPTER_QUIZ_PREFS_DATA_KEY,
  clearChapterQuizPrefsCache,
  DEFAULT_CHAPTER_QUIZ_COUNT,
  getChapterQuizPrefs,
  hydrateChapterQuizPrefs,
  normalizeChapterQuizPrefs,
  saveChapterQuizPrefs
} from "./chapterQuizSettingsSchema"

const PLUGIN = "orca-srs"

describe("chapterQuizSettingsSchema", () => {
  afterEach(() => {
    clearChapterQuizPrefsCache()
    delete (globalThis as any).orca
    vi.restoreAllMocks()
  })

  it("normalize fills safe defaults", () => {
    expect(normalizeChapterQuizPrefs(null)).toEqual({
      questionCount: DEFAULT_CHAPTER_QUIZ_COUNT,
      language: "auto",
      customPrompt: "",
      model: ""
    })
    expect(normalizeChapterQuizPrefs({})).toEqual({
      questionCount: DEFAULT_CHAPTER_QUIZ_COUNT,
      language: "auto",
      customPrompt: "",
      model: ""
    })
  })

  it("normalize clamps questionCount into 3–30 and rounds down", () => {
    expect(normalizeChapterQuizPrefs({ questionCount: 1 }).questionCount).toBe(
      CHAPTER_QUIZ_COUNT_MIN
    )
    expect(
      normalizeChapterQuizPrefs({ questionCount: 999 }).questionCount
    ).toBe(CHAPTER_QUIZ_COUNT_MAX)
    expect(normalizeChapterQuizPrefs({ questionCount: 7.9 }).questionCount).toBe(
      7
    )
    expect(
      normalizeChapterQuizPrefs({ questionCount: Number.NaN }).questionCount
    ).toBe(DEFAULT_CHAPTER_QUIZ_COUNT)
  })

  it("normalize rejects unknown language and trims/caps text fields", () => {
    const value = normalizeChapterQuizPrefs({
      questionCount: 12,
      language: "fr" as never,
      customPrompt: "  自定义".padEnd(600, "x"),
      model: "  deepseek-chat "
    })
    expect(value.language).toBe("auto")
    expect(value.customPrompt).toBe(
      "自定义".padEnd(500, "x")
    )
    expect(value.model).toBe("deepseek-chat")
  })

  it("accepts valid language choices", () => {
    expect(normalizeChapterQuizPrefs({ language: "zh" }).language).toBe("zh")
    expect(normalizeChapterQuizPrefs({ language: "en" }).language).toBe("en")
    expect(normalizeChapterQuizPrefs({ language: "ja" }).language).toBe("ja")
  })

  it("getChapterQuizPrefs returns defaults before hydrate", () => {
    expect(getChapterQuizPrefs(PLUGIN)).toEqual({
      questionCount: DEFAULT_CHAPTER_QUIZ_COUNT,
      language: "auto",
      customPrompt: "",
      model: ""
    })
  })

  it("save writes plugin data and get returns the cached value", async () => {
    const dataStore: Record<string, string> = {}
    ;(globalThis as any).orca = {
      plugins: {
        setData: vi.fn(async (_n: string, key: string, value: string) => {
          dataStore[key] = value
        }),
        getData: vi.fn(async (_n: string, key: string) => dataStore[key] ?? null)
      }
    }

    const saved = await saveChapterQuizPrefs(PLUGIN, {
      questionCount: 15,
      language: "zh",
      customPrompt: " 只出概念辨析题 ",
      model: " cpa/gemini-3.6-flash "
    })
    expect(saved).toEqual({
      questionCount: 15,
      language: "zh",
      customPrompt: "只出概念辨析题",
      model: "cpa/gemini-3.6-flash"
    })
    expect((globalThis as any).orca.plugins.setData).toHaveBeenCalledWith(
      PLUGIN,
      CHAPTER_QUIZ_PREFS_DATA_KEY,
      JSON.stringify(saved)
    )
    // 缓存命中，不回源
    expect(getChapterQuizPrefs(PLUGIN)).toEqual(saved)
    expect((globalThis as any).orca.plugins.getData).not.toHaveBeenCalled()
  })

  it("hydrate reads JSON from plugin data and caches it", async () => {
    const dataStore: Record<string, string> = {
      [CHAPTER_QUIZ_PREFS_DATA_KEY]: JSON.stringify({
        questionCount: 20,
        language: "ja",
        customPrompt: "测概念",
        model: "gpt-test"
      })
    }
    ;(globalThis as any).orca = {
      plugins: {
        getData: vi.fn(async (_n: string, key: string) => dataStore[key] ?? null)
      }
    }

    const value = await hydrateChapterQuizPrefs(PLUGIN)
    expect(value).toEqual({
      questionCount: 20,
      language: "ja",
      customPrompt: "测概念",
      model: "gpt-test"
    })
    expect(getChapterQuizPrefs(PLUGIN)).toEqual(value)
  })

  it("hydrate falls back to defaults on corrupt JSON with a visible warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).orca = {
      plugins: {
        getData: vi.fn(async () => "{not json")
      }
    }

    const value = await hydrateChapterQuizPrefs(PLUGIN)
    expect(value.questionCount).toBe(DEFAULT_CHAPTER_QUIZ_COUNT)
    expect(warn).toHaveBeenCalled()
  })
})
