import { describe, expect, it } from "vitest"
import {
  buildCollectError,
  buildCollectOk,
  collectStatusLabel,
  shouldShowEmptyQueue,
  shouldShowLoadError
} from "./irCollectResult"
import type { IRCard } from "../incrementalReadingCollector"

function fakeCard(id: number): IRCard {
  return {
    id,
    cardType: "topic",
    priority: 50,
    position: 1,
    due: new Date(),
    intervalDays: 5,
    postponeCount: 0,
    stage: "topic.preview",
    lastAction: "init",
    lastRead: null,
    readCount: 0,
    isNew: true,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("irCollectResult", () => {
  it("distinguishes empty queue from load error", () => {
    const empty = buildCollectOk([])
    const error = buildCollectError(new Error("backend down"))

    expect(shouldShowEmptyQueue(empty)).toBe(true)
    expect(shouldShowLoadError(empty)).toBe(false)
    expect(collectStatusLabel(empty.status)).toBe("暂无到期内容")

    expect(shouldShowEmptyQueue(error)).toBe(false)
    expect(shouldShowLoadError(error)).toBe(true)
    expect(collectStatusLabel(error.status)).toBe("数据读取失败")
    expect(error.errorMessage).toContain("backend down")
  })

  it("marks partial failures without pretending full empty", () => {
    const partial = buildCollectOk([fakeCard(1)], 2)
    expect(partial.status).toBe("partial")
    expect(partial.cards).toHaveLength(1)
    expect(shouldShowEmptyQueue(partial)).toBe(false)
    expect(shouldShowLoadError(partial)).toBe(false)
  })

  it("treats zero readable cards with failures as a load error", () => {
    const result = buildCollectOk([], 3)
    expect(result.status).toBe("error")
    expect(result.failedCount).toBe(3)
    expect(shouldShowLoadError(result)).toBe(true)
    expect(shouldShowEmptyQueue(result)).toBe(false)
  })
})
