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

describe("deleteReviewCardBackendData — image-occlusion 变体", () => {
  it("末变体（行内宿主无 prevRepr）：整卡删除但不把宿主 _repr 改成 image", async () => {
    const masks = JSON.stringify({
      version: 1,
      regions: [
        { id: "a", n: 1, shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }
      ]
    })
    // 文本块 + 行内图宿主：从未写 prevRepr，_repr 保持 text
    blocksById[41] = {
      id: 41,
      content: [
        { t: "t", v: "caption " },
        { t: "i", v: "./image-inline.png" }
      ],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.io.masks", value: masks },
        { name: "srs.io.src", value: "./image-inline.png" },
        { name: "srs.c1.due", value: "2026-08-01" },
        { name: "_repr", value: { type: "text" } }
      ],
      _repr: { type: "text" }
    } as AnyBlock & { _repr: { type: string } }

    // forceBackend load 会 get-block；restore 后还会再 get-block
    invokeBackend.mockImplementation(async (api: string, id: number) => {
      if (api === "get-block") return blocksById[id]
      throw new Error(`unexpected backend call: ${api}`)
    })

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 41, clozeNumber: 1, cardType: "image-occlusion" },
      PLUGIN
    )

    expect(outcome).toEqual({ kind: "full" })
    expect(removeTagCalls().length).toBeGreaterThanOrEqual(1)
    // 关键：宿主不得被写成 type=image
    const host = blocksById[41] as AnyBlock & { _repr?: { type?: string } }
    expect(host._repr?.type).toBe("text")
    expect(host._repr?.type).not.toBe("image")
  })

  it("末变体（纯图片有 prevRepr）：恢复原生 image _repr", async () => {
    const masks = JSON.stringify({
      version: 1,
      regions: [
        { id: "a", n: 1, shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }
      ]
    })
    blocksById[42] = {
      id: 42,
      content: [],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.io.masks", value: masks },
        { name: "srs.io.src", value: "./image-pure.png" },
        {
          name: "srs.io.prevRepr",
          value: JSON.stringify({ type: "image", src: "./image-pure.png" })
        },
        { name: "srs.c1.due", value: "2026-08-01" }
      ],
      _repr: { type: "srs.image-occlusion", src: "./image-pure.png" }
    } as AnyBlock & { _repr: { type: string; src?: string } }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 42, clozeNumber: 1, cardType: "image-occlusion" },
      PLUGIN
    )

    expect(outcome).toEqual({ kind: "full" })
    const host = blocksById[42] as AnyBlock & {
      _repr?: { type?: string; src?: string }
    }
    expect(host._repr?.type).toBe("image")
    expect(host._repr?.src).toBe("./image-pure.png")
  })

  function installMutableBlockMock() {
    invokeEditorCommand.mockImplementation(
      async (cmd: string, _c: unknown, blockIds: number[], arg: unknown) => {
        const id = blockIds[0]
        const block = blocksById[id]
        if (!block) return
        if (cmd === "core.editor.setProperties") {
          const props = arg as { name: string; value: unknown; type?: number }[]
          if (!block.properties) block.properties = []
          for (const p of props) {
            const existing = block.properties.find(x => x.name === p.name)
            if (existing) {
              existing.value = p.value
              if (p.type != null) existing.type = p.type
            } else {
              block.properties.push({
                name: p.name,
                value: p.value,
                type: p.type
              })
            }
          }
          return
        }
        if (cmd === "core.editor.deleteProperties") {
          const names = new Set(arg as string[])
          block.properties = (block.properties ?? []).filter(
            p => !names.has(p.name)
          )
        }
      }
    )
  }

  it("删除 c2 保留 c1：先改 masks 再删 srs.c2.*，不 removeTag", async () => {
    installMutableBlockMock()
    const masks = JSON.stringify({
      version: 1,
      regions: [
        { id: "a", n: 1, shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { id: "b", n: 2, shape: "rect", x: 0.5, y: 0.5, w: 0.2, h: 0.2 }
      ]
    })
    blocksById[40] = {
      id: 40,
      content: [],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.io.masks", value: masks },
        { name: "srs.io.src", value: "./image-x.png" },
        { name: "srs.c1.due", value: "2026-08-01" },
        { name: "srs.c2.due", value: "2026-08-02" },
        { name: "srs.c2.stability", value: 1 }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 40, clozeNumber: 2, cardType: "image-occlusion" },
      PLUGIN
    )

    expect(outcome).toEqual({
      kind: "variant-only",
      remainingVariants: 1,
      ioRenames: [],
      deletedClozeNumber: 2
    })
    expect(removeTagCalls()).toHaveLength(0)

    // 应有 setProperties 写 masks（去掉 c2）
    const setMask = invokeEditorCommand.mock.calls.find(
      (c) =>
        c[0] === "core.editor.setProperties" &&
        Array.isArray(c[3]) &&
        c[3].some((p: { name: string }) => p.name === "srs.io.masks")
    )
    expect(setMask).toBeTruthy()
    const written = (setMask![3] as { name: string; value: string }[]).find(
      p => p.name === "srs.io.masks"
    )!.value
    const parsed = JSON.parse(written)
    expect(parsed.regions.every((r: { n: number }) => r.n !== 2)).toBe(true)
    expect(parsed.regions.some((r: { n: number }) => r.n === 1)).toBe(true)

    // 再删 c2 SRS 前缀
    const delProps = deletePropertiesCalls()
    expect(
      delProps.some(c => c.names.some(n => n.startsWith("srs.c2.")))
    ).toBe(true)
    // pending 迁移完成后应清除
    const host = blocksById[40]
    expect(
      (host.properties ?? []).some(p => p.name === "srs.io.pendingSrs")
    ).toBe(false)
    expect(hasBlockCacheEntry(40)).toBe(false)
  })

  it("删除 c1 保留 c2/c3：masks 压成 c1/c2，并迁移 srs.c2→c1、c3→c2", async () => {
    installMutableBlockMock()
    const masks = JSON.stringify({
      version: 1,
      regions: [
        { id: "a", n: 1, shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { id: "b", n: 2, shape: "rect", x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
        { id: "c", n: 3, shape: "rect", x: 0.5, y: 0.5, w: 0.2, h: 0.2 }
      ]
    })
    blocksById[43] = {
      id: 43,
      content: [],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.io.masks", value: masks },
        { name: "srs.io.src", value: "./image-y.png" },
        { name: "srs.c1.due", value: "2026-08-01" },
        { name: "srs.c2.due", value: "2026-08-02" },
        { name: "srs.c2.stability", value: 2.5 },
        { name: "srs.c3.due", value: "2026-08-03" },
        { name: "srs.c3.stability", value: 3.5 }
      ]
    }

    const deleteReviewCardBackendData = await importDeleteHelper()
    const outcome = await deleteReviewCardBackendData(
      { id: 43, clozeNumber: 1, cardType: "image-occlusion" },
      PLUGIN
    )

    expect(outcome).toEqual({
      kind: "variant-only",
      remainingVariants: 2,
      ioRenames: [
        { from: 2, to: 1 },
        { from: 3, to: 2 }
      ],
      deletedClozeNumber: 1
    })
    expect(removeTagCalls()).toHaveLength(0)

    const setMask = invokeEditorCommand.mock.calls.find(
      (c) =>
        c[0] === "core.editor.setProperties" &&
        Array.isArray(c[3]) &&
        c[3].some((p: { name: string }) => p.name === "srs.io.masks")
    )
    expect(setMask).toBeTruthy()
    const written = (setMask![3] as { name: string; value: string }[]).find(
      p => p.name === "srs.io.masks"
    )!.value
    const parsed = JSON.parse(written) as {
      regions: { id: string; n: number }[]
    }
    // 紧凑为 c1=旧 b、c2=旧 c
    expect(parsed.regions.map(r => ({ id: r.id, n: r.n }))).toEqual([
      { id: "b", n: 1 },
      { id: "c", n: 2 }
    ])

    const host = blocksById[43]
    const byName = new Map(
      (host.properties ?? []).map(p => [p.name, p.value])
    )
    // 旧 c2 进度落到 c1；旧 c3 落到 c2；原 c1 已删
    expect(byName.get("srs.c1.due")).toBe("2026-08-02")
    expect(byName.get("srs.c1.stability")).toBe(2.5)
    expect(byName.get("srs.c2.due")).toBe("2026-08-03")
    expect(byName.get("srs.c2.stability")).toBe(3.5)
    expect(byName.has("srs.c3.due")).toBe(false)
    expect(byName.has("srs.io.pendingSrs")).toBe(false)
  })

  it("缺少 masks / 编号不存在：拒绝删除，不整卡静默清理", async () => {
    blocksById[44] = {
      id: 44,
      content: [],
      properties: [
        { name: "srs.isCard", value: true },
        { name: "srs.c1.due", value: "2026-08-01" }
      ]
    }
    const deleteReviewCardBackendData = await importDeleteHelper()
    await expect(
      deleteReviewCardBackendData(
        { id: 44, clozeNumber: 1, cardType: "image-occlusion" },
        PLUGIN
      )
    ).rejects.toThrow(/缺少 srs\.io\.masks|读取图片遮罩失败/)

    blocksById[45] = {
      id: 45,
      content: [],
      properties: [
        { name: "srs.isCard", value: true },
        {
          name: "srs.io.masks",
          value: JSON.stringify({
            version: 1,
            regions: [
              { id: "a", n: 1, shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }
            ]
          })
        },
        { name: "srs.c1.due", value: "2026-08-01" }
      ]
    }
    await expect(
      deleteReviewCardBackendData(
        { id: 45, clozeNumber: 9, cardType: "image-occlusion" },
        PLUGIN
      )
    ).rejects.toThrow(/c9|不存在|过期/)
    expect(removeTagCalls()).toHaveLength(0)
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
