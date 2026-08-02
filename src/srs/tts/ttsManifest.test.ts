import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  blockTargetKey,
  emptyTtsManifest,
  findLatestEntryForCardKey,
  findMatchingManifestEntry,
  getTtsManifestPropertySnapshot,
  hashTtsText,
  makeTextPreview,
  parseTtsManifest,
  readTtsManifestFromBlock,
  TTS_MANIFEST_PROP,
  TtsManifestError,
  upsertManifestEntry,
  writeTtsManifest,
  type TtsManifestEntry
} from "./ttsManifest"

const sampleEntry = (
  over: Partial<TtsManifestEntry> = {}
): TtsManifestEntry => ({
  cardKey: "basic:1",
  assetPath: "./a.mp3",
  audioBlockId: 99,
  textHash: hashTtsText("hello"),
  provider: "azure",
  voice: "zh-CN-XiaoxiaoNeural",
  format: "audio-24khz-96kbitrate-mono-mp3",
  createdAt: "2026-08-02T00:00:00.000Z",
  ...over
})

describe("ttsManifest", () => {
  beforeEach(() => {
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: vi.fn().mockResolvedValue(undefined) }
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("hashTtsText 稳定且 trim 归一", () => {
    expect(hashTtsText("abc")).toBe(hashTtsText("  abc  "))
    expect(hashTtsText("a")).not.toBe(hashTtsText("b"))
  })

  it("makeTextPreview 截断", () => {
    const long = "字".repeat(100)
    expect(makeTextPreview(long).endsWith("…")).toBe(true)
  })

  it("blockTargetKey", () => {
    expect(blockTargetKey(42)).toBe("block:42")
  })

  it("parse / find / upsert", () => {
    const e1 = sampleEntry({
      cardKey: "basic:1",
      createdAt: "2026-01-01T00:00:00.000Z"
    })
    const e2 = sampleEntry({
      cardKey: "basic:1",
      audioBlockId: 100,
      createdAt: "2026-02-01T00:00:00.000Z"
    })
    const m = upsertManifestEntry(
      upsertManifestEntry(emptyTtsManifest(), e1),
      e2
    )
    expect(m.entries).toHaveLength(1)
    expect(m.entries[0].audioBlockId).toBe(100)
    expect(findLatestEntryForCardKey(m, "basic:1")?.audioBlockId).toBe(100)
    expect(
      findMatchingManifestEntry(m, {
        cardKey: "basic:1",
        textHash: e2.textHash,
        voice: e2.voice,
        format: e2.format
      })
    ).toBeTruthy()
  })

  it("parseTtsManifest 支持对象与 JSON 字符串", () => {
    const entry = sampleEntry()
    const obj = parseTtsManifest({ version: 1, entries: [entry] })
    expect(obj.entries[0].cardKey).toBe("basic:1")
    const str = parseTtsManifest(
      JSON.stringify({ version: 1, entries: [entry] })
    )
    expect(str.entries[0].assetPath).toBe("./a.mp3")
  })

  it("损坏 JSON 抛错", () => {
    expect(() => parseTtsManifest("not-json")).toThrow(TtsManifestError)
    expect(() => parseTtsManifest("not-json")).toThrow(/JSON 解析失败/)
  })

  it("未知 version 抛错", () => {
    expect(() =>
      parseTtsManifest({ version: 99, entries: [] })
    ).toThrow(/未知 version/)
  })

  it("entries 非数组抛错", () => {
    expect(() =>
      parseTtsManifest({ version: 1, entries: "x" })
    ).toThrow(/entries 必须是数组/)
  })

  it("非法 entry 抛错（不静默过滤）", () => {
    expect(() =>
      parseTtsManifest({
        version: 1,
        entries: [{ cardKey: "basic:1" }]
      })
    ).toThrow(/缺少必填字段/)
  })

  it("readTtsManifestFromBlock：不存在 → 空；损坏 → 抛", () => {
    expect(readTtsManifestFromBlock(null).entries).toHaveLength(0)
    expect(
      readTtsManifestFromBlock({ properties: [] } as never).entries
    ).toHaveLength(0)

    const entry = sampleEntry()
    const good = {
      properties: [
        {
          name: TTS_MANIFEST_PROP,
          type: 0,
          value: { version: 1, entries: [entry] }
        }
      ]
    }
    expect(readTtsManifestFromBlock(good as never).entries).toHaveLength(1)

    const bad = {
      properties: [
        { name: TTS_MANIFEST_PROP, type: 0, value: "not-json{{{" }
      ]
    }
    expect(() => readTtsManifestFromBlock(bad as never, 7)).toThrow(
      /blockId=7/
    )

    for (const value of ["", null]) {
      expect(() =>
        readTtsManifestFromBlock({
          properties: [{ name: TTS_MANIFEST_PROP, type: 0, value }]
        } as never, 8)
      ).toThrow(/srs\.tts\.manifest/)
    }
  })

  it("manifest 快照保留属性中的空值，避免 undo 误判为原本不存在", () => {
    expect(
      getTtsManifestPropertySnapshot({
        properties: [{ name: TTS_MANIFEST_PROP, type: 0, value: "" }]
      } as never)
    ).toEqual({ type: 0, value: "" })
  })

  it("writeTtsManifest 写 type 0 并 invalidate", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: invoke }
    })
    const { hasBlockCacheEntry, preheatBlockCache, clearBlockCache } =
      await import("../storage")
    clearBlockCache()
    preheatBlockCache([{ id: 7, properties: [] } as never])
    expect(hasBlockCacheEntry(7)).toBe(true)

    await writeTtsManifest(7, {
      version: 1,
      entries: [sampleEntry()]
    })

    expect(invoke).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [7],
      [
        expect.objectContaining({
          name: TTS_MANIFEST_PROP,
          type: 0
        })
      ]
    )
    expect(hasBlockCacheEntry(7)).toBe(false)
  })

  it("writeTtsManifest 写失败不 fallback Text、不失效缓存", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("json prop fail"))
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: invoke }
    })
    const { hasBlockCacheEntry, preheatBlockCache, clearBlockCache } =
      await import("../storage")
    clearBlockCache()
    preheatBlockCache([{ id: 8, properties: [] } as never])
    expect(hasBlockCacheEntry(8)).toBe(true)

    await expect(writeTtsManifest(8, emptyTtsManifest())).rejects.toThrow(
      /写入 srs\.tts\.manifest 失败（blockId=8）/
    )
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][0]).toBe("core.editor.setProperties")
    expect(invoke.mock.calls[0][3][0].type).toBe(0)
    // 失败不得 invalidate
    expect(hasBlockCacheEntry(8)).toBe(true)
  })
})
