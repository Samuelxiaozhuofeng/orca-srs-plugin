// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"

let failingId: DbId | null = null
const blockMap = new Map<DbId, Block>()

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, blockId: DbId) => {
    if (command === "get-block") {
      return blockMap.get(blockId)
    }
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async (_command: string, _panelId: any, blockIds: DbId[]) => {
      if (failingId !== null && blockIds.includes(failingId)) {
        throw new Error("块不存在")
      }
      return true
    })
  },
  notify: vi.fn(),
  state: { blocks: {} }
}

// @ts-ignore
globalThis.orca = mockOrca

import { bulkUpdatePriority, invalidateIrBlockCache, loadIRState } from "./incrementalReadingStorage"

function createBlock(id: DbId): Block {
  return {
    id,
    content: [],
    text: `extract-${id}`,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [
      { name: "ir.priority", value: 5, type: 3 },
      { name: "ir.lastRead", value: new Date().toISOString(), type: 5 },
      { name: "ir.readCount", value: 1, type: 3 },
      { name: "ir.due", value: new Date().toISOString(), type: 5 },
      // Orca get-block 中 type=2 常见返回为单元素数组
      { name: "ir.stage", value: ["extract.raw"], type: 2 },
      { name: "ir.lastAction", value: ["init"], type: 2 }
    ],
    refs: [],
    backRefs: []
  }
}

describe("bulkUpdatePriority", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    failingId = null
    blockMap.clear()
    mockOrca.state.blocks = {}
    blockMap.set(1, createBlock(1))
    blockMap.set(2, createBlock(2))
    invalidateIrBlockCache(1)
    invalidateIrBlockCache(2)
  })

  it("should return success list when all updates succeed", async () => {
    const result = await bulkUpdatePriority([1, 2], 8)

    expect(result.success).toEqual([1, 2])
    expect(result.failed).toEqual([])
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledTimes(2)
  })

  it("should return failed list when some updates fail", async () => {
    failingId = 2
    const result = await bulkUpdatePriority([1, 2], 8)

    expect(result.success).toEqual([1])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe(2)
    expect(result.failed[0].error).toContain("块不存在")
  })
})

describe("loadIRState block cache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    failingId = null
    blockMap.clear()
    mockOrca.state.blocks = {}
    invalidateIrBlockCache(1)
    invalidateIrBlockCache(2)
  })

  it("should bypass orca.state.blocks once after invalidateIrBlockCache", async () => {
    const stale: Block = createBlock(1)
    stale.properties = stale.properties.map((prop: any) =>
      prop.name === "ir.lastAction" ? { ...prop, value: ["init"] } : prop
    )
    mockOrca.state.blocks[1] = stale

    const fresh: Block = createBlock(1)
    fresh.properties = fresh.properties.map((prop: any) =>
      prop.name === "ir.lastAction" ? { ...prop, value: ["read"] } : prop
    )
    blockMap.set(1, fresh)

    invalidateIrBlockCache(1)
    const state = await loadIRState(1)

    expect(state.lastAction).toBe("read")
    expect(mockOrca.invokeBackend).toHaveBeenCalledWith("get-block", 1)
  })

  it("should not overwrite cached backend block with stale orca.state.blocks", async () => {
    const stale: Block = createBlock(1)
    stale.properties = stale.properties.map((prop: any) =>
      prop.name === "ir.lastAction" ? { ...prop, value: ["init"] } : prop
    )
    mockOrca.state.blocks[1] = stale

    const fresh: Block = createBlock(1)
    fresh.properties = fresh.properties.map((prop: any) =>
      prop.name === "ir.lastAction" ? { ...prop, value: ["read"] } : prop
    )
    blockMap.set(1, fresh)

    invalidateIrBlockCache(1)
    const first = await loadIRState(1)
    expect(first.lastAction).toBe("read")

    // 即使 state.blocks 仍是旧快照，也应继续使用内存缓存的最新块（不回退）
    mockOrca.invokeBackend.mockClear()
    const second = await loadIRState(1)
    expect(second.lastAction).toBe("read")
    expect(mockOrca.invokeBackend).not.toHaveBeenCalled()
  })

  it("should prefer backend get-block over orca.state.blocks by default", async () => {
    const stale: Block = createBlock(1)
    stale.properties = stale.properties.map((prop: any) =>
      prop.name === "ir.lastAction" ? { ...prop, value: ["init"] } : prop
    )
    mockOrca.state.blocks[1] = stale

    const fresh: Block = createBlock(1)
    fresh.properties = fresh.properties.map((prop: any) =>
      prop.name === "ir.lastAction" ? { ...prop, value: ["read"] } : prop
    )
    blockMap.set(1, fresh)

    const state = await loadIRState(1)
    expect(state.lastAction).toBe("read")
    expect(mockOrca.invokeBackend).toHaveBeenCalledWith("get-block", 1)
  })
})
