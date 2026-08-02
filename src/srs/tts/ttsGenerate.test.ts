import { describe, expect, it, vi } from "vitest"
import {
  generateTtsAudio,
  TtsGenerateError
} from "./ttsGenerate"
import { hashTtsText, TTS_MANIFEST_PROP } from "./ttsManifest"
import { setTtsSettingsCache, clearTtsSettingsCache } from "./ttsSettingsSchema"

function mp3Buf(): ArrayBuffer {
  const b = new Uint8Array(64)
  b[0] = 0x49
  b[1] = 0x44
  b[2] = 0x33
  return b.buffer
}

describe("generateTtsAudio", () => {
  it("skip_existing 命中匹配 entry 时跳过", async () => {
    clearTtsSettingsCache()
    setTtsSettingsCache("p", {
      apiKey: "k",
      voice: "zh-CN-XiaoxiaoNeural"
    })
    const text = "hello"
    const entry = {
      cardKey: "basic:1",
      assetPath: "./old.mp3",
      audioBlockId: 10,
      textHash: hashTtsText(text),
      provider: "azure",
      voice: "zh-CN-XiaoxiaoNeural",
      format: "audio-24khz-96kbitrate-mono-mp3",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
    const result = await generateTtsAudio({
      pluginName: "p",
      targetBlockId: 1,
      targetKey: "basic:1",
      text,
      mode: "skip_existing",
      loadBlock: async () =>
        ({
          id: 1,
          properties: [{ name: TTS_MANIFEST_PROP, value: { version: 1, entries: [entry] } }]
        }) as never,
      uploadAsset: vi.fn(),
      insertAudioBlock: vi.fn()
    })
    expect(result.status).toBe("skipped")
  })

  it("完整成功路径：upload → insert → manifest", async () => {
    clearTtsSettingsCache()
    setTtsSettingsCache("p", { apiKey: "k", region: "eastasia" })

    const setProps = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("orca", {
      state: { blocks: {} },
      commands: { invokeEditorCommand: setProps },
      invokeBackend: vi.fn()
    })

    const upload = vi.fn().mockResolvedValue("./tts-x.mp3")
    const insert = vi.fn().mockResolvedValue(55)
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-length" ? "64" : "audio/mpeg"
      },
      body: null,
      arrayBuffer: async () => mp3Buf()
    })

    const result = await generateTtsAudio({
      pluginName: "p",
      targetBlockId: 1,
      targetKey: "basic:1",
      text: "你好世界",
      mode: "skip_existing",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploadAsset: upload,
      insertAudioBlock: insert,
      loadBlock: async () =>
        ({ id: 1, properties: [] }) as never
    })

    expect(result.status).toBe("created")
    if (result.status === "created") {
      expect(result.audioBlockId).toBe(55)
      expect(result.assetPath).toBe("./tts-x.mp3")
    }
    expect(upload).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledWith({
      refBlockId: 1,
      assetPath: "./tts-x.mp3"
    })
    expect(setProps).toHaveBeenCalled()
  })

  it("insert 成功但 manifest 失败时错误含 audioBlockId", async () => {
    clearTtsSettingsCache()
    setTtsSettingsCache("p", { apiKey: "k" })
    vi.stubGlobal("orca", {
      state: { blocks: {} },
      commands: {
        invokeEditorCommand: vi.fn().mockRejectedValue(new Error("prop fail"))
      }
    })

    try {
      await generateTtsAudio({
        pluginName: "p",
        targetBlockId: 1,
        targetKey: "block:1",
        text: "x",
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: {
            get: (k: string) =>
              k.toLowerCase() === "content-length" ? "64" : "audio/mpeg"
          },
          body: null,
          arrayBuffer: async () => mp3Buf()
        }) as unknown as typeof fetch,
        uploadAsset: async () => "./a.mp3",
        insertAudioBlock: async () => 77,
        loadBlock: async () => ({ id: 1, properties: [] }) as never
      })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(TtsGenerateError)
      expect((e as TtsGenerateError).step).toBe("manifest")
      expect((e as TtsGenerateError).audioBlockId).toBe(77)
      expect((e as TtsGenerateError).message).toContain("#77")
    }
  })

  it("未配置 key 时报 config 错误", async () => {
    clearTtsSettingsCache()
    await expect(
      generateTtsAudio({
        pluginName: "p-empty",
        targetBlockId: 1,
        targetKey: "block:1",
        text: "hi",
        loadBlock: async () => ({ id: 1, properties: [] }) as never
      })
    ).rejects.toMatchObject({ step: "config", code: "NO_API_KEY" })
  })
})
