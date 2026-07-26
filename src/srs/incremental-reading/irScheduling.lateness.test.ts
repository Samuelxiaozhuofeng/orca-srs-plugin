/**
 * 迟到补偿：markAsRead 普通路径（非 SAC）的增长基数不再只看存储 intervalDays，
 * 而是在「迟到读」（实际时距 > 存储间隔）时按 IR_LATENESS_WEIGHT 部分采信实际时距。
 * 提前/准时读、无 lastRead 首读、SAC/markAsReadWithPriority/updatePriority/postpone
 * 均不受影响（不在本文件范围内，规格见任务说明）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { DAY_MS } from "../incrementalReadingDispersal"
import {
  computeDispersedSchedule,
  computeElapsedDaysSinceLastRead,
  computeLatenessEffectiveBase,
  growIntervalDays,
  IR_LATENESS_WEIGHT
} from "./irSchedulingHelpers"

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

import { markAsRead } from "./irSchedulingMutations"

function makeBlock(id: number, cardType: "topic" | "extracts"): Block {
  return {
    id: id as DbId,
    parent: undefined,
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
    lastRead: null,
    readCount: 0,
    due: new Date("2026-01-01"),
    intervalDays: 8,
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

const FIXED_NOW = new Date("2026-03-01T12:00:00.000Z")

describe("markAsRead lateness compensation (non-SAC)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockById.clear()
    saved.clear()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("pure helper: elapsed <= stored is a no-op; elapsed > stored applies 0.5 weight", () => {
    expect(computeLatenessEffectiveBase(8, 8)).toBe(8)
    expect(computeLatenessEffectiveBase(8, 4)).toBe(8)
    expect(computeLatenessEffectiveBase(8, null)).toBe(8)
    expect(computeLatenessEffectiveBase(8, 40)).toBe(8 + (40 - 8) * IR_LATENESS_WEIGHT)
    expect(computeLatenessEffectiveBase(8, 40)).toBe(24)
    expect(IR_LATENESS_WEIGHT).toBe(0.5)
  })

  it("computeElapsedDaysSinceLastRead: null lastRead -> null; otherwise (now-lastRead)/day", () => {
    expect(computeElapsedDaysSinceLastRead(null, FIXED_NOW)).toBeNull()
    expect(computeElapsedDaysSinceLastRead(undefined, FIXED_NOW)).toBeNull()
    const lastRead = new Date(FIXED_NOW.getTime() - 40 * DAY_MS)
    expect(computeElapsedDaysSinceLastRead(lastRead, FIXED_NOW)).toBeCloseTo(40, 8)
  })

  it("on-time read (elapsed == stored interval) matches pre-compensation behavior exactly", async () => {
    blockById.set(1, makeBlock(1, "topic"))
    seedState(1, {
      intervalDays: 8,
      readCount: 3,
      lastRead: new Date(FIXED_NOW.getTime() - 8 * DAY_MS)
    })

    const state = await markAsRead(1 as DbId)

    const expectedBase = growIntervalDays("topic", 8)
    expect(expectedBase).toBe(10)
    const expected = computeDispersedSchedule(1 as DbId, "topic", FIXED_NOW, expectedBase, {
      isNew: false
    })
    expect(state.intervalDays).toBe(expected.intervalDays)
    expect(state.due.getTime()).toBe(expected.due.getTime())
  })

  it("early read (elapsed < stored interval) never shortens the interval (matches old behavior)", async () => {
    blockById.set(2, makeBlock(2, "topic"))
    seedState(2, {
      intervalDays: 8,
      readCount: 3,
      lastRead: new Date(FIXED_NOW.getTime() - 4 * DAY_MS)
    })

    const state = await markAsRead(2 as DbId)

    const expectedBase = growIntervalDays("topic", 8)
    const expected = computeDispersedSchedule(2 as DbId, "topic", FIXED_NOW, expectedBase, {
      isNew: false
    })
    expect(state.intervalDays).toBe(expected.intervalDays)
    expect(state.due.getTime()).toBe(expected.due.getTime())
  })

  it("late Topic read: interval 8, elapsed 40 -> base 24 -> x1.25 = 30 (under 60 cap)", async () => {
    blockById.set(3, makeBlock(3, "topic"))
    seedState(3, {
      intervalDays: 8,
      readCount: 3,
      lastRead: new Date(FIXED_NOW.getTime() - 40 * DAY_MS)
    })

    const state = await markAsRead(3 as DbId)

    const effectiveBase = computeLatenessEffectiveBase(8, 40)
    expect(effectiveBase).toBe(24)
    const expectedBase = growIntervalDays("topic", effectiveBase)
    expect(expectedBase).toBe(30)
    const expected = computeDispersedSchedule(3 as DbId, "topic", FIXED_NOW, expectedBase, {
      isNew: false
    })
    expect(state.intervalDays).toBe(expected.intervalDays)
    expect(state.due.getTime()).toBe(expected.due.getTime())

    // Regression guard: uncompensated growth (8 * 1.25 = 10) would have been much
    // shorter than the lateness-compensated result.
    expect(state.intervalDays).toBeGreaterThan(20)
  })

  it("late Extract read: same params (interval 8, elapsed 40) hit the 30-day extract cap", async () => {
    blockById.set(4, makeBlock(4, "extracts"))
    seedState(4, {
      intervalDays: 8,
      readCount: 3,
      lastRead: new Date(FIXED_NOW.getTime() - 40 * DAY_MS)
    })

    const state = await markAsRead(4 as DbId)

    const effectiveBase = computeLatenessEffectiveBase(8, 40)
    expect(effectiveBase).toBe(24)
    // 24 * 1.35 = 32.4, clamped by growIntervalDays's own cardType clamp to 30
    const expectedBase = growIntervalDays("extracts", effectiveBase)
    expect(expectedBase).toBe(30)
    const expected = computeDispersedSchedule(4 as DbId, "extracts", FIXED_NOW, expectedBase, {
      isNew: false
    })
    expect(state.intervalDays).toBe(expected.intervalDays)
    expect(state.due.getTime()).toBe(expected.due.getTime())
    expect(state.intervalDays).toBeLessThanOrEqual(30)
  })

  it("first read (no lastRead) applies no lateness compensation", async () => {
    blockById.set(5, makeBlock(5, "topic"))
    seedState(5, {
      intervalDays: 5,
      readCount: 0,
      lastRead: null
    })

    const state = await markAsRead(5 as DbId)

    const expectedBase = growIntervalDays("topic", 5)
    const expected = computeDispersedSchedule(5 as DbId, "topic", FIXED_NOW, expectedBase, {
      isNew: true
    })
    expect(state.intervalDays).toBe(expected.intervalDays)
    expect(state.due.getTime()).toBe(expected.due.getTime())
  })
})
