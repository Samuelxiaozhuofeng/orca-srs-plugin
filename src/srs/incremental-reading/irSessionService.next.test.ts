/**
 * performNext 快照 / undoPerformNext 回滚：
 * - performNext 返回动作前的完整 IR 状态（撤销上一篇的回滚依据）
 * - undoPerformNext 把该快照整体写回（排期、断点、SAC 计数一并复原）
 * - 写回失败必须抛出（调用方保留撤销入口重试，不做静默成功）
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../../orca.d.ts"
import type { IRState } from "./irTypes"

const loadIRState = vi.fn()
const saveIRState = vi.fn(async (_blockId?: unknown, _state?: unknown) => undefined)
const markAsRead = vi.fn()

vi.mock("../incrementalReadingStorage", () => ({
  loadIRState: (blockId: DbId) => loadIRState(blockId),
  saveIRState: (blockId: DbId, state: IRState) => saveIRState(blockId, state),
  markAsRead: (blockId: DbId, options?: unknown) => markAsRead(blockId, options),
  postpone: vi.fn(),
  updatePriority: vi.fn()
}))

vi.mock("../irSessionActions", () => ({
  completeIRCard: vi.fn(async () => undefined)
}))

// @ts-expect-error test global
globalThis.orca = { notify: vi.fn(), invokeBackend: vi.fn(), state: { blocks: {} } }

import { performNext, undoPerformNext } from "./irSessionService"

function makeState(overrides: Partial<IRState> = {}): IRState {
  return {
    priority: 50,
    lastRead: new Date("2026-07-20T00:00:00.000Z"),
    readCount: 3,
    intervalDays: 4,
    postponeCount: 1,
    stage: "extract.refined",
    lastAction: "next",
    due: new Date("2026-07-24T00:00:00.000Z"),
    position: null,
    resumeBlockId: 77,
    readingBreakpoint: {
      previewBlockId: null,
      selection: null,
      updatedAt: new Date("2026-07-23T10:00:00.000Z"),
      viewportAnchor: { rootBlockId: 1, blockId: 77, topOffsetPx: 120 }
    },
    autoPostponeBatchId: null,
    sacProgressKey: "77:120",
    sacStagnantCount: 1,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("performNext previousState", () => {
  it("returns the pre-action snapshot alongside the new state", async () => {
    const prev = makeState()
    const next = makeState({
      readCount: 4,
      intervalDays: 5,
      due: new Date("2026-07-31T00:00:00.000Z"),
      lastRead: new Date("2026-07-26T00:00:00.000Z")
    })
    loadIRState.mockResolvedValue(prev)
    markAsRead.mockResolvedValue(next)

    const outcome = await performNext(1, { dwellMs: 30_000 })

    expect(outcome.leftCard).toBe(true)
    expect(outcome.state).toEqual(next)
    expect(outcome.previousState).toBe(prev)
  })

  it("still returns the snapshot when the stage transition writes again", async () => {
    const prev = makeState({ stage: "topic.preview", lastAction: "init" })
    const next = makeState({ stage: "topic.preview", readCount: 1 })
    loadIRState.mockResolvedValue(prev)
    markAsRead.mockResolvedValue(next)

    const outcome = await performNext(2)

    expect(outcome.previousState).toBe(prev)
    // 阶段推进走了第二次写入，快照仍是动作前状态
    expect(saveIRState).toHaveBeenCalled()
    expect(outcome.state?.stage).not.toBe(prev.stage)
  })
})

describe("undoPerformNext", () => {
  it("writes the whole snapshot back so scheduling and breakpoint are restored", async () => {
    const snapshot = makeState()

    const restored = await undoPerformNext(9, snapshot)

    expect(saveIRState).toHaveBeenCalledWith(9, snapshot)
    expect(restored).toEqual(snapshot)
  })

  it("propagates write failures instead of reporting a fake undo", async () => {
    saveIRState.mockRejectedValueOnce(new Error("写入失败"))

    await expect(undoPerformNext(9, makeState())).rejects.toThrow("写入失败")
  })
})
