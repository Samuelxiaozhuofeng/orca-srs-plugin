/**
 * 中危#2 回归：IR 索引命中路径改用批量 get-blocks（批 50、有界并发 4）
 * - 不再逐 id 串行 get-block
 * - missing 由「请求 id − 返回 id」差集得出
 * - 缺失超 30% 回退全量的行为保持不变（含批次失败按 missing 处理）
 * - 批量结果预热 irBlockCache
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(),
  loadIRState: vi.fn()
}))

vi.mock("./incremental-reading/irIndex", () => ({
  isIRIndexFresh: vi.fn(() => true),
  loadIRIndex: vi.fn(() => null),
  rebuildIRIndexFromCards: vi.fn()
}))

import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"
import { collectAllIRCards } from "./incrementalReadingCollector"
import type { IRState } from "./incrementalReadingStorage"
import { ensureIRState, loadIRState } from "./incrementalReadingStorage"
import { clearIrBlockCache, getBlockCached } from "./incremental-reading/irBlockCache"
import { isIRIndexFresh, loadIRIndex, rebuildIRIndexFromCards } from "./incremental-reading/irIndex"

function createCardRef(blockId: DbId, typeValue: string): BlockRef {
  const data: BlockProperty[] = [{ name: "type", value: typeValue, type: 2 }]
  return {
    id: blockId * 100,
    from: blockId,
    to: 1,
    type: 2,
    alias: "card",
    data
  }
}

function createBlock(id: DbId, typeValue: string): Block {
  return {
    id,
    content: [],
    text: `${typeValue}-${id}`,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [],
    refs: [createCardRef(id, typeValue)],
    backRefs: []
  } as unknown as Block
}

function baseState(): IRState {
  return {
    priority: 50,
    lastRead: new Date("2026-07-01T08:00:00"),
    readCount: 1,
    due: new Date("2026-07-20T08:00:00"),
    intervalDays: 5,
    postponeCount: 0,
    stage: "extract.raw",
    lastAction: "init",
    position: null,
    resumeBlockId: null
  } as IRState
}

const blockMap = new Map<DbId, Block>()

const mockOrca = {
  invokeBackend: vi.fn(),
  commands: { invokeEditorCommand: vi.fn(async () => true) },
  notify: vi.fn(),
  state: { blocks: {} }
}
// @ts-ignore
globalThis.orca = mockOrca

/** get-blocks 按 blockMap 返回；缺失 id 直接不出现在返回数组 */
function installBackend(options?: { failGetBlocks?: boolean }) {
  mockOrca.invokeBackend.mockImplementation(async (command: string, arg: unknown) => {
    if (command === "get-blocks") {
      if (options?.failGetBlocks) {
        throw new Error("get-blocks backend down")
      }
      return (arg as DbId[])
        .map(id => blockMap.get(id))
        .filter((b): b is Block => b != null)
    }
    if (command === "get-blocks-with-tags") {
      const [tag] = arg as string[]
      if (tag === "card") return Array.from(blockMap.values())
      return []
    }
    if (command === "get-block") {
      return blockMap.get(arg as DbId)
    }
    return undefined
  })
}

function seedIndex(topicIds: DbId[], extractIds: DbId[]) {
  vi.mocked(loadIRIndex).mockReturnValue({
    updatedAt: Date.now(),
    verifiedAt: Date.now(),
    topicIds,
    extractIds
  })
  vi.mocked(isIRIndexFresh).mockReturnValue(true)
}

function getBlocksCalls() {
  return mockOrca.invokeBackend.mock.calls.filter(call => call[0] === "get-blocks")
}

function getBlockCalls() {
  return mockOrca.invokeBackend.mock.calls.filter(call => call[0] === "get-block")
}

