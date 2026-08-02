import { describe, expect, it, vi, afterEach } from "vitest"
import {
  loadTtsPlaybackForCard,
  resolveTtsPlayback
} from "./ttsPlayback"
import { hashTtsText, TTS_MANIFEST_PROP } from "./ttsManifest"

describe("ttsPlayback", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("无 entry 时返回 reason", () => {
    vi.stubGlobal("orca", {
      state: { repoDir: "/repo" },
      utils: { getAssetPath: (p: string) => p }
    })
    const r = resolveTtsPlayback({ properties: [] }, "basic:1")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("尚无")
  })

  it("恒等 getAssetPath + repoDir 解析为 file:// URL", () => {
    vi.stubGlobal("orca", {
      state: { repoDir: "/Users/me/orca/repos/demo" },
      // 真机宿主常见：恒等返回相对路径
      utils: { getAssetPath: (p: string) => p }
    })
    const entry = {
      cardKey: "basic:1",
      assetPath: "./a.mp3",
      audioBlockId: 2,
      textHash: hashTtsText("x"),
      provider: "azure",
      voice: "v",
      format: "f",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
    const r = resolveTtsPlayback(
      {
        properties: [
          {
            name: TTS_MANIFEST_PROP,
            type: 0,
            value: { version: 1, entries: [entry] }
          }
        ]
      } as never,
      "basic:1"
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.playUrl).toMatch(/^file:\/\//)
      expect(r.playUrl).toContain("/assets/a.mp3")
      expect(r.playUrl).not.toBe("./a.mp3")
    }
  })

  it("repoDir 不可用时解析失败返回明确 reason", () => {
    vi.stubGlobal("orca", {
      state: {},
      utils: { getAssetPath: (p: string) => p }
    })
    const entry = {
      cardKey: "basic:1",
      assetPath: "./a.mp3",
      audioBlockId: 2,
      textHash: hashTtsText("x"),
      provider: "azure",
      voice: "v",
      format: "f",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
    const r = resolveTtsPlayback(
      {
        properties: [
          {
            name: TTS_MANIFEST_PROP,
            type: 0,
            value: { version: 1, entries: [entry] }
          }
        ]
      } as never,
      "basic:1"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toMatch(/repoDir|assets|解析/)
    }
  })

  it("损坏 manifest 不假装无音频", () => {
    vi.stubGlobal("orca", {
      state: { repoDir: "/repo" },
      utils: { getAssetPath: (p: string) => p }
    })
    const r = resolveTtsPlayback(
      {
        properties: [
          { name: TTS_MANIFEST_PROP, type: 0, value: "broken{{{" }
        ]
      } as never,
      "basic:1"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/manifest|JSON/)
  })

  it("loadTtsPlaybackForCard get-block 失败可见", async () => {
    vi.stubGlobal("orca", {
      state: { blocks: {} },
      invokeBackend: vi.fn().mockRejectedValue(new Error("db down")),
      utils: { getAssetPath: (p: string) => p }
    })
    const r = await loadTtsPlaybackForCard(1, "basic:1")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("读取卡片块失败")
  })
})
