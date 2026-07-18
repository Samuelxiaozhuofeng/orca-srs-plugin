/**
 * Sequential Active Cadence (SAC) unit + markAsRead integration tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { IR_BOOK_PLAN_PROP, type BookIRPlanV1 } from "../../importers/epub/types"
import {
  clampSacIntervalDays,
  computeReadingProgressKey,
  computeSacIntervalDays,
  getSequentialActiveBaseIntervalDays,
  growIntervalDays,
  nextSacStagnation,
  SAC_MAX_INTERVAL_DAYS
} from "./irSchedulingHelpers"

describe("SAC pure interval helpers", () => {
  it("maps priority 0/50/100 to about 3/2/1 days", () => {
    expect(getSequentialActiveBaseIntervalDays(0)).toBe(3)
    expect(getSequentialActiveBaseIntervalDays(50)).toBe(2)
    expect(getSequentialActiveBaseIntervalDays(100)).toBe(1)
  })

  it("normalizes out-of-range priorities before applying formula", () => {
    expect(getSequentialActiveBaseIntervalDays(-10)).toBe(3)
    expect(getSequentialActiveBaseIntervalDays(101)).toBe(1)
    expect(getSequentialActiveBaseIntervalDays(Number.NaN)).toBe(2) // default priority 50
    expect(getSequentialActiveBaseIntervalDays(50.4)).toBe(2)
    expect(getSequentialActiveBaseIntervalDays(25)).toBeCloseTo(2.5, 5)
  })

  it("enforces min 1 day and SAC max about 6 days", () => {
    expect(clampSacIntervalDays(0)).toBe(1)
    expect(clampSacIntervalDays(0.5)).toBe(1)
    expect(clampSacIntervalDays(99)).toBe(SAC_MAX_INTERVAL_DAYS)
    expect(computeSacIntervalDays(100, 0)).toBe(1)
    // priority 50 base 2 + 10 stagnant steps → cap 6
    expect(computeSacIntervalDays(50, 10)).toBe(SAC_MAX_INTERVAL_DAYS)
    expect(computeSacIntervalDays(0, 5)).toBe(SAC_MAX_INTERVAL_DAYS)
  })

  it("does not use Topic 1.25 growth for SAC base", () => {
    // Topic growth would turn 8 into 10; SAC base ignores current interval
    expect(growIntervalDays("topic", 8)).toBe(10)
    expect(computeSacIntervalDays(50, 0)).toBe(2)
  })
})

describe("SAC stagnation / progress key", () => {
  it("builds fingerprint from resumeBlockId and breakpoint without updatedAt", () => {
    const a = computeReadingProgressKey({
      resumeBlockId: 10,
      readingBreakpoint: {
        previewBlockId: 11,
        selection: null,
        updatedAt: new Date("2020-01-01")
      }
    })
    const b = computeReadingProgressKey({
      resumeBlockId: 10,
      readingBreakpoint: {
        previewBlockId: 11,
        selection: null,
        updatedAt: new Date("2030-01-01")
      }
    })
    expect(a).toBe(b)
    expect(a).toContain("r=10")
    expect(a).toContain("p=11")
  })

  it("first snapshot does not penalize; repeated same key increases stagnant count", () => {
    const key = computeReadingProgressKey({ resumeBlockId: null, readingBreakpoint: null })
    const first = nextSacStagnation(null, key, 0)
    expect(first.stagnantCount).toBe(0)
    expect(first.progressKey).toBe(key)

    const second = nextSacStagnation(first.progressKey, key, first.stagnantCount)
    expect(second.stagnantCount).toBe(1)

    const third = nextSacStagnation(second.progressKey, key, second.stagnantCount)
    expect(third.stagnantCount).toBe(2)
  })

  it("resets stagnant count when resume advances", () => {
    const empty = computeReadingProgressKey({ resumeBlockId: null })
    const advanced = computeReadingProgressKey({ resumeBlockId: 99 })
    const afterStagnant = nextSacStagnation(empty, empty, 3)
    expect(afterStagnant.stagnantCount).toBe(4)
    const progressed = nextSacStagnation(afterStagnant.progressKey, advanced, afterStagnant.stagnantCount)
    expect(progressed.stagnantCount).toBe(0)
    expect(progressed.progressKey).toBe(advanced)
  })
})

// --- markAsRead integration with sequential plan ---

const blockMap = new Map<DbId, Block>()

function makeBlock(id: DbId, text = ""): Block {
  return {
    id,
    content: [],
    text,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [],
    refs: [],
    backRefs: []
  } as unknown as Block
}

function setProp(block: Block, name: string, value: unknown, type = 2): void {
  const props = block.properties ?? []
  const idx = props.findIndex((p) => p.name === name)
  const prop = { name, value, type } as any
  if (idx >= 0) props[idx] = prop
  else props.push(prop)
  block.properties = props
}

function getProp(block: Block, name: string): unknown {
  return block.properties?.find((p) => p.name === name)?.value
}

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, id: DbId) => {
    if (command === "get-block") return blockMap.get(id)
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async (command: string, ...args: any[]) => {
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = blockMap.get(id)!
          for (const p of props) setProp(block, p.name, p.value, p.type)
        }
        return true
      }
      if (command === "core.editor.setRefData") return true
      return true
    })
  },
  notify: vi.fn(),
  state: { blocks: {} as Record<number, Block> }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

vi.mock("../cardTagRefData", () => ({
  syncCardTagPriority: vi.fn(async () => undefined)
}))

vi.mock("../deckUtils", () => ({
  extractCardType: vi.fn(() => "topic")
}))

import { invalidateIrBlockCache } from "../incrementalReadingStorage"
import { markAsRead, postpone } from "./irSchedulingMutations"
import { loadIRState } from "./irStatePersistence"

function seedTopic(id: DbId, opts: {
  priority?: number
  intervalDays?: number
  sourceBookId?: number | null
  resumeBlockId?: number | null
  readCount?: number
}): void {
  const b = makeBlock(id)
  setProp(b, "ir.priority", opts.priority ?? 50, 3)
  setProp(b, "ir.lastRead", opts.readCount && opts.readCount > 0 ? new Date() : null, 5)
  setProp(b, "ir.readCount", opts.readCount ?? 0, 3)
  setProp(b, "ir.due", new Date(), 5)
  setProp(b, "ir.intervalDays", opts.intervalDays ?? 8, 3)
  setProp(b, "ir.postponeCount", 0, 3)
  setProp(b, "ir.stage", "topic.preview", 2)
  setProp(b, "ir.lastAction", "init", 2)
  setProp(b, "ir.position", Date.now(), 3)
  setProp(b, "ir.resumeBlockId", opts.resumeBlockId ?? null, 3)
  if (opts.sourceBookId != null) {
    setProp(b, "ir.sourceBookId", opts.sourceBookId, 3)
  }
  b.refs = [{ type: 2, alias: "card", to: id } as any]
  blockMap.set(id, b)
  mockOrca.state.blocks[id] = b
}

function seedSequentialPlan(bookId: DbId, activeChapterId: DbId): void {
  const book = makeBlock(bookId, "book")
  const plan: BookIRPlanV1 = {
    version: 1,
    bookBlockId: bookId,
    mode: "sequential",
    priority: 50,
    totalDays: 30,
    selectedChapterIds: [activeChapterId, activeChapterId + 1],
    activeChapterId,
    outcomes: {
      [String(activeChapterId)]: "active",
      [String(activeChapterId + 1)]: "pending"
    },
    lastError: null
  }
  setProp(book, IR_BOOK_PLAN_PROP, plan, 0)
  blockMap.set(bookId, book)
  mockOrca.state.blocks[bookId] = book
}

function seedDistributedPlan(bookId: DbId, chapterIds: DbId[]): void {
  const book = makeBlock(bookId, "book")
  const plan: BookIRPlanV1 = {
    version: 1,
    bookBlockId: bookId,
    mode: "distributed",
    priority: 50,
    totalDays: 10,
    selectedChapterIds: chapterIds,
    activeChapterId: chapterIds[0] ?? null,
    outcomes: Object.fromEntries(chapterIds.map((id) => [String(id), "active" as const])),
    lastError: null
  }
  setProp(book, IR_BOOK_PLAN_PROP, plan, 0)
  blockMap.set(bookId, book)
  mockOrca.state.blocks[bookId] = book
}

beforeEach(() => {
  blockMap.clear()
  mockOrca.state.blocks = {}
  vi.clearAllMocks()
  for (const id of [1, 2, 100, 200]) {
    invalidateIrBlockCache(id)
  }
})

describe("markAsRead SAC for sequential active chapter", () => {
  it("keeps ~2 day cadence for priority=50 across consecutive next (no 8→10→12.5)", async () => {
    seedSequentialPlan(100, 1)
    seedTopic(1, { priority: 50, intervalDays: 8, sourceBookId: 100, readCount: 0 })

    const intervals: number[] = []
    for (let i = 0; i < 3; i++) {
      invalidateIrBlockCache(1)
      const state = await markAsRead(1)
      intervals.push(state.intervalDays)
    }

    // All should stay near SAC base (~2), not topic growth path 10, 12.5, 15.625
    for (const d of intervals) {
      expect(d).toBeGreaterThanOrEqual(1)
      expect(d).toBeLessThanOrEqual(SAC_MAX_INTERVAL_DAYS)
      expect(d).toBeLessThan(8)
    }
    // Without progress, stagnant may raise later intervals but first is ~2 with dispersal
    expect(intervals[0]).toBeGreaterThanOrEqual(1.5)
    expect(intervals[0]).toBeLessThanOrEqual(3.5)
    // Must not match classic 1.25 chain from 8
    expect(intervals).not.toEqual([10, 12.5, 15.625])
    expect(intervals.some((d) => d >= 10)).toBe(false)
  })

  it("applies stagnation protection capped near 6 days when progress does not change", async () => {
    seedSequentialPlan(100, 1)
    seedTopic(1, {
      priority: 50,
      intervalDays: 2,
      sourceBookId: 100,
      readCount: 1,
      resumeBlockId: 50
    })

    let last = 0
    for (let i = 0; i < 8; i++) {
      invalidateIrBlockCache(1)
      const state = await markAsRead(1)
      last = state.intervalDays
      expect(state.intervalDays).toBeLessThanOrEqual(SAC_MAX_INTERVAL_DAYS)
    }
    // After many stagnant nexts, should sit at cap (dispersal may leave it slightly under)
    expect(last).toBeGreaterThanOrEqual(SAC_MAX_INTERVAL_DAYS - 0.5)
    expect(last).toBeLessThanOrEqual(SAC_MAX_INTERVAL_DAYS)

    invalidateIrBlockCache(1)
    const after = await loadIRState(1)
    expect((after.sacStagnantCount ?? 0)).toBeGreaterThanOrEqual(5)
  })

  it("resets short cadence when resumeBlockId advances", async () => {
    seedSequentialPlan(100, 1)
    seedTopic(1, {
      priority: 50,
      intervalDays: 2,
      sourceBookId: 100,
      readCount: 1,
      resumeBlockId: 10
    })

    // Build stagnant streak
    for (let i = 0; i < 4; i++) {
      invalidateIrBlockCache(1)
      await markAsRead(1)
    }
    invalidateIrBlockCache(1)
    let state = await loadIRState(1)
    expect((state.sacStagnantCount ?? 0)).toBeGreaterThanOrEqual(2)

    // Advance resume (simulate reading progress)
    const block = blockMap.get(1)!
    setProp(block, "ir.resumeBlockId", 99, 3)
    invalidateIrBlockCache(1)

    state = await markAsRead(1)
    expect(state.sacStagnantCount).toBe(0)
    expect(state.intervalDays).toBeLessThanOrEqual(3.5)
  })

  it("manual postpone due is not rewritten until next markAsRead", async () => {
    seedSequentialPlan(100, 1)
    seedTopic(1, { priority: 50, intervalDays: 2, sourceBookId: 100, readCount: 1 })

    invalidateIrBlockCache(1)
    const { state: postponed, days } = await postpone(1, 10)
    expect(days).toBe(10)
    expect(postponed.intervalDays).toBe(10)
    expect(postponed.lastAction).toBe("postpone")

    const dueAfterPostpone = postponed.due.getTime()

    // Opening/loading must not re-anchor
    invalidateIrBlockCache(1)
    const loaded = await loadIRState(1)
    expect(loaded.due.getTime()).toBe(dueAfterPostpone)
    expect(loaded.intervalDays).toBe(10)
    expect(loaded.lastAction).toBe("postpone")

    // Only next user action (markAsRead) applies SAC again
    invalidateIrBlockCache(1)
    const afterNext = await markAsRead(1)
    expect(afterNext.lastAction).toBe("next")
    expect(afterNext.intervalDays).toBeLessThan(10)
    expect(afterNext.due.getTime()).not.toBe(dueAfterPostpone)
  })
})

describe("markAsRead non-SAC paths keep Topic growth", () => {
  it("plain Topic still grows by ~1.25", async () => {
    seedTopic(1, { priority: 50, intervalDays: 8, readCount: 1 })
    // no sourceBookId → not sequential

    invalidateIrBlockCache(1)
    const s1 = await markAsRead(1)
    // 8 * 1.25 = 10, plus dispersal ±20% of 10 capped by maxAbs 2
    expect(s1.intervalDays).toBeGreaterThanOrEqual(8)
    expect(s1.intervalDays).toBeLessThanOrEqual(12)

    invalidateIrBlockCache(1)
    const s2 = await markAsRead(1)
    // roughly 10 * 1.25 = 12.5 with dispersal
    expect(s2.intervalDays).toBeGreaterThan(s1.intervalDays * 0.9)
  })

  it("distributed book chapters still use Topic growth", async () => {
    seedDistributedPlan(200, [1, 2])
    seedTopic(1, { priority: 50, intervalDays: 8, sourceBookId: 200, readCount: 1 })

    invalidateIrBlockCache(1)
    const s1 = await markAsRead(1)
    expect(s1.intervalDays).toBeGreaterThanOrEqual(8)
    // SAC would be ~2; distributed must not take SAC path
    expect(s1.intervalDays).toBeGreaterThan(4)
  })
})

describe("SAC migration compatibility", () => {
  it("does not require rewriting old plan attributes", async () => {
    seedSequentialPlan(100, 1)
    // Old chapter: long interval, no sac fields
    seedTopic(1, { priority: 50, intervalDays: 20, sourceBookId: 100, readCount: 3 })
    const bookBefore = JSON.stringify(getProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP))

    invalidateIrBlockCache(1)
    await markAsRead(1)

    const bookAfter = JSON.stringify(getProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP))
    expect(bookAfter).toBe(bookBefore)
    // Chapter gets SAC interval from action; plan untouched
    invalidateIrBlockCache(1)
    const state = await loadIRState(1)
    expect(state.intervalDays).toBeLessThanOrEqual(SAC_MAX_INTERVAL_DAYS)
  })
})
