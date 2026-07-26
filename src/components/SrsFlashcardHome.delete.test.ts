/**
 * 回归：闪卡首页删除单个 cloze/direction 变体不得移除整块 #card（中危#9）。
 *
 * - 删除含 c1/c2 块的 c2：不调用 removeTag，只删 srs.c2.* 前缀属性，块缓存已失效
 * - 删除最后一个变体：removeTag 被调用，并清理全部 srs.* 属性
 * - 读取块失败：抛错（错误可见），不得静默降级为整卡删除
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// 子组件与 React 渲染无关，用空组件替身避免加载重型 UI 依赖图
vi.mock("./flashcard-home/FlashHomePage", () => ({ default: () => null }))
vi.mock("./flashcard-home/CardListView", () => ({ default: () => null }))
vi.mock("./DifficultCardsView", () => ({ default: () => null }))

import { clearBlockCache, hasBlockCacheEntry } from "../srs/storage"

const PLUGIN = "orca-srs"

const invokeEditorCommand = vi.fn()
const invokeBackend = vi.fn()

type AnyBlock = {
  id: number
  content?: unknown[]
  properties?: { name: string; value: unknown; type?: number }[]
}

let blocksById: Record<number, AnyBlock>

function setupGlobals() {
  ;(globalThis as unknown as { window: unknown }).window = {
    React: {
      useState: vi.fn(),
      useEffect: vi.fn(),
      useCallback: vi.fn(),
      useMemo: vi.fn(),
      useRef: vi.fn()
    }
  }
  ;(globalThis as unknown as { orca: unknown }).orca = {
    components: { Button: () => null, ConfirmBox: () => null },
    commands: { invokeEditorCommand },
    invokeBackend,
    notify: vi.fn(),
    state: { blocks: {} }
  }
}

async function importDeleteHelper() {
  const mod = await import("./SrsFlashcardHome")
  return mod.deleteReviewCardBackendData
}

function deletePropertiesCalls(): { blockIds: number[]; names: string[] }[] {
  return invokeEditorCommand.mock.calls
    .filter((call) => call[0] === "core.editor.deleteProperties")
    .map((call) => ({ blockIds: call[2] as number[], names: call[3] as string[] }))
}

function removeTagCalls(): unknown[][] {
  return invokeEditorCommand.mock.calls.filter(
    (call) => call[0] === "core.editor.removeTag"
  )
}

beforeEach(() => {
  invokeEditorCommand.mockReset()
  invokeEditorCommand.mockResolvedValue(undefined)
  invokeBackend.mockReset()
  invokeBackend.mockImplementation(async (api: string, id: number) => {
    if (api === "get-block") return blocksById[id]
    throw new Error(`unexpected backend call: ${api}`)
  })
  blocksById = {}
  clearBlockCache()
  setupGlobals()
})

describe("deleteReviewCardBackendData — cloze 变体", () => {
  it("删除含 c1/c2 块的 c2：不 removeTag，只删 srs.c2.* 前缀，缓存已失效", async () => {
    blocksById[1] = {
      id: 1,
      content: [
        { t: "t", v: "Q " },
        { t: `${PLUGIN}.cloze`, v: "a1", clozeNumber: 1 },
        { t: "t", v: " 与 " },
        { t: `${PLUGIN}.cloze`, v: "a2", clozeNumber: 2 }
      ],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.c1.due", value: "2026-07-26" },
        { name: "srs.c1.stability", value: 1 },
        { name: "srs.c2.due", value: "2026-07-27" },
        { name: "srs.c2.stability", value: 2 }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 1, clozeNumber: 2 },
      PLUGIN
    )

    expect(outcome).toEqual({ kind: "variant-only", remainingVariants: 1 })
    // 绝不摘整块 #card
    expect(removeTagCalls()).toHaveLength(0)
    // 只删 srs.c2.* 前缀属性
    const deletes = deletePropertiesCalls()
    expect(deletes).toHaveLength(1)
    expect(deletes[0].blockIds).toEqual([1])
    expect(deletes[0].names.length).toBeGreaterThan(0)
    expect(deletes[0].names.every((n) => n.startsWith("srs.c2."))).toBe(true)
    // 缓存已失效
    expect(hasBlockCacheEntry(1)).toBe(false)
  })

  it("删除最后一个填空变体：removeTag 被调用并清理全部 srs.* 属性", async () => {
    blocksById[2] = {
      id: 2,
      content: [
        { t: "t", v: "Q " },
        { t: `${PLUGIN}.cloze`, v: "a2", clozeNumber: 2 }
      ],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.c2.due", value: "2026-07-27" },
        { name: "srs.c2.stability", value: 2 }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 2, clozeNumber: 2 },
      PLUGIN
    )

    expect(outcome).toEqual({ kind: "full" })
    const tags = removeTagCalls()
    expect(tags).toHaveLength(1)
    expect(tags[0][2]).toBe(2)
    expect(tags[0][3]).toBe("card")
    const deletes = deletePropertiesCalls()
    expect(deletes).toHaveLength(1)
    // 整卡删除清理全部 srs.* 前缀属性（含 srs.isCard 与变体属性）
    expect(deletes[0].names.sort()).toEqual(
      ["srs.c2.due", "srs.c2.stability", "srs.isCard"].sort()
    )
    expect(hasBlockCacheEntry(2)).toBe(false)
  })
})

describe("deleteReviewCardBackendData — direction 变体", () => {
  it("删除双向块的 forward：不 removeTag，只删 srs.forward.* 前缀", async () => {
    blocksById[3] = {
      id: 3,
      content: [
        { t: "t", v: "左 " },
        { t: `${PLUGIN}.direction`, v: "↔", direction: "bidirectional" },
        { t: "t", v: " 右" }
      ],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.forward.due", value: "2026-07-26" },
        { name: "srs.backward.due", value: "2026-07-27" }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 3, directionType: "forward" },
      PLUGIN
    )

    expect(outcome).toEqual({ kind: "variant-only", remainingVariants: 1 })
    expect(removeTagCalls()).toHaveLength(0)
    const deletes = deletePropertiesCalls()
    expect(deletes).toHaveLength(1)
    expect(deletes[0].names.every((n) => n.startsWith("srs.forward."))).toBe(
      true
    )
    expect(hasBlockCacheEntry(3)).toBe(false)
  })

  it("删除单向块（仅 forward）的 forward：removeTag 被调用", async () => {
    blocksById[4] = {
      id: 4,
      content: [
        { t: "t", v: "左 " },
        { t: `${PLUGIN}.direction`, v: "→", direction: "forward" },
        { t: "t", v: " 右" }
      ],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.forward.due", value: "2026-07-26" }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 4, directionType: "forward" },
      PLUGIN
    )

    expect(outcome).toEqual({ kind: "full" })
    expect(removeTagCalls()).toHaveLength(1)
    expect(hasBlockCacheEntry(4)).toBe(false)
  })
})

describe("deleteReviewCardBackendData — 边界", () => {
  it("普通卡（无变体）：保持整卡删除语义", async () => {
    blocksById[5] = {
      id: 5,
      content: [{ t: "t", v: "basic" }],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.due", value: "2026-07-26" }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData({ id: 5 }, PLUGIN)

    expect(outcome).toEqual({ kind: "full" })
    expect(removeTagCalls()).toHaveLength(1)
    const deletes = deletePropertiesCalls()
    expect(deletes).toHaveLength(1)
    expect(deletes[0].names.sort()).toEqual(["srs.due", "srs.isCard"].sort())
  })

  it("变体删除读取块失败：抛错，不得静默降级为整卡删除", async () => {
    // blocksById 为空 → get-block 返回 undefined
    const deleteReviewCardBackendData = await importDeleteHelper()
    await expect(
      deleteReviewCardBackendData({ id: 6, clozeNumber: 1 }, PLUGIN)
    ).rejects.toThrow(/读取块 #6 失败/)
    expect(removeTagCalls()).toHaveLength(0)
    expect(deletePropertiesCalls()).toHaveLength(0)
  })
})
