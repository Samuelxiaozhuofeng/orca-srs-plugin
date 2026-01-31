import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(),
  loadIRState: vi.fn()
}))

import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"
import { collectAllIRCardsFromBlocks } from "./incrementalReadingCollector"
import { ensureIRState, loadIRState } from "./incrementalReadingStorage"

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
  }
}

describe("collectAllIRCardsFromBlocks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should collect all incremental reading cards regardless of due status", async () => {
    const now = new Date("2026-01-19T00:00:00Z")
    const blocks: Block[] = [
      createBlock(1, "extracts"),
      createBlock(2, "topic"),
      createBlock(3, "basic")
    ]

    const stateMap = new Map<DbId, { priority: number; lastRead: Date | null; readCount: number; due: Date; position: number | null; resumeBlockId: DbId | null }>([
      [1, { priority: 3, lastRead: new Date(now.getTime() - 3600), readCount: 2, due: new Date(now.getTime() + 7 * 86400000), position: null, resumeBlockId: null }],
      [2, { priority: 8, lastRead: new Date(now.getTime() - 7200), readCount: 5, due: new Date(now.getTime() + 30 * 86400000), position: 1, resumeBlockId: 221 }],
      [3, { priority: 5, lastRead: new Date(now.getTime() - 7200), readCount: 1, due: new Date(now.getTime() - 86400000), position: null, resumeBlockId: null }]
    ])

    vi.mocked(ensureIRState).mockResolvedValue({
      priority: 5,
      lastRead: null,
      readCount: 0,
      due: now,
      position: null,
      resumeBlockId: null
    })

    vi.mocked(loadIRState).mockImplementation(async (blockId: DbId) => {
      const state = stateMap.get(blockId)
      if (!state) {
        throw new Error("missing state")
      }
      return state
    })

    const results = await collectAllIRCardsFromBlocks(blocks)

    expect(results.map(card => card.id)).toEqual([1, 2])
    expect(results.every(card => card.isNew === false)).toBe(true)
    expect(vi.mocked(ensureIRState)).toHaveBeenCalledTimes(2)
  })
})
