/**
 * 会话内「撤销上一篇」纯逻辑：
 * - 只对阅读条目建记录
 * - 回插按原下标，越界钳到队尾，重复回插不产生副本
 * - 卡片按 IR 快照修正（断点/排期/新卡判定），否则撤销只回 UI
 * - 入口可用性：完成页 / 空队列 / 进行中一律不可撤销
 */

import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import type { IRSessionEntry } from "./irMixedQueuePolicy"
import type { IRState } from "./irTypes"
import {
  applyIRStateToCard,
  buildNextSuccessNotify,
  canUndoNext,
  createNextUndoRecord,
  IR_NEXT_NOTIFY_TITLE,
  IR_NEXT_SUCCESS_MESSAGE,
  IR_NEXT_SUCCESS_UNDO_MESSAGE,
  reinsertUndoEntry
} from "./irNextUndo"

function makeCard(id: number, overrides: Partial<IRCard> = {}): IRCard {
  return {
    id,
    cardType: "extracts",
    priority: 50,
    position: null,
    due: new Date("2026-07-30T00:00:00.000Z"),
    intervalDays: 6,
    postponeCount: 0,
    stage: "extract.refined",
    lastAction: "next",
    lastRead: new Date("2026-07-26T00:00:00.000Z"),
    readCount: 4,
    isNew: false,
    resumeBlockId: null,
    readingBreakpoint: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null,
    ...overrides
  }
}

function readingEntry(id: number): IRSessionEntry {
  return { kind: "reading", card: makeCard(id), key: `reading-${id}` }
}

function makeState(overrides: Partial<IRState> = {}): IRState {
  return {
    priority: 60,
    lastRead: new Date("2026-07-22T00:00:00.000Z"),
    readCount: 3,
    intervalDays: 4,
    postponeCount: 1,
    stage: "extract.refined",
    lastAction: "next",
    due: new Date("2026-07-26T00:00:00.000Z"),
    position: 12,
    resumeBlockId: 88,
    readingBreakpoint: {
      previewBlockId: null,
      selection: null,
      updatedAt: new Date("2026-07-25T09:00:00.000Z"),
      viewportAnchor: { rootBlockId: 1, blockId: 88, topOffsetPx: 240 }
    },
    autoPostponeBatchId: null,
    sacProgressKey: null,
    sacStagnantCount: 0,
    ...overrides
  }
}

describe("createNextUndoRecord", () => {
  it("records the reading entry, its index and the pre-action snapshot", () => {
    const record = createNextUndoRecord({
      entry: readingEntry(1),
      index: 2,
      snapshot: makeState(),
      now: 1000
    })
    expect(record).not.toBeNull()
    expect(record!.cardId).toBe(1)
    expect(record!.index).toBe(2)
    expect(record!.createdAt).toBe(1000)
  })

  it("refuses review entries (they have their own grading path)", () => {
    const entry = { kind: "review", card: {} as never, key: "review-x" } as IRSessionEntry
    expect(createNextUndoRecord({ entry, index: 0, snapshot: makeState() })).toBeNull()
  })
})

describe("reinsertUndoEntry", () => {
  it("puts the entry back at its original index and selects it", () => {
    const queue = [readingEntry(2), readingEntry(3)]
    const result = reinsertUndoEntry(queue, readingEntry(1), 0)
    expect(result.inserted).toBe(true)
    expect(result.index).toBe(0)
    expect(result.queue.map(e => e.key)).toEqual(["reading-1", "reading-2", "reading-3"])
    // 原队列不被就地修改
    expect(queue.map(e => e.key)).toEqual(["reading-2", "reading-3"])
  })

  it("clamps an out-of-range index to the queue tail", () => {
    const queue = [readingEntry(2)]
    const result = reinsertUndoEntry(queue, readingEntry(1), 9)
    expect(result.index).toBe(1)
    expect(result.queue.map(e => e.key)).toEqual(["reading-2", "reading-1"])
  })

  it("does not duplicate an entry that is already queued", () => {
    const queue = [readingEntry(2), readingEntry(1)]
    const result = reinsertUndoEntry(queue, readingEntry(1), 0)
    expect(result.inserted).toBe(false)
    expect(result.index).toBe(1)
    expect(result.queue).toBe(queue)
  })
})

describe("applyIRStateToCard", () => {
  it("restores scheduling and breakpoint from the snapshot", () => {
    const snapshot = makeState()
    const card = applyIRStateToCard(makeCard(1), snapshot)
    expect(card.due).toBe(snapshot.due)
    expect(card.intervalDays).toBe(4)
    expect(card.readCount).toBe(3)
    expect(card.lastRead).toBe(snapshot.lastRead)
    expect(card.priority).toBe(60)
    expect(card.resumeBlockId).toBe(88)
    expect(card.readingBreakpoint).toBe(snapshot.readingBreakpoint)
    expect(card.isNew).toBe(false)
  })

  it("marks the card new again when the snapshot had never been read", () => {
    const card = applyIRStateToCard(
      makeCard(1),
      makeState({ lastRead: null, readCount: 0 })
    )
    expect(card.isNew).toBe(true)
    expect(card.readCount).toBe(0)
  })

  it("keeps non-IR identity fields untouched", () => {
    const card = applyIRStateToCard(
      makeCard(1, { sourceBookId: 5, sourceBookTitle: "书" }),
      makeState()
    )
    expect(card.id).toBe(1)
    expect(card.cardType).toBe("extracts")
    expect(card.sourceBookId).toBe(5)
    expect(card.sourceBookTitle).toBe("书")
  })
})

describe("canUndoNext", () => {
  const record = createNextUndoRecord({ entry: readingEntry(1), index: 0, snapshot: makeState() })!

  it("allows undo while a card is still being read", () => {
    expect(canUndoNext({ record, showSummary: false, queueLength: 2, isWorking: false })).toBe(true)
  })

  it("blocks undo without a record, on the summary page, on an empty queue, or mid-write", () => {
    expect(canUndoNext({ record: null, showSummary: false, queueLength: 2, isWorking: false })).toBe(false)
    expect(canUndoNext({ record, showSummary: true, queueLength: 2, isWorking: false })).toBe(false)
    expect(canUndoNext({ record, showSummary: false, queueLength: 0, isWorking: false })).toBe(false)
    expect(canUndoNext({ record, showSummary: false, queueLength: 2, isWorking: true })).toBe(false)
  })
})

describe("buildNextSuccessNotify", () => {
  it("omits action when undo is not available", () => {
    const onUndoFromNotify = () => {
      throw new Error("should not run")
    }
    const notify = buildNextSuccessNotify({ canUndo: false, onUndoFromNotify })
    expect(notify.message).toBe(IR_NEXT_SUCCESS_MESSAGE)
    expect(notify.options).toEqual({ title: IR_NEXT_NOTIFY_TITLE })
    expect(notify.options.action).toBeUndefined()
  })

  it("attaches a notify action that calls the undo entry when undo is available", () => {
    let called = 0
    const notify = buildNextSuccessNotify({
      canUndo: true,
      onUndoFromNotify: () => {
        called += 1
      }
    })
    expect(notify.message).toBe(IR_NEXT_SUCCESS_UNDO_MESSAGE)
    expect(notify.options.title).toBe(IR_NEXT_NOTIFY_TITLE)
    expect(typeof notify.options.action).toBe("function")
    notify.options.action!()
    expect(called).toBe(1)
  })
})
