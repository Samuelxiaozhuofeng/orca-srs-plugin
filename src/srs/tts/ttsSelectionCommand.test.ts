import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  resolveTargetKeyForBlock,
  runSelectionTtsCommand,
  undoSelectionTts
} from "./ttsSelectionCommand"
import {
  clearTtsSettingsCache,
  setTtsSettingsCache
} from "./ttsSettingsSchema"
import { TTS_MANIFEST_PROP } from "./ttsManifest"

function cardRef(data?: Array<{ name: string; value: unknown }>) {
  return {
    type: 2,
    alias: "card",
    data: data ?? [{ name: "type", value: "basic" }]
  }
}

describe("ttsSelectionCommand resolveTargetKeyForBlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("真实 #card type=basic → basic:{id}", () => {
    vi.stubGlobal("orca", {
      state: {
        blocks: {
          1: {
            id: 1,
            refs: [cardRef([{ name: "type", value: "basic" }])],
            properties: []
          }
        }
      }
    })
    expect(resolveTargetKeyForBlock(1)).toBe("basic:1")
  })

  it("普通块无 #card → block:{id}（即使无 type 默认 extract 为 basic）", () => {
    vi.stubGlobal("orca", {
      state: {
        blocks: {
          2: {
            id: 2,
            refs: [],
            properties: [{ name: "srs.isCard", value: true, type: 4 }]
          }
        }
      }
    })
    // 即使有 srs.isCard 属性，无 #card 标签也不得当 Basic
    expect(resolveTargetKeyForBlock(2)).toBe("block:2")
  })

  it("带 #card 的 cloze → block:{id}（不用 basic cardKey）", () => {
    vi.stubGlobal("orca", {
      state: {
        blocks: {
          3: {
            id: 3,
            refs: [cardRef([{ name: "type", value: "cloze" }])],
            properties: [{ name: "srs.c1.due", value: "x", type: 5 }]
          }
        }
      }
    })
    expect(resolveTargetKeyForBlock(3)).toBe("block:3")
  })

  it("带 #card 的 choice → block:{id}", () => {
    vi.stubGlobal("orca", {
      state: {
        blocks: {
          4: {
            id: 4,
            refs: [
              { type: 2, alias: "choice", data: [] },
              cardRef([{ name: "type", value: "choice" }])
            ],
            properties: []
          }
        }
      }
    })
    expect(resolveTargetKeyForBlock(4)).toBe("block:4")
  })
})

describe("ttsSelectionCommand 流程", () => {
  beforeEach(() => {
    clearTtsSettingsCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("无有效选区时明确失败", async () => {
    vi.stubGlobal("orca", {
      state: { blocks: {} },
      notify: vi.fn()
    })
    const r = await runSelectionTtsCommand(
      {
        anchor: { blockId: 1, offset: 0, index: 0 },
        focus: { blockId: 1, offset: 0, index: 0 }
      } as never,
      "p"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("选中")
  })

  it("未配置时引导设置", async () => {
    vi.stubGlobal("orca", {
      state: {
        blocks: {
          10: {
            content: [{ t: "t", v: "hello world" }],
            refs: []
          }
        }
      },
      notify: vi.fn()
    })
    const r = await runSelectionTtsCommand(
      {
        anchor: { blockId: 10, offset: 0, index: 0 },
        focus: { blockId: 10, offset: 5, index: 0 }
      } as never,
      "p"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.openSettings).toBe(true)
      expect(r.reason).toContain("配置")
    }
  })
})

describe("undoSelectionTts", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("删除 audio 并恢复原有 manifest 属性", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: invoke },
      notify: vi.fn()
    })
    const prev = {
      type: 0,
      value: { version: 1, entries: [] }
    }
    await undoSelectionTts({
      targetBlockId: 10,
      audioBlockId: 99,
      previousManifestProp: prev,
      assetPath: "./old.mp3"
    })

    expect(invoke).toHaveBeenCalledWith(
      "core.editor.deleteBlocks",
      null,
      [99]
    )
    expect(invoke).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [10],
      [
        expect.objectContaining({
          name: TTS_MANIFEST_PROP,
          type: 0,
          value: prev.value
        })
      ]
    )
  })

  it("生成前无 manifest 时 deleteProperties", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: invoke },
      notify: vi.fn()
    })
    await undoSelectionTts({
      targetBlockId: 11,
      audioBlockId: 88,
      previousManifestProp: null
    })
    expect(invoke).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [11],
      [TTS_MANIFEST_PROP]
    )
  })

  it("删除 audio 失败时 notify + 抛出", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("delete boom"))
    const notify = vi.fn()
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: invoke },
      notify
    })
    await expect(
      undoSelectionTts({
        targetBlockId: 1,
        audioBlockId: 2,
        previousManifestProp: null
      })
    ).rejects.toThrow("delete boom")
    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("删除音频块"),
      expect.anything()
    )
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it("空/非法 undoArgs 不操作", async () => {
    const invoke = vi.fn()
    vi.stubGlobal("orca", {
      commands: { invokeEditorCommand: invoke },
      notify: vi.fn()
    })
    await undoSelectionTts(null)
    await undoSelectionTts({} as never)
    expect(invoke).not.toHaveBeenCalled()
  })
})

