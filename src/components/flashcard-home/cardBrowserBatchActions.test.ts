import { beforeEach, describe, expect, it, vi } from "vitest"
import { State } from "ts-fsrs"
import type { ReviewCard, SrsState } from "../../srs/types"

const suspendCard = vi.fn()
const unsuspendCard = vi.fn()
const activatePendingCards = vi.fn()
const resetCardSrsState = vi.fn()
const resetClozeSrsState = vi.fn()
const resetDirectionSrsState = vi.fn()
const invalidateBlockCache = vi.fn()
const invalidateIrBlockCache = vi.fn()
const getDeckTargetBlockId = vi.fn()

vi.mock("../../srs/cardStatusUtils", () => ({
  suspendCard: (...args: unknown[]) => suspendCard(...args),
  unsuspendCard: (...args: unknown[]) => unsuspendCard(...args),
  activatePendingCards: (...args: unknown[]) => activatePendingCards(...args)
}))

vi.mock("../../srs/storage", () => ({
  invalidateBlockCache: (...args: unknown[]) => invalidateBlockCache(...args),
  resetCardSrsState: (...args: unknown[]) => resetCardSrsState(...args),
  resetClozeSrsState: (...args: unknown[]) => resetClozeSrsState(...args),
  resetDirectionSrsState: (...args: unknown[]) =>
    resetDirectionSrsState(...args)
}))

vi.mock("../../srs/incremental-reading/irBlockCache", () => ({
  invalidateIrBlockCache: (...args: unknown[]) =>
    invalidateIrBlockCache(...args)
}))

vi.mock("../../srs/deckUtils", () => ({
  getDeckTargetBlockId: (...args: unknown[]) => getDeckTargetBlockId(...args)
}))

import {
  batchActivateCards,
  batchChangeDeck,
  batchResetCards,
  batchSuspendCards,
  formatBatchFailureLines,
  formatBatchResultSummary,
  writeCardDeckProperty
} from "./cardBrowserBatchActions"

function srs(partial: Partial<SrsState> & { due: Date }): SrsState {
  return {
    stability: 1,
    difficulty: 5,
    interval: 0,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: State.New,
    ...partial
  }
}

function card(
  partial: Partial<ReviewCard> & { id: number; front: string }
): ReviewCard {
  return {
    back: "",
    deck: "Default",
    isNew: true,
    srs: srs({ due: new Date(2026, 0, 1) }),
    ...partial
  }
}

describe("batchSuspendCards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("partial success：单卡失败仍可见", async () => {
    suspendCard
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("write failed"))

    const result = await batchSuspendCards([
      card({ id: 1, front: "a", cardType: "basic" }),
      card({ id: 2, front: "b", cardType: "basic" })
    ])

    expect(result.success).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].blockId).toBe(2)
    expect(result.failed[0].error).toContain("write failed")
    expect(formatBatchResultSummary("暂停", result)).toContain("失败 1")
    expect(formatBatchFailureLines(result)[0]).toContain("#2")
  })
})

describe("batchActivateCards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("pending 按 block 去重；正常跳过；suspended 逐卡 unsuspend", async () => {
    activatePendingCards.mockResolvedValue({
      activated: [10],
      failed: []
    })
    unsuspendCard.mockResolvedValue(undefined)

    const result = await batchActivateCards(
      [
        card({ id: 10, front: "p1", isPending: true, cardType: "cloze", clozeNumber: 1 }),
        card({ id: 10, front: "p2", isPending: true, cardType: "cloze", clozeNumber: 2 }),
        card({ id: 20, front: "ok", cardType: "basic" }),
        card({
          id: 30,
          front: "s",
          isSuspended: true,
          cardType: "basic"
        })
      ],
      { pluginName: "srs" }
    )

    expect(activatePendingCards).toHaveBeenCalledWith([10])
    expect(unsuspendCard).toHaveBeenCalledTimes(1)
    expect(result.success.map((s) => s.blockId).sort()).toEqual([10, 10, 30])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].blockId).toBe(20)
  })

  it("pending 激活失败进入 failed", async () => {
    activatePendingCards.mockResolvedValue({
      activated: [],
      failed: [{ blockId: 7, error: "no tag" }]
    })

    const result = await batchActivateCards(
      [card({ id: 7, front: "p", isPending: true, cardType: "basic" })],
      { pluginName: "srs" }
    )
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toBe("no tag")
    expect(result.success).toHaveLength(0)
  })
})

describe("batchResetCards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCardSrsState.mockResolvedValue({})
    resetClozeSrsState.mockResolvedValue({})
    resetDirectionSrsState.mockResolvedValue({})
  })

  it("按变体路由 reset，失败保留", async () => {
    resetClozeSrsState.mockRejectedValueOnce(new Error("reset boom"))

    const result = await batchResetCards([
      card({ id: 1, front: "c", cardType: "cloze", clozeNumber: 1 }),
      card({ id: 2, front: "d", cardType: "direction", directionType: "forward" }),
      card({ id: 3, front: "b", cardType: "basic" })
    ])

    expect(resetClozeSrsState).toHaveBeenCalledWith(1, 1)
    expect(resetDirectionSrsState).toHaveBeenCalledWith(2, "forward")
    expect(resetCardSrsState).toHaveBeenCalledWith(3)
    expect(result.failed).toHaveLength(1)
    expect(result.success).toHaveLength(2)
    expect(result.failed[0].error).toContain("reset boom")
  })
})

