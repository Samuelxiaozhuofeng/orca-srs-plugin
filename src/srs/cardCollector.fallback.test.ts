/**
 * 低危#1 回归：零卡片仓库不再每轮触发 get-all-blocks 全库扫描
 *
 * - 标签查询成功且为空 → 直接返回空结果（保留 orca.state 中 _repr 块的合并逻辑）
 * - 仅当 get-blocks-with-tags 两个变体（card / Card）全部抛错时才走 get-all-blocks 兜底
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, BlockRef, DbId } from "../orca.d.ts"

const mockOrca = {
  invokeBackend: vi.fn(),
  commands: { invokeEditorCommand: vi.fn(async () => null) },
  notify: vi.fn(),
  state: { blocks: {} as Record<number, unknown> }
}
// @ts-ignore test global
globalThis.orca = mockOrca

import { collectSrsBlocks, resetCollectCachesForTests } from "./cardCollector"

function cardRef(from: DbId, alias: string): BlockRef {
  return {
    id: (from as number) * 100,
    from,
    to: 1,
    type: 2,
    alias,
    data: []
  } as unknown as BlockRef
}

function makeBlock(id: DbId, tagAlias?: string): Block {
  return {
    id,
    content: [],
    text: `block-${id}`,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [],
    refs: tagAlias ? [cardRef(id, tagAlias)] : [],
    backRefs: []
  } as unknown as Block
}

function invokedMethods(): string[] {
  return mockOrca.invokeBackend.mock.calls.map(call => call[0] as string)
}

describe("collectSrsBlocks 兜底门控（低危#1）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrca.state.blocks = {}
    resetCollectCachesForTests()
  })

  it("零卡片仓库：标签查询成功且为空时不触发 get-all-blocks，直接返回空结果", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") return []
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return undefined
    })

    const blocks = await collectSrsBlocks("orca-srs")

    expect(blocks).toEqual([])
    expect(invokedMethods().filter(m => m === "get-blocks-with-tags")).toHaveLength(2)
    expect(invokedMethods()).not.toContain("get-all-blocks")
  })

  it("查询成功且为空时仍合并 orca.state 中的 _repr 卡片块", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") return []
      return undefined
    })
    const reprBlock = { ...makeBlock(42), _repr: { type: "srs.card" } }
    mockOrca.state.blocks = { 42: reprBlock }

    const blocks = await collectSrsBlocks("orca-srs")

    expect(blocks.map(b => b.id)).toEqual([42])
    expect(invokedMethods()).not.toContain("get-all-blocks")
  })

  it("单个变体失败、另一变体成功为空时不触发兜底（查询算成功）", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string, arg: unknown) => {
      if (method === "get-blocks-with-tags") {
        const [tag] = arg as string[]
        if (tag === "card") throw new Error("variant down")
        return []
      }
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return undefined
    })

    const blocks = await collectSrsBlocks("orca-srs")

    expect(blocks).toEqual([])
    expect(invokedMethods()).not.toContain("get-all-blocks")
  })

  it("两个变体全部抛错时才走 get-all-blocks 兜底，并按 #card 大小写不敏感过滤", async () => {
    const cardBlock = makeBlock(1, "CARD") // isCardTag 大小写不敏感
    const plainBlock = makeBlock(2)
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") throw new Error("backend down")
      if (method === "get-all-blocks") return [cardBlock, plainBlock]
      return undefined
    })

    const blocks = await collectSrsBlocks("orca-srs")

    expect(blocks.map(b => b.id)).toEqual([1])
    expect(invokedMethods().filter(m => m === "get-all-blocks")).toHaveLength(1)
  })

  it("查询成功且有结果时行为不变：返回标签块，不触发兜底", async () => {
    const cardBlock = makeBlock(7, "card")
    mockOrca.invokeBackend.mockImplementation(async (method: string, arg: unknown) => {
      if (method === "get-blocks-with-tags") {
        const [tag] = arg as string[]
        return tag === "card" ? [cardBlock] : []
      }
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return undefined
    })

    const blocks = await collectSrsBlocks("orca-srs")

    expect(blocks.map(b => b.id)).toEqual([7])
    expect(invokedMethods()).not.toContain("get-all-blocks")
  })

  it("标签查询与全库兜底均失败时抛错，不得返回空数组冒充成功", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") throw new Error("backend down")
      if (method === "get-all-blocks") throw new Error("all-blocks down")
      return undefined
    })

    await expect(collectSrsBlocks("orca-srs")).rejects.toThrow(
      /读取 SRS 卡片失败.*全库兜底均失败/
    )
    // 与「确实没有卡」区分：不得静默得到 []
    await expect(collectSrsBlocks("orca-srs")).rejects.not.toEqual([])
    expect(invokedMethods().filter(m => m === "get-all-blocks").length).toBeGreaterThanOrEqual(1)
  })
})
