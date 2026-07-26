/**
 * 中危#1 回归：collectAllIRCardsFromBlocks / collectIRCardsFromBlocksDetailed
 * 先用在手的 blocks 预热 irBlockCache，ensureIRState/loadIRState 走缓存命中，
 * 不再对已在手的块重复发起 get-block；写入后的按块失效语义不变。
 *
 * 本文件不 mock incrementalReadingStorage：走真实 ensureIRState/loadIRState → irBlockCache。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"

const blockMap = new Map<DbId, Block>()

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, arg: unknown) => {
    if (command === "get-block") {
      return blockMap.get(arg as DbId)
    }
    if (command === "get-blocks") {
      return (arg as DbId[])
        .map(id => blockMap.get(id))
        .filter((b): b is Block => b != null)
    }
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async () => true)
  },
  notify: vi.fn(),
  state: { blocks: {} }
}
// @ts-ignore
globalThis.orca = mockOrca

import {
  collectAllIRCardsFromBlocks,
  collectIRCardsFromBlocksDetailed
} from "./incrementalReadingCollector"
import { clearIrBlockCache } from "./incremental-reading/irBlockCache"

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

/** 完整 ir.* 属性：ensureIRState 判定 shouldWrite=false，不触发写入 */
function fullIRProperties(): BlockProperty[] {
  return [
    { name: "ir.priority", value: 50, type: 3 },
    { name: "ir.lastRead", value: "2026-07-01T08:00:00.000Z", type: 5 },
    { name: "ir.readCount", value: 1, type: 3 },
    { name: "ir.due", value: "2026-07-20T08:00:00.000Z", type: 5 },
    { name: "ir.intervalDays", value: 5, type: 3 },
    { name: "ir.postponeCount", value: 0, type: 3 },
    { name: "ir.stage", value: ["extract.raw"], type: 2 },
    { name: "ir.lastAction", value: ["init"], type: 2 },
    { name: "ir.resumeBlockId", value: null, type: 3 }
  ]
}

function createBlock(id: DbId, typeValue: string, properties: BlockProperty[]): Block {
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
    properties,
    refs: [createCardRef(id, typeValue)],
    backRefs: []
  } as unknown as Block
}

function getBlockCallIds(): DbId[] {
  return mockOrca.invokeBackend.mock.calls
    .filter(call => call[0] === "get-block")
    .map(call => call[1] as DbId)
}

describe("IR collection preheats irBlockCache from in-hand blocks (中危#1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockMap.clear()
    clearIrBlockCache()
  })

  it("collectAllIRCardsFromBlocks (readOnly) issues zero get-block for in-hand blocks", async () => {
    const blocks = [1, 2, 3, 4, 5].map(id => {
      const block = createBlock(id, "extracts", fullIRProperties())
      blockMap.set(id, block)
      return block
    })

    const cards = await collectAllIRCardsFromBlocks(blocks, "orca-srs", { readOnly: true })

    expect(getBlockCallIds()).toEqual([])
    // readOnly：无任何写入
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
    // 内容与顺序语义不变（mapPool 按下标回填）
    expect(cards.map(card => card.id)).toEqual([1, 2, 3, 4, 5])
    expect(cards.every(card => card.priority === 50)).toBe(true)
    expect(cards.every(card => card.isNew === false)).toBe(true)
  })

  it("collectAllIRCardsFromBlocks (default) ensure path hits preheated cache, no re-fetch", async () => {
    const blocks = [10, 11, 12].map(id => {
      const block = createBlock(id, "extracts", fullIRProperties())
      blockMap.set(id, block)
      return block
    })

    const cards = await collectAllIRCardsFromBlocks(blocks, "orca-srs")

    // 属性完整 → ensureIRState 不写入；全部读走预热缓存
    expect(getBlockCallIds()).toEqual([])
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
    expect(cards.map(card => card.id)).toEqual([10, 11, 12])
  })

  it("collectIRCardsFromBlocksDetailed (readOnly) issues zero get-block for in-hand blocks", async () => {
    const blocks = [21, 22].map(id => {
      const block = createBlock(id, "extracts", fullIRProperties())
      blockMap.set(id, block)
      return block
    })

    const { cards, failedCount } = await collectIRCardsFromBlocksDetailed(
      blocks,
      "orca-srs",
      { readOnly: true }
    )

    expect(failedCount).toBe(0)
    expect(getBlockCallIds()).toEqual([])
    // due=2026-07-20 已过期 → 全部入选
    expect(cards.map(card => card.id)).toEqual([21, 22])
  })

  it("keeps per-block invalidation semantics: a written block is re-fetched, others stay cached", async () => {
    // 30 缺核心属性（无 ir.priority/ir.due）→ 默认路径 ensure 会写入并失效缓存
    const incomplete = createBlock(30, "extracts", [])
    const complete = createBlock(31, "extracts", fullIRProperties())
    blockMap.set(30, incomplete)
    blockMap.set(31, complete)

    await collectAllIRCardsFromBlocks([incomplete, complete], "orca-srs")

    const refetched = getBlockCallIds()
    // 写入过的块允许（且应当）重新 get-block；未写入的块不得重复读取
    expect(refetched).toContain(30)
    expect(refetched).not.toContain(31)
    // 确认确实发生了写入（saveIRState → setProperties）
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalled()
  })
})
