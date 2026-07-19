/**
 * Batch B2：sibling queueDelay 只影响首次 due；嵌套 Extract 经 sourceTopicId
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { DAY_MS } from "../incrementalReadingDispersal"
import {
  computeDispersedSchedule,
  computeNewExtractQueueDelayDays,
  countEarlierSameDayExtractSiblings,
  growIntervalDays,
  resolveExtractSourceTopicId
} from "./irSchedulingHelpers"

const blockById = new Map<number, Block>()
const dropCalls: number[] = []

vi.mock("./irBlockCache", () => ({
  getBlockCached: vi.fn(async (id: number) => blockById.get(id)),
  invalidateIrBlockCache: vi.fn(),
  dropIrBlockCacheEntry: vi.fn((id: number) => {
    dropCalls.push(id)
  })
}))

function block(partial: {
  id: number
  parent?: number | null
  children?: number[]
  cardType?: "topic" | "extracts" | "none"
  sourceTopicId?: number
  created?: Date
}): Block {
  const props: Array<{ name: string; value: unknown }> = []
  if (partial.sourceTopicId != null) {
    props.push({ name: "ir.sourceTopicId", value: partial.sourceTopicId })
  }
  if (partial.created) {
    props.push({ name: "created", value: partial.created.toISOString() })
  }
  const refs =
    partial.cardType && partial.cardType !== "none"
      ? [
          {
            type: 2,
            alias: "card",
            data: [{ name: "type", value: partial.cardType }]
          }
        ]
      : []
  return {
    id: partial.id as DbId,
    parent: (partial.parent ?? undefined) as DbId | undefined,
    children: (partial.children ?? []) as DbId[],
    content: [],
    properties: props,
    refs,
    // deckUtils / getBlockCreatedDate may read created on block root
    created: partial.created?.getTime?.() ?? partial.created,
    creation: partial.created
  } as unknown as Block
}

describe("B2 queueDelay due-only + nested sourceTopicId", () => {
  beforeEach(() => {
    blockById.clear()
    dropCalls.length = 0
    vi.clearAllMocks()
  })

  it("computeDispersedSchedule keeps interval free of queueDelay; due adds both", () => {
    const baseDate = new Date(2026, 6, 19, 12, 0, 0)
    const baseIntervalDays = 4
    const queueDelayDays = 1.5
    const schedule = computeDispersedSchedule(10 as DbId, "extracts", baseDate, baseIntervalDays, {
      isNew: true,
      queueDelayDays
    })
    const without = computeDispersedSchedule(10 as DbId, "extracts", baseDate, baseIntervalDays, {
      isNew: true,
      queueDelayDays: 0
    })
    // intentional interval identical whether or not queueDelay is present
    expect(schedule.intervalDays).toBe(without.intervalDays)
    expect(schedule.queueDelayDays).toBe(queueDelayDays)
    // new extract forward jitter only: [base, base + 0.5*base]
    expect(schedule.intervalDays).toBeGreaterThanOrEqual(baseIntervalDays)
    expect(schedule.intervalDays).toBeLessThanOrEqual(baseIntervalDays + baseIntervalDays * 0.5)
    const dueOffsetDays = (schedule.due.getTime() - baseDate.getTime()) / DAY_MS
    expect(dueOffsetDays).toBeCloseTo(schedule.intervalDays + queueDelayDays, 8)
    // 下一次增长只从 intentional interval 起（不含 delay）
    const grown = growIntervalDays("extracts", schedule.intervalDays)
    expect(grown).toBeCloseTo(
      Math.min(30, Math.max(1, schedule.intervalDays * 1.35)),
      5
    )
    const grownIfDelayPolluted = Math.min(30, (schedule.intervalDays + queueDelayDays) * 1.35)
    expect(grown).toBeLessThan(grownIfDelayPolluted)
  })

  it("resolveExtractSourceTopicId prefers ir.sourceTopicId over non-topic parent", async () => {
    // Real shape: Topic 231 → body 237 → Extract 1646
    blockById.set(231, block({ id: 231, cardType: "topic", children: [237] }))
    blockById.set(237, block({ id: 237, parent: 231, children: [1646], cardType: "none" }))
    blockById.set(
      1646,
      block({
        id: 1646,
        parent: 237,
        cardType: "extracts",
        sourceTopicId: 231,
        created: new Date(2026, 6, 19, 10, 0, 0)
      })
    )

    const topicId = await resolveExtractSourceTopicId(
      1646 as DbId,
      blockById.get(1646)!
    )
    expect(topicId).toBe(231)
  })

  it("falls back to direct parent Topic when sourceTopicId missing", async () => {
    blockById.set(10, block({ id: 10, cardType: "topic", children: [11] }))
    blockById.set(11, block({ id: 11, parent: 10, cardType: "extracts" }))
    const topicId = await resolveExtractSourceTopicId(11 as DbId, blockById.get(11)!)
    expect(topicId).toBe(10)
  })

  it("makes an invalid sourceTopicId visible before direct-parent fallback", async () => {
    blockById.set(10, block({ id: 10, cardType: "topic", children: [11] }))
    blockById.set(99, block({ id: 99, cardType: "none" }))
    blockById.set(11, block({
      id: 11,
      parent: 10,
      cardType: "extracts",
      sourceTopicId: 99
    }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const topicId = await resolveExtractSourceTopicId(11 as DbId, blockById.get(11)!)

    expect(topicId).toBe(10)
    expect(warn).toHaveBeenCalledWith(
      "[IR] Extract sourceTopicId does not point to a Topic",
      { blockId: 11, sourceTopicId: 99 }
    )
    warn.mockRestore()
  })

  it("nested same-day siblings produce ordered delay under source topic", async () => {
    const day = new Date(2026, 6, 19, 9, 0, 0)
    blockById.set(231, block({ id: 231, cardType: "topic", children: [237] }))
    blockById.set(237, block({ id: 237, parent: 231, children: [1645, 1646], cardType: "none" }))
    blockById.set(
      1645,
      block({
        id: 1645,
        parent: 237,
        cardType: "extracts",
        sourceTopicId: 231,
        created: new Date(day.getTime())
      })
    )
    blockById.set(
      1646,
      block({
        id: 1646,
        parent: 237,
        cardType: "extracts",
        sourceTopicId: 231,
        created: new Date(day.getTime() + 60_000)
      })
    )

    const delay0 = await computeNewExtractQueueDelayDays(
      1645 as DbId,
      blockById.get(1645)!,
      5
    )
    const delay1 = await computeNewExtractQueueDelayDays(
      1646 as DbId,
      blockById.get(1646)!,
      5
    )
    expect(delay0).toBe(0)
    expect(delay1).toBeGreaterThan(0)
    const step = Math.min(0.5, Math.max(0.15, 5 * 0.2))
    expect(delay1).toBeCloseTo(step, 8)
  })

  it("respects depth/count caps when scanning siblings", async () => {
    const day = new Date(2026, 6, 19, 9, 0, 0)
    blockById.set(1, block({ id: 1, cardType: "topic", children: [2] }))
    // self at depth 2 under topic; with maxDepth=1 we never see 3/4/99
    blockById.set(2, block({ id: 2, parent: 1, children: [3, 4, 99], cardType: "none" }))
    blockById.set(
      3,
      block({
        id: 3,
        parent: 2,
        cardType: "extracts",
        sourceTopicId: 1,
        created: new Date(day.getTime())
      })
    )
    blockById.set(
      4,
      block({
        id: 4,
        parent: 2,
        cardType: "extracts",
        sourceTopicId: 1,
        created: new Date(day.getTime() + 1000)
      })
    )
    blockById.set(
      99,
      block({
        id: 99,
        parent: 2,
        cardType: "extracts",
        sourceTopicId: 1,
        created: new Date(day.getTime() + 2000)
      })
    )

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const indexDeep = await countEarlierSameDayExtractSiblings({
      sourceTopicId: 1 as DbId,
      selfId: 99 as DbId,
      selfCreated: new Date(day.getTime() + 2000),
      maxDepth: 1,
      maxBlocks: 50,
      concurrency: 2
    })
    // depth 1 only loads children of topic (= block 2, not extracts)
    expect(indexDeep).toBe(0)
    expect(warn).toHaveBeenCalledWith(
      "[IR] sibling extract scan truncated",
      expect.objectContaining({ sourceTopicId: 1, maxDepth: 1 })
    )
    warn.mockClear()

    const indexOk = await countEarlierSameDayExtractSiblings({
      sourceTopicId: 1 as DbId,
      selfId: 99 as DbId,
      selfCreated: new Date(day.getTime() + 2000),
      maxDepth: 2,
      maxBlocks: 50,
      concurrency: 2
    })
    expect(indexOk).toBe(2)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("hard-caps Infinity/huge scan params", async () => {
    const day = new Date(2026, 6, 19, 9, 0, 0)
    blockById.set(1, block({ id: 1, cardType: "topic", children: [2] }))
    blockById.set(2, block({
      id: 2,
      parent: 1,
      cardType: "extracts",
      sourceTopicId: 1,
      created: day
    }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const index = await countEarlierSameDayExtractSiblings({
      sourceTopicId: 1 as DbId,
      selfId: 9 as DbId,
      selfCreated: new Date(day.getTime() + 5000),
      maxDepth: Number.POSITIVE_INFINITY,
      maxBlocks: 1e9,
      concurrency: Number.NaN
    })
    // only one earlier extract under hard caps
    expect(index).toBe(1)
    // no truncation with tiny tree
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("does not count nested different-topic extracts as siblings", async () => {
    const day = new Date(2026, 6, 19, 9, 0, 0)
    // Topic 1 → nested Topic 50 → Extract 51 (belongs to 50)
    //         → body 2 → Extract 3 (belongs to 1)
    blockById.set(1, block({ id: 1, cardType: "topic", children: [50, 2] }))
    blockById.set(50, block({ id: 50, parent: 1, cardType: "topic", children: [51] }))
    blockById.set(
      51,
      block({
        id: 51,
        parent: 50,
        cardType: "extracts",
        sourceTopicId: 50,
        created: day
      })
    )
    blockById.set(2, block({ id: 2, parent: 1, children: [3, 99], cardType: "none" }))
    blockById.set(
      3,
      block({
        id: 3,
        parent: 2,
        cardType: "extracts",
        sourceTopicId: 1,
        created: new Date(day.getTime() + 1000)
      })
    )
    blockById.set(
      99,
      block({
        id: 99,
        parent: 2,
        cardType: "extracts",
        sourceTopicId: 1,
        created: new Date(day.getTime() + 2000)
      })
    )

    const index = await countEarlierSameDayExtractSiblings({
      sourceTopicId: 1 as DbId,
      selfId: 99 as DbId,
      selfCreated: new Date(day.getTime() + 2000),
      maxDepth: 3,
      maxBlocks: 50
    })
    // only extract 3 (same source); 51 is under nested topic / different source
    expect(index).toBe(1)
  })

  it("initial children beyond maxBlocks do not over-read; truncation warns", async () => {
    const day = new Date(2026, 6, 19, 9, 0, 0)
    const childIds = Array.from({ length: 10 }, (_, i) => 100 + i)
    blockById.set(1, block({ id: 1, cardType: "topic", children: childIds }))
    for (const id of childIds) {
      blockById.set(
        id,
        block({
          id,
          parent: 1,
          cardType: "extracts",
          // legacy: no sourceTopicId, direct parent is source Topic
          created: new Date(day.getTime() + id)
        })
      )
    }

    const { getBlockCached } = await import("./irBlockCache")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.mocked(getBlockCached).mockClear()

    const index = await countEarlierSameDayExtractSiblings({
      sourceTopicId: 1 as DbId,
      selfId: 999 as DbId,
      selfCreated: new Date(day.getTime() + 50_000),
      maxDepth: 2,
      maxBlocks: 3,
      concurrency: 2
    })

    // at most 3 blocks visited beyond the root get-block
    const childLoads = vi.mocked(getBlockCached).mock.calls.filter(
      ([id]) => id !== 1
    ).length
    expect(childLoads).toBeLessThanOrEqual(3)
    expect(index).toBeLessThanOrEqual(3)
    expect(warn).toHaveBeenCalled()
    const msg = String(warn.mock.calls[0]?.[0] ?? "")
    expect(msg).toContain("truncated")
    warn.mockRestore()
  })
})
