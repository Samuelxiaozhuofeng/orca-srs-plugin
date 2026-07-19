/**
 * Batch B2 修补：溢出推后 due-only、保留 position、真实 success/failed
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../../orca.d.ts"
import type { IRCard } from "../incrementalReadingCollector"

const states = new Map<number, any>()

vi.mock("../incrementalReadingStorage", () => ({
  loadIRState: vi.fn(async (id: number) => {
    if (!states.has(id)) throw new Error(`missing ${id}`)
    return { ...states.get(id) }
  }),
  saveIRState: vi.fn(async (id: number, state: any) => {
    states.set(id, { ...state })
  })
}))

import { deferIROverflow } from "./irOverflowDefer"
import { saveIRState } from "../incrementalReadingStorage"

function seed(id: number, partial: Record<string, unknown> = {}) {
  states.set(id, {
    priority: 40,
    lastRead: null,
    readCount: 1,
    due: new Date("2026-01-01"),
    intervalDays: 8,
    postponeCount: 0,
    stage: "topic.work",
    lastAction: "next",
    position: null,
    resumeBlockId: null,
    readingBreakpoint: null,
    autoPostponeBatchId: null,
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
    intervalDays: partial.intervalDays ?? s.intervalDays ?? 8,
    postponeCount: partial.postponeCount ?? 0,
    stage: s.stage ?? "topic.work",
    lastAction: s.lastAction ?? "next",
    lastRead: null,
    readCount: 1,
    isNew: false,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("irOverflowDefer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    states.clear()
  })

  it("preserves Topic position and intervalDays on overflow postpone", async () => {
    seed(1, { position: 7, intervalDays: 12, priority: 30 })
    seed(2, { position: null, intervalDays: 4, priority: 30, stage: "extract.raw" })
    const result = await deferIROverflow(
      [
        card({ id: 1 as DbId, cardType: "topic", position: 7, intervalDays: 12, priority: 30 }),
        card({ id: 2 as DbId, cardType: "extracts", intervalDays: 4, priority: 30 })
      ],
      [],
      { now: new Date("2026-01-20T12:00:00") }
    )
    expect(result.deferredCount).toBe(2)
    expect(states.get(1).position).toBe(7)
    expect(states.get(1).intervalDays).toBe(12)
    expect(states.get(2).intervalDays).toBe(4)
    expect(states.get(1).lastAction).toBe("autoPostpone")
  })

  it("skips selected queue cards and reports real failures", async () => {
    seed(10, { position: 1, intervalDays: 9 })
    seed(11, { intervalDays: 3, stage: "extract.raw" })
    seed(12, { intervalDays: 3, stage: "extract.raw" })
    vi.mocked(saveIRState).mockImplementation(async (id: number, state: any) => {
      if (id === 12) throw new Error("fail-12")
      states.set(id, { ...state })
    })
    const kept = card({ id: 10 as DbId, cardType: "topic", position: 1 })
    const result = await deferIROverflow(
      [
        kept,
        card({ id: 11 as DbId, cardType: "extracts" }),
        card({ id: 12 as DbId, cardType: "extracts" })
      ],
      [kept],
      { now: new Date("2026-01-20T12:00:00") }
    )
    expect(result.plannedCount).toBe(2)
    expect(result.successIds).toEqual([11])
    expect(result.failed.map(f => f.id)).toEqual([12])
    expect(result.deferredCount).toBe(1)
    // selected topic not written
    expect(states.get(10).lastAction).toBe("next")
    expect(states.get(10).position).toBe(1)
  })
})