describe("IR index path batched get-blocks (中危#2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockMap.clear()
    clearIrBlockCache()
    vi.mocked(ensureIRState).mockResolvedValue(baseState())
    vi.mocked(loadIRState).mockResolvedValue(baseState())
    installBackend()
  })

  it("uses get-blocks in batches of 50 with no per-id get-block", async () => {
    const topicIds: DbId[] = []
    const extractIds: DbId[] = []
    for (let id = 1; id <= 60; id++) {
      topicIds.push(id)
      blockMap.set(id, createBlock(id, "topic"))
    }
    for (let id = 61; id <= 120; id++) {
      extractIds.push(id)
      blockMap.set(id, createBlock(id, "extracts"))
    }
    seedIndex(topicIds, extractIds)

    const cards = await collectAllIRCards("orca-srs")

    // 120 个 id → 3 个批次（50/50/20），全部走 get-blocks
    const batches = getBlocksCalls().map(call => (call[1] as DbId[]).length)
    expect(batches.slice().sort((a, b) => b - a)).toEqual([50, 50, 20])
    expect(getBlockCalls()).toHaveLength(0)

    // 结果内容与顺序：ids 原有顺序（topicIds 后接 extractIds）
    expect(cards.map(card => card.id)).toEqual([...topicIds, ...extractIds])
    // 未触发全量回退
    expect(
      mockOrca.invokeBackend.mock.calls.some(call => call[0] === "get-blocks-with-tags")
    ).toBe(false)
    expect(vi.mocked(rebuildIRIndexFromCards)).not.toHaveBeenCalled()
  })

  it("counts missing as requested minus returned and keeps index path at exactly 30%", async () => {
    const ids: DbId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    seedIndex(ids, [])
    for (const id of ids) {
      if (id === 3 || id === 6 || id === 9) continue // 3/10 = 30%，不大于 30%，不回退
      blockMap.set(id, createBlock(id, "topic"))
    }

    const cards = await collectAllIRCards("orca-srs")

    expect(cards.map(card => card.id)).toEqual([1, 2, 4, 5, 7, 8, 10])
    expect(
      mockOrca.invokeBackend.mock.calls.some(call => call[0] === "get-blocks-with-tags")
    ).toBe(false)
    expect(vi.mocked(rebuildIRIndexFromCards)).not.toHaveBeenCalled()
    expect(getBlockCalls()).toHaveLength(0)
  })

  it("falls back to full tag scan and rebuilds index when missing exceeds 30%", async () => {
    const ids: DbId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    seedIndex(ids, [])
    for (const id of ids) {
      blockMap.set(id, createBlock(id, "topic"))
    }
    // get-blocks 只返回 6 个（missing 4 > 3）
    mockOrca.invokeBackend.mockImplementation(async (command: string, arg: unknown) => {
      if (command === "get-blocks") {
        return (arg as DbId[])
          .filter(id => (id as number) <= 6)
          .map(id => blockMap.get(id))
          .filter((b): b is Block => b != null)
      }
      if (command === "get-blocks-with-tags") {
        const [tag] = arg as string[]
        if (tag === "card") return Array.from(blockMap.values())
        return []
      }
      return undefined
    })

    const cards = await collectAllIRCards("orca-srs")

    // 回退全量：get-blocks-with-tags 被调用，索引被重建，结果为全部 10 张
    expect(
      mockOrca.invokeBackend.mock.calls.some(call => call[0] === "get-blocks-with-tags")
    ).toBe(true)
    expect(vi.mocked(rebuildIRIndexFromCards)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(rebuildIRIndexFromCards).mock.calls[0][1]).toHaveLength(10)
    expect(cards.map(card => card.id)).toEqual(ids)
  })

  it("treats a failed get-blocks batch as missing and falls back to full scan", async () => {
    const ids: DbId[] = [1, 2, 3, 4]
    seedIndex(ids, [])
    for (const id of ids) {
      blockMap.set(id, createBlock(id, "topic"))
    }
    installBackend({ failGetBlocks: true })

    const cards = await collectAllIRCards("orca-srs")

    expect(
      mockOrca.invokeBackend.mock.calls.some(call => call[0] === "get-blocks-with-tags")
    ).toBe(true)
    expect(cards.map(card => card.id)).toEqual(ids)
  })

  it("preheats fetched blocks into irBlockCache (no later get-block for same ids)", async () => {
    const ids: DbId[] = [11, 12, 13]
    seedIndex([], ids)
    for (const id of ids) {
      blockMap.set(id, createBlock(id, "extracts"))
    }

    await collectAllIRCards("orca-srs")

    // 预热后再读同 id：命中缓存，不发起 get-block
    const cached = await getBlockCached(12)
    expect(cached?.id).toBe(12)
    expect(getBlockCalls()).toHaveLength(0)
  })
})
