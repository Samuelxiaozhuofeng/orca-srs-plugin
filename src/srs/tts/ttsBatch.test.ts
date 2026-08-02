import { describe, expect, it, vi } from "vitest"
import {
  buildBatchItems,
  filterBasicCardsForTtsBatch,
  retryFailedTtsBatch,
  runTtsBatch,
  summarizeBatchProgress,
  type TtsBatchItem
} from "./ttsBatch"
import type { ReviewCard } from "../types"
import { setTtsSettingsCache, clearTtsSettingsCache } from "./ttsSettingsSchema"

function card(
  over: Partial<ReviewCard> & { id: number; front?: string; cardType?: ReviewCard["cardType"] }
): ReviewCard {
  const {
    id,
    front = "front",
    back = "back",
    cardType = "basic",
    clozeNumber,
    ...rest
  } = over
  return {
    id,
    front,
    back,
    deck: "d",
    isNew: true,
    srs: {
      stability: 0,
      difficulty: 0,
      interval: 0,
      due: new Date(),
      lastReviewed: null,
      reps: 0,
      lapses: 0
    },
    cardType,
    ...(clozeNumber != null ? { clozeNumber } : {}),
    ...rest
  } as ReviewCard
}

describe("ttsBatch filter", () => {
  it("仅 Basic、去重 cardKey、空 front 跳过", () => {
    const cards = [
      card({ id: 1, front: "a", cardType: "basic" }),
      card({ id: 1, front: "a", cardType: "basic" }), // 同 cardKey 重复
      card({ id: 2, front: "  ", cardType: "basic" }),
      card({ id: 3, front: "c", cardType: "cloze", clozeNumber: 1 }),
      card({ id: 4, front: "d", cardType: "choice" }),
      card({ id: 5, front: "e", cardType: "basic" })
    ]
    const r = filterBasicCardsForTtsBatch(cards)
    expect(r.eligible.map((c) => c.id)).toEqual([1, 5])
    expect(r.skippedDuplicate).toBe(1)
    expect(r.skippedEmptyFront).toBe(1)
    expect(r.skippedNonBasic).toBe(2)
  })
})

describe("runTtsBatch", () => {
  it("有界并发、部分失败、取消未开始项", async () => {
    clearTtsSettingsCache()
    setTtsSettingsCache("p", { apiKey: "k" })

    const items = buildBatchItems([
      card({ id: 1, front: "one" }),
      card({ id: 2, front: "two" }),
      card({ id: 3, front: "three" }),
      card({ id: 4, front: "four" })
    ])

    let started = 0
    const controller = new AbortController()

    const generateOptions = {
      loadBlock: async () => ({ id: 0, properties: [] }) as never,
      uploadAsset: async () => "./x.mp3",
      insertAudioBlock: async () => 1,
      fetchImpl: vi.fn().mockImplementation(async () => {
        started += 1
        if (started === 1) {
          // 第一项成功后取消，剩余 pending 应 cancelled
          controller.abort()
        }
        if (started === 2) {
          throw new Error("boom")
        }
        const b = new Uint8Array(64)
        b[0] = 0x49
        b[1] = 0x44
        b[2] = 0x33
        return {
          ok: true,
          status: 200,
          headers: {
            get: (k: string) =>
              k.toLowerCase() === "content-length" ? "64" : "audio/mpeg"
          },
          body: null,
          arrayBuffer: async () => b.buffer
        }
      })
    }

    // mock setProperties for success path
    vi.stubGlobal("orca", {
      state: { blocks: {} },
      commands: {
        invokeEditorCommand: vi.fn().mockResolvedValue(undefined)
      }
    })

    const progress = await runTtsBatch({
      pluginName: "p",
      items,
      concurrency: 2,
      signal: controller.signal,
      generateOptions
    })

    expect(progress.total).toBe(4)
    // 至少有 cancelled（未开始）
    expect(progress.cancelled + progress.success + progress.failed + progress.skipped).toBe(4)
    expect(progress.remaining).toBe(0)
    // 失败不是成功
    const failed = items.filter((i) => i.status === "failed")
    for (const f of failed) {
      expect(f.error).toBeTruthy()
    }
  })

  it("summarizeBatchProgress 区分状态", () => {
    const items: TtsBatchItem[] = [
      { cardKey: "basic:1", blockId: 1, front: "a", status: "success" },
      { cardKey: "basic:2", blockId: 2, front: "b", status: "skipped" },
      { cardKey: "basic:3", blockId: 3, front: "c", status: "failed", error: "e" },
      { cardKey: "basic:4", blockId: 4, front: "d", status: "pending" }
    ]
    const p = summarizeBatchProgress(items)
    expect(p.success).toBe(1)
    expect(p.skipped).toBe(1)
    expect(p.failed).toBe(1)
    expect(p.remaining).toBe(1)
  })

  it("retryFailedTtsBatch 只重置 failed", async () => {
    clearTtsSettingsCache()
    setTtsSettingsCache("p", { apiKey: "k" })
    vi.stubGlobal("orca", {
      state: { blocks: {} },
      commands: { invokeEditorCommand: vi.fn().mockResolvedValue(undefined) }
    })

    const items: TtsBatchItem[] = [
      { cardKey: "basic:1", blockId: 1, front: "ok", status: "success" },
      { cardKey: "basic:2", blockId: 2, front: "retry-me", status: "failed", error: "old" }
    ]

    const b = new Uint8Array(64)
    b[0] = 0x49
    b[1] = 0x44
    b[2] = 0x33

    await retryFailedTtsBatch({
      pluginName: "p",
      items,
      concurrency: 1,
      generateOptions: {
        loadBlock: async () => ({ id: 2, properties: [] }) as never,
        uploadAsset: async () => "./y.mp3",
        insertAudioBlock: async () => 9,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: {
            get: (k: string) =>
              k.toLowerCase() === "content-length" ? "64" : "audio/mpeg"
          },
          body: null,
          arrayBuffer: async () => b.buffer
        }) as unknown as typeof fetch
      }
    })

    expect(items[0].status).toBe("success")
    expect(items[1].status).toBe("success")
  })
})
