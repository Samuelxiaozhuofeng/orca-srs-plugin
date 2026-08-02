import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearTtsSettingsCache,
  DEFAULT_TTS_OUTPUT_FORMAT,
  DEFAULT_TTS_REGION,
  DEFAULT_TTS_VOICE,
  getTtsSettings,
  hydrateTtsSettings,
  isTtsConfigured,
  normalizeTtsEndpoint,
  normalizeTtsSettings,
  resolveTtsSynthesizeUrl,
  saveTtsSettings,
  setTtsSettingsCache,
  TTS_CONNECTION_DATA_KEY,
  TTS_PREVIEW_TEXT,
  TTS_RECOMMENDED_VOICES
} from "./ttsSettingsSchema"

describe("ttsSettingsSchema", () => {
  afterEach(() => {
    clearTtsSettingsCache()
    vi.unstubAllGlobals()
  })

  it("normalize: 默认值与固定 format", () => {
    const s = normalizeTtsSettings({})
    expect(s.provider).toBe("azure")
    expect(s.region).toBe(DEFAULT_TTS_REGION)
    expect(s.voice).toBe(DEFAULT_TTS_VOICE)
    expect(s.format).toBe(DEFAULT_TTS_OUTPUT_FORMAT)
    expect(s.endpoint).toBe("")
    expect(s.apiKey).toBe("")
  })

  it("默认与推荐音色为 Multilingual（方案 A）；已保存 voice 不被改写", () => {
    expect(DEFAULT_TTS_VOICE).toMatch(/Multilingual/i)
    expect(DEFAULT_TTS_VOICE).toBe("zh-CN-XiaochenMultilingualNeural")
    const ids = TTS_RECOMMENDED_VOICES.map((v) => v.id)
    expect(ids).toEqual(["zh-multi", "en-multi", "zh-classic"])
    expect(
      TTS_RECOMMENDED_VOICES.find((v) => v.id === "zh-multi")?.voice
    ).toBe(DEFAULT_TTS_VOICE)
    expect(
      TTS_RECOMMENDED_VOICES.some((v) => /Multilingual/i.test(v.voice))
    ).toBe(true)
    // 已落盘的单语 voice 仍原样保留
    expect(
      normalizeTtsSettings({ voice: "zh-CN-XiaoxiaoNeural" }).voice
    ).toBe("zh-CN-XiaoxiaoNeural")
    expect(TTS_PREVIEW_TEXT).toMatch(/Hello/)
    expect(TTS_PREVIEW_TEXT).toMatch(/你好/)
  })

  it("normalize: 非法 region 回退默认；合法 region 小写", () => {
    expect(normalizeTtsSettings({ region: "!!!" }).region).toBe(
      DEFAULT_TTS_REGION
    )
    expect(normalizeTtsSettings({ region: "EastAsia" }).region).toBe(
      "eastasia"
    )
  })

  it("normalize: endpoint 仅允许 HTTPS", () => {
    expect(normalizeTtsEndpoint("http://evil.example")).toBe("")
    expect(normalizeTtsEndpoint("ftp://x")).toBe("")
    expect(
      normalizeTtsEndpoint("https://eastasia.tts.speech.microsoft.com/")
    ).toBe("https://eastasia.tts.speech.microsoft.com")
    expect(
      normalizeTtsSettings({
        endpoint: "https://custom.example.com/"
      }).endpoint
    ).toBe("https://custom.example.com")
  })

  it("resolveTtsSynthesizeUrl: endpoint 优先于 region", () => {
    const withEp = normalizeTtsSettings({
      region: "westus",
      endpoint: "https://custom.example.com"
    })
    expect(resolveTtsSynthesizeUrl(withEp)).toBe(
      "https://custom.example.com/cognitiveservices/v1"
    )
    const regionOnly = normalizeTtsSettings({ region: "japaneast" })
    expect(resolveTtsSynthesizeUrl(regionOnly)).toBe(
      "https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1"
    )
  })

  it("format 用户传入其它值仍强制默认 mp3 格式", () => {
    const s = normalizeTtsSettings({
      format: "audio-16khz-128kbitrate-mono-mp3" as string
    } as Partial<import("./ttsSettingsSchema").TtsSettings>)
    expect(s.format).toBe(DEFAULT_TTS_OUTPUT_FORMAT)
  })

  it("hydrate: 从 getData 装载并缓存", async () => {
    const getData = vi.fn().mockResolvedValue(
      JSON.stringify({
        apiKey: "secret-key",
        region: "westus2",
        voice: "en-US-JennyNeural"
      })
    )
    vi.stubGlobal("orca", {
      plugins: { getData, setData: vi.fn() }
    })

    const s = await hydrateTtsSettings("p1")
    expect(getData).toHaveBeenCalledWith("p1", TTS_CONNECTION_DATA_KEY)
    expect(s.apiKey).toBe("secret-key")
    expect(s.region).toBe("westus2")
    expect(getTtsSettings("p1").voice).toBe("en-US-JennyNeural")
    expect(isTtsConfigured("p1")).toBe(true)
  })

  it("hydrate: getData 抛错时保持错误可见且不缓存默认值", async () => {
    vi.stubGlobal("orca", {
      plugins: {
        getData: vi.fn().mockRejectedValue(new Error("disk fail")),
        setData: vi.fn()
      }
    })
    await expect(hydrateTtsSettings("p2")).rejects.toThrow(
      /读取 tts\.connection 失败/
    )
    expect(getTtsSettings("p2").apiKey).toBe("")
  })

  it("hydrate: 损坏的非空 JSON 抛错，避免按默认值覆盖旧配置", async () => {
    vi.stubGlobal("orca", {
      plugins: {
        getData: vi.fn().mockResolvedValue("broken{{{"),
        setData: vi.fn()
      }
    })
    await expect(hydrateTtsSettings("p-broken")).rejects.toThrow(
      /tts\.connection 解析失败/
    )
  })

  it("save: 写入 setData 并更新缓存；失败抛出", async () => {
    const setData = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("orca", {
      plugins: { getData: vi.fn(), setData }
    })
    const saved = await saveTtsSettings("p3", {
      apiKey: " k ",
      region: "koreacentral"
    })
    expect(saved.apiKey).toBe("k")
    expect(setData).toHaveBeenCalledWith(
      "p3",
      TTS_CONNECTION_DATA_KEY,
      expect.stringContaining('"apiKey":"k"')
    )
    expect(getTtsSettings("p3").region).toBe("koreacentral")

    setData.mockRejectedValueOnce(new Error("write fail"))
    await expect(
      saveTtsSettings("p3", { apiKey: "x" })
    ).rejects.toThrow("write fail")
  })

  it("setTtsSettingsCache 仅内存", () => {
    setTtsSettingsCache("p4", { apiKey: "tmp" })
    expect(isTtsConfigured("p4")).toBe(true)
  })
})