describe("batchChangeDeck / writeCardDeckProperty", () => {
  const invokeEditorCommand = vi.fn()
  const invokeBackend = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { orca?: unknown }).orca = {
      invokeBackend,
      commands: { invokeEditorCommand }
    }
  })

  it("Default 写空数组并失效双缓存", async () => {
    invokeBackend.mockResolvedValue({
      id: 1,
      refs: [
        {
          id: 99,
          type: 2,
          alias: "card",
          from: 1,
          to: 0,
          data: []
        }
      ]
    })
    invokeEditorCommand.mockResolvedValue(undefined)

    await writeCardDeckProperty(1, null)

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      expect.objectContaining({ id: 99, alias: "card" }),
      [{ name: "牌组", value: [] }]
    )
    expect(invalidateBlockCache).toHaveBeenCalledWith(1)
    expect(invalidateIrBlockCache).toHaveBeenCalledWith(1)
  })

  it("非 Default createRef + setRefData；createRef 非法则失败可见", async () => {
    invokeBackend.mockResolvedValue({
      id: 5,
      refs: [
        {
          id: 50,
          type: 2,
          alias: "card",
          from: 5,
          to: 0,
          data: []
        }
      ]
    })
    invokeEditorCommand.mockResolvedValueOnce(0) // 非法 refId

    await expect(writeCardDeckProperty(5, 900)).rejects.toThrow(/非法 refId/)
  })

  it("同块去重只写一次；解析失败全部 failed", async () => {
    // 无代表块 → 解析失败
    const result = await batchChangeDeck(
      [
        card({ id: 1, front: "a", deck: "X", cardType: "basic" }),
        card({
          id: 1,
          front: "a2",
          deck: "X",
          cardType: "cloze",
          clozeNumber: 1
        })
      ],
      "MissingDeck",
      [card({ id: 99, front: "z", deck: "Other" })]
    )

    expect(result.success).toHaveLength(0)
    expect(result.failed).toHaveLength(2)
    expect(result.failed[0].error).toMatch(/找不到牌组|无法解析/)
  })

  it("成功路径：同块两变体只 createRef/setRef 一次，两条 success", async () => {
    getDeckTargetBlockId.mockReturnValue(777)
    invokeBackend.mockImplementation(async (_cmd: string, id: number) => {
      if (id === 20) {
        // 代表块（来源牌组 Japanese）
        return {
          id: 20,
          refs: [
            {
              id: 200,
              type: 2,
              alias: "card",
              from: 20,
              to: 0,
              data: [{ name: "牌组", value: [201] }]
            },
            { id: 201, type: 3, from: 20, to: 777 }
          ]
        }
      }
      // 目标写入块
      return {
        id,
        refs: [
          {
            id: 100 + id,
            type: 2,
            alias: "card",
            from: id,
            to: 0,
            data: []
          }
        ]
      }
    })
    invokeEditorCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.createRef") return 555
      return undefined
    })

    const source = [
      card({ id: 20, front: "rep", deck: "Japanese", cardType: "basic" })
    ]
    const targets = [
      card({ id: 8, front: "c1", deck: "Default", cardType: "cloze", clozeNumber: 1 }),
      card({ id: 8, front: "c2", deck: "Default", cardType: "cloze", clozeNumber: 2 })
    ]

    const result = await batchChangeDeck(targets, "Japanese", source)

    const createCalls = invokeEditorCommand.mock.calls.filter(
      (c: unknown[]) => c[0] === "core.editor.createRef"
    )
    expect(createCalls).toHaveLength(1)
    expect(result.success).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(invalidateBlockCache).toHaveBeenCalledWith(8)
  })

  it("scope 内选中可改到 scope 外现有牌组（全库 deckResolutionCards）", async () => {
    getDeckTargetBlockId.mockReturnValue(888)
    invokeBackend.mockImplementation(async (_cmd: string, id: number) => {
      if (id === 50) {
        // 全库中牌组 B 的代表块（不在 scope A 内）
        return {
          id: 50,
          refs: [
            {
              id: 500,
              type: 2,
              alias: "card",
              from: 50,
              to: 0,
              data: [{ name: "牌组", value: [501] }]
            },
            { id: 501, type: 3, from: 50, to: 888 }
          ]
        }
      }
      return {
        id,
        refs: [
          {
            id: 100 + id,
            type: 2,
            alias: "card",
            from: id,
            to: 0,
            data: []
          }
        ]
      }
    })
    invokeEditorCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.createRef") return 666
      return undefined
    })

    // 当前 scope 只有 A 的卡
    const scopeTargets = [
      card({ id: 9, front: "in-A", deck: "A", cardType: "basic" })
    ]
    // 全库含 B 代表 → 可解析目标
    const libraryForResolve = [
      card({ id: 9, front: "in-A", deck: "A", cardType: "basic" }),
      card({ id: 50, front: "in-B", deck: "B", cardType: "basic" })
    ]

    // 仅 scope 无法解析 B
    const failOnlyScope = await batchChangeDeck(scopeTargets, "B", scopeTargets)
    expect(failOnlyScope.failed.length).toBe(1)
    expect(failOnlyScope.failed[0].error).toMatch(/找不到牌组|无法解析/)

    // 全库可改到 B
    const ok = await batchChangeDeck(scopeTargets, "B", libraryForResolve)
    expect(ok.success).toHaveLength(1)
    expect(ok.failed).toHaveLength(0)
    const createCalls = invokeEditorCommand.mock.calls.filter(
      (c: unknown[]) => c[0] === "core.editor.createRef"
    )
    expect(createCalls.some((c: unknown[]) => c[3] === 888)).toBe(true)
  })
})