function mp3Buffer(): ArrayBuffer {
  const b = new Uint8Array(64)
  b[0] = 0x49
  b[1] = 0x44
  b[2] = 0x33
  return b.buffer
}

function stubTtsHost(block: Record<string, unknown>) {
  const id = block.id as number
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-length" ? "64" : "audio/mpeg"
    },
    body: null,
    arrayBuffer: async () => mp3Buffer()
  }))
  vi.stubGlobal("orca", {
    state: {
      blocks: { [id]: block },
      repoDir: "/repo"
    },
    commands: {
      invokeEditorCommand: async (cmd: string) => {
        if (cmd === "core.editor.insertBlock") return 501
        if (cmd === "core.editor.setProperties") return undefined
        return undefined
      }
    },
    invokeBackend: async (cmd: string) => {
      if (cmd === "upload-asset-binary") return "./tts-new.mp3"
      if (cmd === "get-block") return block
      return null
    },
    notify: vi.fn(),
    utils: { getAssetPath: (p: string) => p }
  })
}

describe("runSelectionTtsCommand undoArgs 形状", () => {
  beforeEach(() => {
    clearTtsSettingsCache()
    setTtsSettingsCache("p", {
      apiKey: "k",
      region: "eastasia",
      voice: "zh-CN-XiaoxiaoNeural"
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    clearTtsSettingsCache()
  })

  it("created 返回 undoArgs（含 previousManifestProp）", async () => {
    const prevValue = {
      version: 1,
      entries: [
        {
          cardKey: "block:20",
          assetPath: "./old.mp3",
          audioBlockId: 1,
          textHash: "deadbeef",
          provider: "azure",
          voice: "zh-CN-XiaoxiaoNeural",
          format: "audio-24khz-96kbitrate-mono-mp3",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    }
    stubTtsHost({
      id: 20,
      content: [{ t: "t", v: "hello world" }],
      refs: [],
      properties: [{ name: TTS_MANIFEST_PROP, type: 0, value: prevValue }]
    })

    const r = await runSelectionTtsCommand(
      {
        anchor: { blockId: 20, offset: 0, index: 0 },
        focus: { blockId: 20, offset: 5, index: 0 }
      } as never,
      "p"
    )

    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ status: "created" })
    if (r.ok && r.status === "created") {
      expect(r.undoArgs.audioBlockId).toBe(501)
      expect(r.undoArgs.targetBlockId).toBe(20)
      expect(r.undoArgs.assetPath).toBe("./tts-new.mp3")
      expect(r.undoArgs.previousManifestProp).toEqual({
        type: 0,
        value: prevValue
      })
    }
  })

  it("skipped 不返回 undoArgs", async () => {
    // 已有匹配 textHash+voice+format 的 entry → skip
    const text = "hello"
    const { hashTtsText } = await import("./ttsManifest")
    const existing = {
      version: 1,
      entries: [
        {
          cardKey: "block:21",
          assetPath: "./a.mp3",
          audioBlockId: 9,
          textHash: hashTtsText(text),
          provider: "azure",
          voice: "zh-CN-XiaoxiaoNeural",
          format: "audio-24khz-96kbitrate-mono-mp3",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    }
    stubTtsHost({
      id: 21,
      content: [{ t: "t", v: "hello world" }],
      refs: [],
      properties: [{ name: TTS_MANIFEST_PROP, type: 0, value: existing }]
    })

    const r = await runSelectionTtsCommand(
      {
        anchor: { blockId: 21, offset: 0, index: 0 },
        focus: { blockId: 21, offset: 5, index: 0 }
      } as never,
      "p"
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.status).toBe("skipped")
      expect(
        "undoArgs" in r && (r as { undoArgs?: unknown }).undoArgs
      ).toBeFalsy()
    }
  })
})
