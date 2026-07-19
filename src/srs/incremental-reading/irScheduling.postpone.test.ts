/**
 * Batch B2：postpone / auto-postpone / overflow 只移动 due
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import type { IRCard } from "../incrementalReadingCollector"

const blockById = new Map<number, Block>()
const states = new Map<number, any>()

vi.mock("./irBlockCache", () => ({
  getBlockCached: vi.fn(async (id: number) => blockById.get(id)),
  invalidateIrBlockCache: vi.fn(),
  dropIrBlockCacheEntry: vi.fn()
}))

vi.mock("./irStatePersistence", async () => {
  return {
    loadIRState: vi.fn(async (id: number) => {
      if (!states.has(id)) throw new Error(`missing ${id}`)
      return { ...states.get(id) }
    }),
    saveIRState: vi.fn(async (id: number, state: any) => {
      states.set(id, { ...state })
    })
  }
})

vi.mock("../incrementalReadingStorage", async () => {
  return {
    loadIRState: vi.fn(async (id: number) => {
      if (!states.has(id)) throw new Error(`missing ${id}`)
      return { ...states.get(id) }
    }),
    saveIRState: vi.fn(async (id: number, state: any) => {
      states.set(id, { ...state })
    })
  }
})

vi.mock("../book-ir/bookIRPlanRepository", () => ({
  loadBookIRPlan: vi.fn(async () => null)
}))

import { postpone } from "./irSchedulingMutations"
import {
  applyAutoPostpone,
  AutoPostponeError,
  clearAutoPostponeBatchesForTests
} from "./irOverloadService"
import { deferIROverflow } from "../incrementalReadingCollector"

function makeBlock(id: number, cardType: "topic" | "extracts"): Block {
  return {
    id: id as DbId,
    children: [],
    content: [],
    properties: [],
    refs: [
      {
        type: 2,
        alias: "card",
        data: [{ name: "type", value: cardType }]
      }
    ]
  } as unknown as Block
}

function seed(id: number, partial: Record<string, unknown> = {}) {
  states.set(id, {
    priority: 40,
    lastRead: new Date("2026-01-01"),
    readCount: 2,
    due: new Date("2026-01-05"),
    intervalDays: 7,
    postponeCount: 1,
    stage: "extract.raw",
    lastAction: "next",
    position: null,
    resumeBlockId: null,
    readingBreakpoint: null,
    autoPostponeBatchId: null,
    sacProgressKey: null,
    sacStagnantCount: 0,
    ...partial
  })
}

function card(partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">): IRCard {
  const s = states.get(partial.id as number) ?? {}
  return {
    id: partial.id,
    cardType: partial.cardType,
    priority: partial.priority ?? s.priority ?? 40,
    position: partial.position ?? s.position ?? null,
    due: partial.due ?? s.due ?? new Date("2026-01-01"),
    intervalDays: partial.intervalDays ?? s.intervalDays ?? 7,
    postponeCount: partial.postponeCount ?? s.postponeCount ?? 0,
    stage: s.stage ?? "extract.raw",
    lastAction: s.lastAction ?? "init",
    lastRead: s.lastRead ?? null,
    readCount: s.readCount ?? 1,
    isNew: false,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("B2 postpone due-only paths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockById.clear()
    states.clear()
    clearAutoPostponeBatchesForTests()
  })

  it("manual postpone keeps intervalDays and only moves due", async () => {
    blockById.set(1, makeBlock(1, "extracts"))
    seed(1, { intervalDays: 9.5, postponeCount: 2, readCount: 4 })
    const before = { ...states.get(1) }
    const result = await postpone(1 as DbId, 3)
    expect(result.state.intervalDays).toBe(9.5)
    expect(result.state.intervalDays).toBe(before.intervalDays)
    expect(result.state.postponeCount).toBe(3)
    expect(result.state.lastAction).toBe("postpone")
    expect(result.state.readCount).toBe(4)
    expect(result.state.autoPostponeBatchId).toBeNull()
    expect(result.days).toBe(3)
    expect(result.state.due.getTime()).toBeGreaterThan(before.due.getTime())
  })

  it("applyAutoPostpone keeps intervalDays; sets batch metadata", async () => {
    blockById.set(11, makeBlock(11, "extracts"))
    seed(11, {
      intervalDays: 12,
      due: new Date("2026-01-01"),
      priority: 20,
      postponeCount: 0
    })
    const now = new Date("2026-01-20T12:00:00")
    const result = await applyAutoPostpone(
      [card({ id: 11 as DbId, cardType: "extracts", due: new Date("2026-01-01"), priority: 20 })],
      { now, protectedIds: new Set(), createBatchId: () => "b-due-only" }
    )
    expect(result.deferredCount).toBe(1)
    expect(result.committedIds).toEqual([11])
    const s = states.get(11)
    expect(s.intervalDays).toBe(12)
    expect(s.lastAction).toBe("autoPostpone")
    expect(s.autoPostponeBatchId).toBe("b-due-only")
    expect(s.postponeCount).toBe(1)
    expect(s.readCount).toBe(2)
  })

  it("auto postpone mid-fail surfaces committed/rollback facts", async () => {
    seed(31, {
      intervalDays: 5,
      due: new Date("2026-01-01"),
      priority: 20,
      lastAction: "init",
      postponeCount: 0
    })
    seed(32, {
      intervalDays: 5,
      due: new Date("2026-01-01"),
      priority: 20,
      lastAction: "init",
      postponeCount: 0
    })
    const { saveIRState } = await import("../incrementalReadingStorage")
    let writes = 0
    vi.mocked(saveIRState).mockImplementation(async (id: number, state: any) => {
      writes += 1
      if (id === 32 && state.lastAction === "autoPostpone") {
        throw new Error("write failed")
      }
      states.set(id, { ...state })
    })

    let caught: AutoPostponeError | null = null
    try {
      await applyAutoPostpone(
        [
          card({ id: 31 as DbId, cardType: "extracts", due: new Date("2026-01-01"), priority: 20 }),
          card({ id: 32 as DbId, cardType: "extracts", due: new Date("2026-01-01"), priority: 20 })
        ],
        {
          now: new Date("2026-01-20T12:00:00"),
          protectedIds: new Set(),
          createBatchId: () => "batch-partial"
        }
      )
    } catch (e) {
      caught = e as AutoPostponeError
    }
    expect(caught).toBeInstanceOf(AutoPostponeError)
    expect(caught!.details.committedBeforeFailure).toBe(1)
    expect(caught!.details.rolledBackCount).toBe(1)
    expect(caught!.details.rollbackFailed).toEqual([])
    expect(states.get(31).lastAction).not.toBe("autoPostpone")
    expect(states.get(31).intervalDays).toBe(5)
    expect(writes).toBeGreaterThan(1)
  })

  it("deferIROverflow keeps intervalDays and Topic position; returns real success/failed", async () => {
    seed(101, {
      intervalDays: 11,
      due: new Date("2026-01-01"),
      priority: 30,
      position: 42,
      stage: "topic.work",
      lastAction: "next",
      postponeCount: 0
    })
    seed(102, {
      intervalDays: 6,
      due: new Date("2026-01-01"),
      priority: 30,
      position: null,
      stage: "extract.raw",
      lastAction: "next",
      postponeCount: 0
    })
    seed(103, {
      intervalDays: 6,
      due: new Date("2026-01-01"),
      priority: 30,
      stage: "extract.raw",
      lastAction: "next",
      postponeCount: 0
    })

    const { saveIRState } = await import("../incrementalReadingStorage")
    vi.mocked(saveIRState).mockImplementation(async (id: number, state: any) => {
      if (id === 103) throw new Error("boom-103")
      states.set(id, { ...state })
    })

    const dueCards = [
      card({ id: 101 as DbId, cardType: "topic", due: new Date("2026-01-01"), priority: 30, intervalDays: 11, position: 42 }),
      card({ id: 102 as DbId, cardType: "extracts", due: new Date("2026-01-01"), priority: 30, intervalDays: 6 }),
      card({ id: 103 as DbId, cardType: "extracts", due: new Date("2026-01-01"), priority: 30, intervalDays: 6 })
    ]
    // empty queue → all overflow
    const result = await deferIROverflow(dueCards, [], { now: new Date("2026-01-20T12:00:00") })
    expect(result.plannedCount).toBe(3)
    expect(result.successIds).toContain(101)
    expect(result.successIds).toContain(102)
    expect(result.failed.map(f => f.id)).toContain(103)
    expect(result.deferredCount).toBe(result.successIds.length)
    expect(result.deferredCount).not.toBe(result.plannedCount)
    expect(states.get(101).intervalDays).toBe(11)
    expect(states.get(102).intervalDays).toBe(6)
    // B2 修补：不得借 postpone 重排 Topic position
    expect(states.get(101).position).toBe(42)
    expect(states.get(101).lastAction).toBe("autoPostpone")
  })
})
