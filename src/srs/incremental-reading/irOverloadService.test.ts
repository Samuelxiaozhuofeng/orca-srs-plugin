import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import {
  applyAutoPostpone,
  clearAutoPostponeBatchesForTests,
  isLegacyBacklog,
  selectAutoPostponeCandidates,
  undoAutoPostponeBatch
} from "./irOverloadService"

const states = new Map<number, any>()

vi.mock("../incrementalReadingStorage", () => {
  return {
    loadIRState: vi.fn(async (id: number) => {
      if (!states.has(id)) {
        states.set(id, {
          priority: 40,
          lastRead: null,
          readCount: 0,
          due: new Date("2026-01-01"),
          intervalDays: 3,
          postponeCount: 0,
          stage: "extract.raw",
          lastAction: "init",
          position: null,
          resumeBlockId: null,
          autoPostponeBatchId: null
        })
      }
      // 模拟真实磁盘：只返回已保存字段
      return { ...states.get(id) }
    }),
    saveIRState: vi.fn(async (id: number, state: any) => {
      // 模拟 storage 序列化：只持久化 IRState 已知字段
      states.set(id, {
        priority: state.priority,
        lastRead: state.lastRead,
        readCount: state.readCount,
        due: state.due,
        intervalDays: state.intervalDays,
        postponeCount: state.postponeCount,
        stage: state.stage,
        lastAction: state.lastAction,
        position: state.position,
        resumeBlockId: state.resumeBlockId,
        readingBreakpoint: state.readingBreakpoint ?? null,
        autoPostponeBatchId: state.autoPostponeBatchId ?? null
      })
    })
  }
})

import { loadIRState, saveIRState } from "../incrementalReadingStorage"

