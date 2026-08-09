/**
 * listCardCreator：srs.isCard 写成功后立即 invalidateBlockCache
 * 写失败时不得 invalidate，保持 wroteRootIsCard=false
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, CursorData, DbId } from "../orca.d.ts"

const invalidateBlockCacheMock = vi.fn()

vi.mock("./storage", () => ({
  invalidateBlockCache: (...args: unknown[]) =>
    invalidateBlockCacheMock(...args),
  writeInitialSrsState: vi.fn().mockResolvedValue(undefined)
}))

vi.mock("./cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn().mockResolvedValue([])
}))

vi.mock("./tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn().mockResolvedValue(undefined)
}))

const mockBlocks: Record<DbId, Block> = {}
const invokeEditorCommandMock = vi.fn()
const notifyMock = vi.fn()

;(globalThis as any).orca = {
  state: { blocks: mockBlocks },
  commands: { invokeEditorCommand: invokeEditorCommandMock },
  invokeBackend: vi.fn(),
  notify: notifyMock
}

import { createListCardFromBlock } from "./listCardCreator"

const PLUGIN = "orca-srs"
const BLOCK_ID = 100 as DbId

function makeBlock(id: DbId, children: DbId[] = []): Block {
  return {
    id,
    created: new Date(),
    modified: new Date(),
    children,
    aliases: [],
    properties: [],
    refs: [],
    backRefs: [],
    text: `list-${id}`,
    content: []
  } as Block
}

function cursorFor(blockId: DbId): CursorData {
  return { anchor: { blockId } } as CursorData
}

beforeEach(() => {
  for (const key of Object.keys(mockBlocks)) {
    delete mockBlocks[key as unknown as DbId]
  }
  invokeEditorCommandMock.mockReset()
  invalidateBlockCacheMock.mockReset()
  notifyMock.mockReset()
  mockBlocks[BLOCK_ID] = makeBlock(BLOCK_ID)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createListCardFromBlock 缓存失效", () => {
  it("#card type 写成功后立即失效缓存，不依赖后续 srs.isCard 写入", async () => {
    const block = mockBlocks[BLOCK_ID]
    block.refs = [{ type: 2, alias: "card" } as Block["refs"][number]]
    invokeEditorCommandMock.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.setRefData") return undefined
      if (cmd === "core.editor.setProperties") {
        throw new Error("setProperties failed")
      }
      return undefined
    })

    const result = await createListCardFromBlock(cursorFor(BLOCK_ID), PLUGIN)

    expect(result).not.toBeNull()
    expect(result!.wroteRootIsCard).toBe(false)
    expect(invalidateBlockCacheMock).toHaveBeenCalledTimes(1)
    expect(invalidateBlockCacheMock).toHaveBeenCalledWith(BLOCK_ID)
  })

  it("srs.isCard 写成功后立即 invalidateBlockCache，wroteRootIsCard=true", async () => {
    invokeEditorCommandMock.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.insertTag") return undefined
      if (cmd === "core.editor.setProperties") return undefined
      return undefined
    })

    const result = await createListCardFromBlock(cursorFor(BLOCK_ID), PLUGIN)

    expect(result).not.toBeNull()
    expect(result!.wroteRootIsCard).toBe(true)
    expect(invalidateBlockCacheMock).toHaveBeenCalledTimes(1)
    expect(invalidateBlockCacheMock).toHaveBeenCalledWith(BLOCK_ID)

    const setPropsCalls = (
      invokeEditorCommandMock.mock.calls as unknown[][]
    ).filter((c) => c[0] === "core.editor.setProperties")
    expect(setPropsCalls).toHaveLength(1)
    expect(setPropsCalls[0][3]).toEqual([
      { name: "srs.isCard", value: true, type: 4 }
    ])
  })

  it("srs.isCard 写失败时不得 invalidate，wroteRootIsCard=false", async () => {
    invokeEditorCommandMock.mockImplementation(async (cmd: string) => {
      if (cmd === "core.editor.insertTag") return undefined
      if (cmd === "core.editor.setProperties") {
        throw new Error("setProperties failed")
      }
      return undefined
    })

    const result = await createListCardFromBlock(cursorFor(BLOCK_ID), PLUGIN)

    expect(result).not.toBeNull()
    expect(result!.wroteRootIsCard).toBe(false)
    expect(invalidateBlockCacheMock).not.toHaveBeenCalled()
  })
})
