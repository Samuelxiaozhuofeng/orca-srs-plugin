/**
 * 低危#1 回归（IR 同构）：collectTaggedBlocks 兜底门控
 *
 * - 标签查询成功且为空 → 直接返回空结果，不触发 get-all-blocks 全库扫描
 * - 仅当 get-blocks-with-tags 两个变体全部抛错时才走 get-all-blocks 兜底
 * - 查询与兜底全部失败 → 抛错（不得用空数组伪装成空库）
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(),
  loadIRState: vi.fn()
}))

// 屏蔽索引路径：loadIRIndex 返回 null → collectCandidateBlocks 直接走全量标签收集
vi.mock("./incremental-reading/irIndex", () => ({
  isIRIndexFresh: vi.fn(() => false),
  loadIRIndex: vi.fn(() => null),
  rebuildIRIndexFromCards: vi.fn()
}))

import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"
import { collectAllIRCards } from "./incrementalReadingCollector"
import type { IRState } from "./incrementalReadingStorage"
import { ensureIRState, loadIRState } from "./incrementalReadingStorage"
import { clearIrBlockCache } from "./incremental-reading/irBlockCache"

function createCardRef(blockId: DbId, typeValue: string): BlockRef {
  const data: BlockProperty[] = [{ name: "type", value: typeValue, type: 2 }]
  return {
    id: (blockId as number) * 100,
    from: blockId,
    to: 1,
    type: 2,
    alias: "card",
    data
  }
}

function createBlock(id: DbId, typeValue: string): Block {
  return {
    id,
    content: [],
    text: `${typeValue}-${id}`,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [],
    refs: [createCardRef(id, typeValue)],
    backRefs: []
  } as unknown as Block
}

function baseState(): IRState {
  return {
    priority: 50,
    lastRead: new Date("2026-07-01T08:00:00"),
    readCount: 1,
    due: new Date("2026-07-20T08:00:00"),
    intervalDays: 5,
    postponeCount: 0,
    stage: "extract.raw",
    lastAction: "init",
    position: null,
    resumeBlockId: null
  } as IRState
}

const mockOrca = {
  invokeBackend: vi.fn(),
  commands: { invokeEditorCommand: vi.fn(async () => true) },
  notify: vi.fn(),
  state: { blocks: {} }
}
// @ts-ignore test global
globalThis.orca = mockOrca

function invokedMethods(): string[] {
  return mockOrca.invokeBackend.mock.calls.map(call => call[0] as string)
}

describe("IR collectTaggedBlocks 兜底门控（低危#1 同构）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearIrBlockCache()
    vi.mocked(ensureIRState).mockResolvedValue(baseState())
    vi.mocked(loadIRState).mockResolvedValue(baseState())
  })

  it("零卡片仓库：标签查询成功且为空时不触发 get-all-blocks，返回空结果", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") return []
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return undefined
    })

    const cards = await collectAllIRCards("orca-srs")

    expect(cards).toEqual([])
    expect(invokedMethods().filter(m => m === "get-blocks-with-tags")).toHaveLength(2)
    expect(invokedMethods()).not.toContain("get-all-blocks")
    expect(mockOrca.notify).not.toHaveBeenCalled()
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

    const cards = await collectAllIRCards("orca-srs")

    expect(cards).toEqual([])
    expect(invokedMethods()).not.toContain("get-all-blocks")
  })

  it("两个变体全部抛错时才走 get-all-blocks 兜底并按 #card 过滤", async () => {
    const topicBlock = createBlock(1, "topic")
    const extractBlock = createBlock(2, "extracts")
    const plainBlock = {
      ...createBlock(3, "extracts"),
      refs: []
    } as unknown as Block
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") throw new Error("backend down")
      if (method === "get-all-blocks") return [topicBlock, extractBlock, plainBlock]
      return undefined
    })

    const cards = await collectAllIRCards("orca-srs")

    expect(cards.map(card => card.id).sort((a, b) => a - b)).toEqual([1, 2])
    expect(invokedMethods().filter(m => m === "get-all-blocks")).toHaveLength(1)
  })

  it("查询与兜底全部失败时抛错，不得伪装成空库", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") throw new Error("tags down")
      if (method === "get-all-blocks") throw new Error("all-blocks down")
      return undefined
    })

    await expect(collectAllIRCards("orca-srs")).rejects.toThrow()
    expect(mockOrca.notify).toHaveBeenCalledWith(
      "error",
      "渐进阅读卡片收集失败",
      { title: "渐进阅读" }
    )
  })

  it("查询成功且有结果时行为不变：返回标签块，不触发兜底", async () => {
    const topicBlock = createBlock(9, "topic")
    mockOrca.invokeBackend.mockImplementation(async (method: string, arg: unknown) => {
      if (method === "get-blocks-with-tags") {
        const [tag] = arg as string[]
        return tag === "card" ? [topicBlock] : []
      }
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return undefined
    })

    const cards = await collectAllIRCards("orca-srs")

    expect(cards.map(card => card.id)).toEqual([9])
    expect(invokedMethods()).not.toContain("get-all-blocks")
  })
})
