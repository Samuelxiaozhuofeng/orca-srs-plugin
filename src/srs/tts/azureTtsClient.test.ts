import { describe, expect, it, vi } from "vitest"
import {
  buildSsml,
  escapeXml,
  inferLangFromVoice,
  isAllowedAudioContentType,
  looksLikeMp3,
  readResponseArrayBufferLimited,
  synthesizeSpeech,
  TtsClientError
} from "./azureTtsClient"
import { normalizeTtsSettings } from "./ttsSettingsSchema"

function mp3Bytes(n = 64): ArrayBuffer {
  const buf = new Uint8Array(n)
  // ID3 header
  buf[0] = 0x49
  buf[1] = 0x44
  buf[2] = 0x33
  for (let i = 3; i < n; i++) buf[i] = i & 0xff
  return buf.buffer
}

function mpegFrameBytes(n = 64): ArrayBuffer {
  const buf = new Uint8Array(n)
  buf[0] = 0xff
  buf[1] = 0xfb
  return buf.buffer
}

describe("azureTtsClient", () => {
  it("escapeXml 转义特殊字符防注入", () => {
    expect(escapeXml(`a<b>&"'`)).toBe("a&lt;b&gt;&amp;&quot;&apos;")
  })

  it("buildSsml 转义 voice/text，不拼接裸标签", () => {
    const ssml = buildSsml({
      text: 'hello <break/> evil',
      voice: 'zh-CN-Xiao"xiao',
      rate: "+10%",
      pitch: "0%"
    })
    expect(ssml).toContain("&lt;break/&gt;")
    expect(ssml).toContain('name="zh-CN-Xiao&quot;xiao"')
    expect(ssml).not.toContain("<break/>")
  })

  it("inferLangFromVoice", () => {
    expect(inferLangFromVoice("en-US-JennyNeural")).toBe("en-US")
    expect(inferLangFromVoice("weird")).toBe("zh-CN")
  })

  it("looksLikeMp3: ID3 与 MPEG 帧", () => {
    expect(looksLikeMp3(new Uint8Array(mp3Bytes()))).toBe(true)
    expect(looksLikeMp3(new Uint8Array(mpegFrameBytes()))).toBe(true)
    // AAC ftyp in MP4-like
    const aac = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])
    expect(looksLikeMp3(aac)).toBe(false)
  })

  it("isAllowedAudioContentType", () => {
    expect(isAllowedAudioContentType("audio/mpeg")).toBe(true)
    expect(isAllowedAudioContentType("application/octet-stream")).toBe(true)
    expect(isAllowedAudioContentType(null)).toBe(true)
    expect(isAllowedAudioContentType("text/html")).toBe(false)
  })

  it("synthesizeSpeech 成功路径", async () => {
    const audio = mp3Bytes(128)
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-type"
            ? "audio/mpeg"
            : k.toLowerCase() === "content-length"
              ? String(audio.byteLength)
              : null
      },
      body: null,
      arrayBuffer: async () => audio
    })

    const result = await synthesizeSpeech({
      settings: normalizeTtsSettings({
        apiKey: "key-secret",
        region: "eastasia"
      }),
      text: "你好",
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.byteLength).toBe(128)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain("eastasia.tts.speech.microsoft.com")
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("key-secret")
    expect(init.headers["Content-Type"]).toBe("application/ssml+xml")
    expect(init.body).toContain("你好")
  })

  it("空 key / 空文本 / 过长文本报错", async () => {
    await expect(
      synthesizeSpeech({
        settings: normalizeTtsSettings({ apiKey: "" }),
        text: "a"
      })
    ).rejects.toMatchObject({ code: "NO_API_KEY" })

    await expect(
      synthesizeSpeech({
        settings: normalizeTtsSettings({ apiKey: "k" }),
        text: "   "
      })
    ).rejects.toMatchObject({ code: "EMPTY_TEXT" })

    await expect(
      synthesizeSpeech({
        settings: normalizeTtsSettings({ apiKey: "k" }),
        text: "x".repeat(3000)
      })
    ).rejects.toMatchObject({ code: "TEXT_TOO_LONG" })
  })

  it("401 脱敏错误不包含 key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0)
    })
    try {
      await synthesizeSpeech({
        settings: normalizeTtsSettings({ apiKey: "super-secret-key" }),
        text: "hi",
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(TtsClientError)
      expect((e as TtsClientError).message).not.toContain("super-secret-key")
      expect((e as TtsClientError).status).toBe(401)
    }
  })

  it("非 MP3 响应拒绝", async () => {
    const bad = new Uint8Array(64)
    bad[0] = 0x00
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-length" ? "64" : "audio/mpeg"
      },
      body: null,
      arrayBuffer: async () => bad.buffer
    })
    await expect(
      synthesizeSpeech({
        settings: normalizeTtsSettings({ apiKey: "k" }),
        text: "hi",
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).rejects.toMatchObject({ code: "INVALID_AUDIO" })
  })

  it("异常 Content-Type 拒绝", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-type" ? "text/html" : "64"
      },
      body: null,
      arrayBuffer: async () => mp3Bytes()
    })
    await expect(
      synthesizeSpeech({
        settings: normalizeTtsSettings({ apiKey: "k" }),
        text: "hi",
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_TYPE" })
  })

  it("无响应流时仍校验实际缓冲字节数，不信任偏小 Content-Length", async () => {
    const response = {
      headers: { get: () => "4" },
      body: null,
      arrayBuffer: async () => new ArrayBuffer(8)
    } as unknown as Response

    await expect(readResponseArrayBufferLimited(response, 4)).rejects.toThrow(
      /响应体超过上限/
    )
  })
})