function card(partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType,
    priority: partial.priority ?? 40,
    position: null,
    due: partial.due ?? new Date("2026-01-01"),
    intervalDays: 3,
    postponeCount: 0,
    stage: "extract.raw",
    lastAction: "init",
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

describe("irOverloadService", () => {
  const now = new Date("2026-01-20T12:00:00")

  beforeEach(() => {
    vi.clearAllMocks()
    clearAutoPostponeBatchesForTests()
    states.clear()
  })

  it("only selects legacy backlog outside protected set and not high priority", () => {
    const cards = [
      card({ id: 1, cardType: "extracts", priority: 20, due: new Date("2026-01-01") }),
      card({ id: 2, cardType: "extracts", priority: 90, due: new Date("2026-01-01") }),
      card({ id: 3, cardType: "extracts", priority: 20, due: new Date("2026-01-20T08:00:00") }),
      card({ id: 4, cardType: "extracts", priority: 20, due: new Date("2026-01-01") })
    ]
    const selected = selectAutoPostponeCandidates(cards, {
      now,
      protectedIds: new Set([4]),
      highPriorityThreshold: 80
    })
    expect(selected.map(c => c.id)).toEqual([1])
    expect(isLegacyBacklog(cards[2], now)).toBe(false)
  })

  it("persists autoPostponeBatchId so undo can match after reload", async () => {
    const cards = [
      card({ id: 11, cardType: "extracts", priority: 20, due: new Date("2026-01-01") }),
      card({ id: 12, cardType: "extracts", priority: 25, due: new Date("2026-01-02") })
    ]

    const result = await applyAutoPostpone(cards, {
      now,
      protectedIds: new Set(),
      createBatchId: () => "batch-test-1"
    })

    expect(result.deferredCount).toBe(2)
    const s11 = await loadIRState(11)
    expect(s11.autoPostponeBatchId).toBe("batch-test-1")
    expect(s11.lastAction).toBe("autoPostpone")

    const undo = await undoAutoPostponeBatch("batch-test-1")
    expect(undo.restored).toBe(2)
    expect(undo.skipped).toBe(0)
    const restored = await loadIRState(11)
    expect(restored.autoPostponeBatchId).toBeNull()
  })

  it("rolls back partial writes when a mid-batch save fails", async () => {
    const cards = [
      card({ id: 31, cardType: "extracts", priority: 20, due: new Date("2026-01-01") }),
      card({ id: 32, cardType: "extracts", priority: 20, due: new Date("2026-01-01") })
    ]

    let calls = 0
    vi.mocked(saveIRState).mockImplementation(async (id: number, state: any) => {
      calls += 1
      if (id === 32) throw new Error("write failed")
      states.set(id, { ...state })
    })

    const { AutoPostponeError } = await import("./irOverloadService")
    let caught: InstanceType<typeof AutoPostponeError> | null = null
    try {
      await applyAutoPostpone(cards, {
        now,
        protectedIds: new Set(),
        createBatchId: () => "batch-partial"
      })
    } catch (e) {
      caught = e as InstanceType<typeof AutoPostponeError>
    }
    expect(caught).toBeInstanceOf(AutoPostponeError)
    expect(caught!.details.committedBeforeFailure).toBe(1)
    expect(caught!.details.rolledBackCount).toBe(1)
    expect(caught!.details.rollbackFailed).toEqual([])

    // 失败后应回滚：31 不应停留在 autoPostpone
    const s31 = states.get(31)
    if (s31) {
      expect(s31.lastAction).not.toBe("autoPostpone")
      expect(s31.intervalDays).toBe(3)
    }
    expect(calls).toBeGreaterThan(1)
  })

  it("keeps intentional intervalDays on successful auto postpone", async () => {
    states.set(41, {
      priority: 20,
      lastRead: null,
      readCount: 2,
      due: new Date("2026-01-01"),
      intervalDays: 14,
      postponeCount: 0,
      stage: "extract.raw",
      lastAction: "init",
      position: null,
      resumeBlockId: null,
      autoPostponeBatchId: null
    })
    const result = await applyAutoPostpone(
      [card({ id: 41, cardType: "extracts", priority: 20, due: new Date("2026-01-01") })],
      { now, protectedIds: new Set(), createBatchId: () => "batch-interval" }
    )
    expect(result.deferredCount).toBe(1)
    expect(states.get(41).intervalDays).toBe(14)
    expect(states.get(41).lastAction).toBe("autoPostpone")
  })

  it("surfaces rollbackFailed when snapshot restore also fails", async () => {
    const cards = [
      card({ id: 51, cardType: "extracts", priority: 20, due: new Date("2026-01-01") }),
      card({ id: 52, cardType: "extracts", priority: 20, due: new Date("2026-01-01") })
    ]
    states.set(51, {
      priority: 20,
      lastRead: null,
      readCount: 1,
      due: new Date("2026-01-01"),
      intervalDays: 5,
      postponeCount: 0,
      stage: "extract.raw",
      lastAction: "init",
      position: null,
      resumeBlockId: null,
      autoPostponeBatchId: null
    })
    states.set(52, {
      priority: 20,
      lastRead: null,
      readCount: 1,
      due: new Date("2026-01-01"),
      intervalDays: 5,
      postponeCount: 0,
      stage: "extract.raw",
      lastAction: "init",
      position: null,
      resumeBlockId: null,
      autoPostponeBatchId: null
    })

    vi.mocked(saveIRState).mockImplementation(async (id: number, state: any) => {
      // mid-batch write fails on 52
      if (id === 52 && state.lastAction === "autoPostpone") {
        throw new Error("write failed")
      }
      // rollback of 51 also fails
      if (id === 51 && state.lastAction === "init") {
        throw new Error("rollback boom")
      }
      states.set(id, { ...state })
    })

    const { AutoPostponeError } = await import("./irOverloadService")
    let caught: InstanceType<typeof AutoPostponeError> | null = null
    try {
      await applyAutoPostpone(cards, {
        now,
        protectedIds: new Set(),
        createBatchId: () => "batch-rb-fail"
      })
    } catch (e) {
      caught = e as InstanceType<typeof AutoPostponeError>
    }

    expect(caught).toBeInstanceOf(AutoPostponeError)
    expect(caught!.details.committedBeforeFailure).toBe(1)
    expect(caught!.details.rolledBackCount).toBe(0)
    expect(caught!.details.rollbackFailed).toEqual([
      { blockId: 51, error: "rollback boom" }
    ])
    // 错误未被吞掉；51 可能仍停留在 autoPostpone（回滚失败，风险可见）
    expect(states.get(51)?.lastAction).toBe("autoPostpone")
  })

  it("skips undo when user modified the card after auto postpone", async () => {
    const cards = [card({ id: 21, cardType: "extracts", priority: 20, due: new Date("2026-01-01") })]
    // restore real mock implementation for this test
    vi.mocked(saveIRState).mockImplementation(async (id: number, state: any) => {
      states.set(id, {
        ...state,
        autoPostponeBatchId: state.autoPostponeBatchId ?? null
      })
    })

    await applyAutoPostpone(cards, {
      now,
      protectedIds: new Set(),
      createBatchId: () => "batch-test-2"
    })

    const current = await loadIRState(21)
    await saveIRState(21, { ...current, lastAction: "read", autoPostponeBatchId: "batch-test-2" })

    const undo = await undoAutoPostponeBatch("batch-test-2")
    expect(undo.restored).toBe(0)
    expect(undo.skipped).toBe(1)
    expect(undo.reasons[0].reason).toBe("user_modified_after_batch")
  })
})
