/**
 * Batch B2：priority 单一真相 + card-type clamp
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { adjustIntervalForPriorityChange } from "./irSchedulingHelpers"

const blockById = new Map<number, Block>()
const saved = new Map<number, any>()

vi.mock("./irBlockCache", () => ({
  getBlockCached: vi.fn(async (id: number) => blockById.get(id)),
  invalidateIrBlockCache: vi.fn(),
  dropIrBlockCacheEntry: vi.fn()
}))

vi.mock("./irStatePersistence", () => ({
  loadIRState: vi.fn(async (id: number) => {
    if (!saved.has(id)) {
      throw new Error(`no state for ${id}`)
    }
    return { ...saved.get(id) }
  }),
  saveIRState: vi.fn(async (id: number, state: any) => {
    saved.set(id, { ...state })
  })
}))

vi.mock("../book-ir/bookIRPlanRepository", () => ({
  loadBookIRPlan: vi.fn(async () => null)
}))

import { updatePriority } from "./irSchedulingMutations"
import { performPriorityAdjust } from "./irSessionService"
import { loadIRState, saveIRState } from "./irStatePersistence"

function makeBlock(id: number, cardType: "topic" | "extracts", parent?: number): Block {
  return {
    id: id as DbId,
    parent: parent as DbId | undefined,
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

function seedState(id: number, partial: Record<string, unknown>) {
  saved.set(id, {
    priority: 50,
    lastRead: new Date("2026-01-01"),
    readCount: 2,
    due: new Date("2026-01-10"),
    intervalDays: 10,
    postponeCount: 0,
    stage: "topic.work",
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

describe("B2 priority single truth + clamp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockById.clear()
    saved.clear()
  })

  it("pure helper clamps Extract to 30 and Topic to 60", () => {
    expect(adjustIntervalForPriorityChange("extracts", 30, 50, 10)).toBeLessThanOrEqual(30)
    expect(adjustIntervalForPriorityChange("topic", 60, 50, 10)).toBeLessThanOrEqual(60)
    // 降低 priority（数字变小）→ 间隔拉长，但 Extract 仍 ≤30
    const extract = adjustIntervalForPriorityChange("extracts", 28, 80, 10)
    expect(extract).toBeGreaterThan(28)
    expect(extract).toBeLessThanOrEqual(30)
  })

  it("performPriorityAdjust and updatePriority match on ordinary Topic", async () => {
    blockById.set(1, makeBlock(1, "topic"))
    seedState(1, { priority: 50, intervalDays: 12, cardHint: "topic" })

    // clone initial for second path
    const initial = { ...saved.get(1) }

    const fromUpdate = await updatePriority(1 as DbId, 80)
    saved.set(1, { ...initial })
    const fromSession = await performPriorityAdjust(1 as DbId, 80)

    expect(fromSession.priority).toBe(fromUpdate.priority)
    expect(fromSession.intervalDays).toBe(fromUpdate.intervalDays)
    expect(fromSession.lastAction).toBe("priority")
    expect(fromUpdate.intervalDays).toBe(
      adjustIntervalForPriorityChange("topic", 12, 50, 80)
    )
  })

  it("Extract at 30-day boundary lowering priority still clamps to 30", async () => {
    blockById.set(2, makeBlock(2, "extracts"))
    seedState(2, {
      priority: 50,
      intervalDays: 30,
      stage: "extract.raw",
      lastAction: "next",
      readCount: 3,
      lastRead: new Date("2026-01-01")
    })

    const next = await updatePriority(2 as DbId, 10)
    expect(next.intervalDays).toBeLessThanOrEqual(30)
    expect(next.intervalDays).toBe(
      adjustIntervalForPriorityChange("extracts", 30, 50, 10)
    )

    const session = await performPriorityAdjust(2 as DbId, 10)
    // already at new priority after first update; re-seed
    seedState(2, {
      priority: 50,
      intervalDays: 30,
      stage: "extract.raw",
      lastAction: "next",
      readCount: 3,
      lastRead: new Date("2026-01-01")
    })
    const sessionAgain = await performPriorityAdjust(2 as DbId, 10)
    expect(sessionAgain.intervalDays).toBe(next.intervalDays)
    void session
  })

  it("Topic clamp at 60", async () => {
    blockById.set(3, makeBlock(3, "topic"))
    seedState(3, {
      priority: 50,
      intervalDays: 60,
      readCount: 5,
      lastRead: new Date("2026-01-01")
    })
    const next = await updatePriority(3 as DbId, 10)
    expect(next.intervalDays).toBeLessThanOrEqual(60)
  })

  it("saveIRState is used (cache path) on priority write", async () => {
    blockById.set(4, makeBlock(4, "topic"))
    seedState(4, { priority: 40, intervalDays: 8, readCount: 1, lastRead: new Date() })
    await updatePriority(4 as DbId, 70)
    expect(vi.mocked(saveIRState)).toHaveBeenCalled()
    expect(vi.mocked(loadIRState)).toHaveBeenCalled()
  })
})
