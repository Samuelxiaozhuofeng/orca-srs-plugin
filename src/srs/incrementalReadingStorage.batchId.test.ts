/**
 * 验证 autoPostponeBatchId 会进入 saveIRState 属性列表
 */
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"

const blockMap = new Map<DbId, Block>()

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, blockId: DbId) => {
    if (command === "get-block") return blockMap.get(blockId)
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async () => true)
  },
  notify: vi.fn(),
  state: { blocks: {} }
}

// @ts-ignore
globalThis.orca = mockOrca

import {
  deleteIRSchedulingState,
  invalidateIrBlockCache,
  loadIRState,
  saveIRState
} from "./incrementalReadingStorage"

function createBlock(id: DbId): Block {
  return {
    id,
    content: [],
    text: `b-${id}`,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [
      { name: "ir.priority", value: 50, type: 3 },
      { name: "ir.lastRead", value: null, type: 5 },
      { name: "ir.readCount", value: 0, type: 3 },
      { name: "ir.due", value: new Date().toISOString(), type: 5 },
      { name: "ir.intervalDays", value: 3, type: 3 },
      { name: "ir.postponeCount", value: 0, type: 3 },
      { name: "ir.stage", value: ["extract.raw"], type: 2 },
      { name: "ir.lastAction", value: ["init"], type: 2 },
      { name: "ir.autoPostponeBatchId", value: ["batch-xyz"], type: 2 },
      { name: "ir.sourceExtractId", value: 9, type: 3 },
      { name: "ir.sourceTextSnippet", value: ["source"], type: 2 }
    ],
    refs: [],
    backRefs: []
  }
}

describe("autoPostponeBatchId persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockMap.clear()
    blockMap.set(1, createBlock(1))
    invalidateIrBlockCache(1)
  })

  it("loads autoPostponeBatchId from properties", async () => {
    const state = await loadIRState(1)
    expect(state.autoPostponeBatchId).toBe("batch-xyz")
  })

  it("writes autoPostponeBatchId via setProperties", async () => {
    const state = await loadIRState(1)
    await saveIRState(1, {
      ...state,
      lastAction: "autoPostpone",
      autoPostponeBatchId: "batch-new"
    })

    const call = mockOrca.commands.invokeEditorCommand.mock.calls.find(
      (c: any[]) => c[0] === "core.editor.setProperties"
    )
    expect(call).toBeTruthy()
    const props = call[3] as Array<{ name: string; value: any }>
    const batchProp = props.find(p => p.name === "ir.autoPostponeBatchId")
    expect(batchProp?.value).toBe("batch-new")
  })

  it("throws when block is missing instead of returning fake defaults", async () => {
    invalidateIrBlockCache(999)
    await expect(loadIRState(999)).rejects.toThrow(/不存在/)
  })

  it("deletes scheduling fields while preserving source provenance", async () => {
    await deleteIRSchedulingState(1)
    const call = mockOrca.commands.invokeEditorCommand.mock.calls.find(
      (entry: any[]) => entry[0] === "core.editor.deleteProperties"
    )
    expect(call).toBeTruthy()
    const names = call?.[3] as string[]
    expect(names).toContain("ir.due")
    expect(names).toContain("ir.autoPostponeBatchId")
    expect(names).not.toContain("ir.sourceExtractId")
    expect(names).not.toContain("ir.sourceTextSnippet")
  })
})
