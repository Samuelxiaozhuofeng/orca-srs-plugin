/**
 * Batch B1：只读收集跳过 ensureIRState；默认路径保留 lazy ensure
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(),
  loadIRState: vi.fn()
}))

import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"
import {
  collectAllIRCardsFromBlocks,
  collectIRCardsFromBlocksDetailed
} from "./incrementalReadingCollector"
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

function createBlock(id: DbId, typeValue: string, properties: BlockProperty[] = []): Block {
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
  }
}

function baseState(overrides: Partial<IRState> = {}): IRState {
  return {
    priority: 50,
    lastRead: null,
    readCount: 0,
    due: new Date("2026-07-19T08:00:00"),
    intervalDays: 5,
    postponeCount: 0,
    stage: "topic.preview",
    lastAction: "init",
    position: null,
    resumeBlockId: null,
    ...overrides
  }
}

describe("IR collection readOnly option (Batch B1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("collectIRCardsFromBlocksDetailed readOnly skips ensureIRState on missing core props", async () => {
    // 缺 ir.priority / ir.due：默认路径会 ensure；只读不得 ensure
    const block = createBlock(231, "topic", [])
    const loaded = baseState({
      priority: 40,
      due: new Date("2026-07-18T08:00:00"),
      lastRead: null
    })
    vi.mocked(loadIRState).mockResolvedValue(loaded)
    vi.mocked(ensureIRState).mockResolvedValue(loaded)

    const { cards, failedCount } = await collectIRCardsFromBlocksDetailed(
      [block],
      "srs-plugin",
      { readOnly: true }
    )

    expect(failedCount).toBe(0)
    expect(vi.mocked(ensureIRState)).not.toHaveBeenCalled()
    expect(vi.mocked(loadIRState)).toHaveBeenCalledWith(231)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe(231)
    expect(cards[0].priority).toBe(40)
    expect(cards[0].isNew).toBe(true)
  })

  it("collectIRCardsFromBlocksDetailed default still ensure-s when core props missing", async () => {
    const block = createBlock(508, "topic", [])
    const loaded = baseState({
      due: new Date("2026-07-18T08:00:00")
    })
    vi.mocked(ensureIRState).mockResolvedValue(loaded)
    vi.mocked(loadIRState).mockResolvedValue(loaded)

    const { cards } = await collectIRCardsFromBlocksDetailed([block], "srs-plugin")

    expect(vi.mocked(ensureIRState)).toHaveBeenCalledWith(508)
    expect(vi.mocked(loadIRState)).toHaveBeenCalledWith(508)
    expect(cards.map((c) => c.id)).toEqual([508])
  })

  it("collectAllIRCardsFromBlocks readOnly skips ensure (focus path)", async () => {
    const block = createBlock(99, "extracts", [])
    const loaded = baseState({
      stage: "extract.raw",
      due: new Date("2026-08-01T08:00:00"),
      lastRead: new Date("2026-07-01T08:00:00"),
      readCount: 1
    })
    vi.mocked(loadIRState).mockResolvedValue(loaded)
    vi.mocked(ensureIRState).mockResolvedValue(loaded)

    const cards = await collectAllIRCardsFromBlocks([block], "srs-plugin", { readOnly: true })

    expect(vi.mocked(ensureIRState)).not.toHaveBeenCalled()
    expect(vi.mocked(loadIRState)).toHaveBeenCalledWith(99)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe(99)
    expect(cards[0].cardType).toBe("extracts")
  })

  it("collectAllIRCardsFromBlocks default still ensures", async () => {
    const block = createBlock(11, "topic", [])
    const loaded = baseState()
    vi.mocked(ensureIRState).mockResolvedValue(loaded)
    vi.mocked(loadIRState).mockResolvedValue(loaded)

    await collectAllIRCardsFromBlocks([block], "srs-plugin")

    expect(vi.mocked(ensureIRState)).toHaveBeenCalledWith(11)
  })

  it("readOnly still surfaces loadIRState failures (no fake success card)", async () => {
    const block = createBlock(77, "topic", [])
    vi.mocked(loadIRState).mockRejectedValue(new Error("backend boom"))

    const { cards, failedCount } = await collectIRCardsFromBlocksDetailed(
      [block],
      "srs-plugin",
      { readOnly: true }
    )

    expect(vi.mocked(ensureIRState)).not.toHaveBeenCalled()
    expect(cards).toEqual([])
    expect(failedCount).toBe(1)
  })
})
