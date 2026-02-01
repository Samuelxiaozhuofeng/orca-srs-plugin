import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(),
  loadIRState: vi.fn()
}))

import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"
import { collectIRCardsFromBlocks } from "./incrementalReadingCollector"
import type { IRState } from "./incrementalReadingStorage"
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

describe("incrementalReadingCollector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should collect only extracts/topic and include new or due cards", async () => {
    const now = new Date("2025-01-01T00:00:00Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const blocks: Block[] = [
      createBlock(1, "extracts"),
      createBlock(2, "topic"),
      createBlock(3, "basic")
    ]

    const stateMap = new Map<DbId, IRState>([
      [1, { priority: 5, lastRead: null, readCount: 0, due: new Date(now.getTime() + 3600 * 1000), intervalDays: 1, postponeCount: 0, stage: "extract.raw", lastAction: "init", position: null, resumeBlockId: null }],
      [2, { priority: 8, lastRead: new Date(now.getTime() - 1000), readCount: 1, due: new Date(now.getTime() - 1000), intervalDays: 2, postponeCount: 0, stage: "topic.preview", lastAction: "init", position: 10, resumeBlockId: 221 }],
      [3, { priority: 5, lastRead: new Date(now.getTime() - 1000), readCount: 1, due: new Date(now.getTime() - 1000), intervalDays: 5, postponeCount: 0, stage: "extract.raw", lastAction: "init", position: null, resumeBlockId: null }]
    ])

    vi.mocked(ensureIRState).mockResolvedValue({
      priority: 5,
      lastRead: null,
      readCount: 0,
      due: now,
      intervalDays: 5,
      postponeCount: 0,
      stage: "topic.preview",
      lastAction: "init",
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

    const results = await collectIRCardsFromBlocks(blocks)

    expect(results.map(card => card.id)).toEqual([1, 2])
    expect(results.find(card => card.id === 1)?.isNew).toBe(true)
    expect(vi.mocked(ensureIRState)).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it("should filter due cards by day boundary for all cards", async () => {
    const now = new Date(2025, 0, 22, 15, 30, 0)
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const blocks: Block[] = [
      createBlock(1, "extracts"),
      createBlock(2, "topic"),
      createBlock(3, "extracts"),
      createBlock(4, "topic")
    ]

    const stateMap = new Map<DbId, IRState>([
      [1, { priority: 5, lastRead: null, readCount: 0, due: new Date(2025, 0, 23, 9, 0, 0), intervalDays: 1, postponeCount: 0, stage: "extract.raw", lastAction: "init", position: null, resumeBlockId: null }],
      [2, { priority: 8, lastRead: new Date(2025, 0, 21, 9, 0, 0), readCount: 1, due: new Date(2025, 0, 22, 23, 59, 0), intervalDays: 2, postponeCount: 0, stage: "topic.preview", lastAction: "init", position: 1, resumeBlockId: 221 }],
      [3, { priority: 6, lastRead: new Date(2025, 0, 21, 9, 0, 0), readCount: 1, due: new Date(2025, 0, 23, 0, 0, 0), intervalDays: 2, postponeCount: 0, stage: "extract.raw", lastAction: "init", position: null, resumeBlockId: null }],
      [4, { priority: 4, lastRead: new Date(2025, 0, 20, 9, 0, 0), readCount: 2, due: new Date(2025, 0, 21, 12, 0, 0), intervalDays: 5, postponeCount: 0, stage: "topic.preview", lastAction: "init", position: 2, resumeBlockId: null }]
    ])

    vi.mocked(ensureIRState).mockResolvedValue({
      priority: 5,
      lastRead: null,
      readCount: 0,
      due: now,
      intervalDays: 5,
      postponeCount: 0,
      stage: "topic.preview",
      lastAction: "init",
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

    const results = await collectIRCardsFromBlocks(blocks)

    expect(results.map(card => card.id)).toEqual([2, 4])

    vi.useRealTimers()
  })
})
