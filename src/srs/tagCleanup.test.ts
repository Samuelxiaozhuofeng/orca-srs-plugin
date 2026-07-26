/**
 * 低危#3 回归：cleanupSrsProperties 删除全部 srs.* 属性后必须失效 blockCache
 *
 * 否则长期存活的块缓存会继续持有已删除的旧复习进度（ensureCardSrsState 误判
 * hasAnySrsProps 并复活旧状态）。语义对齐 storage.ts 的 deleteCardSrsData。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"

const mockOrca = {
  invokeBackend: vi.fn(),
  commands: { invokeEditorCommand: vi.fn(async () => undefined) }
}
// @ts-ignore test global
globalThis.orca = mockOrca

import { cleanupSrsProperties } from "./tagCleanup"
import { clearBlockCache, hasBlockCacheEntry, preheatBlockCache } from "./storage"

function makeBlock(id: DbId, propertyNames: string[]): Block {
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
    properties: propertyNames.map(name => ({ name, value: 1, type: 3 })),
    refs: [],
    backRefs: []
  } as unknown as Block
}

describe("cleanupSrsProperties 缓存失效（低危#3）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearBlockCache()
    mockOrca.commands.invokeEditorCommand.mockResolvedValue(undefined)
  })

  it("删除 srs.* 属性成功后失效该块的 blockCache", async () => {
    const block = makeBlock(1, ["srs.due", "srs.state", "other.prop"])
    mockOrca.invokeBackend.mockResolvedValue(block)
    preheatBlockCache([block])
    expect(hasBlockCacheEntry(1)).toBe(true)

    await cleanupSrsProperties(1, "orca-srs")

    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [1],
      ["srs.due", "srs.state"]
    )
    expect(hasBlockCacheEntry(1)).toBe(false)
  })

  it("无 srs.* 属性时提前返回，不发起删除", async () => {
    const block = makeBlock(2, ["other.prop"])
    mockOrca.invokeBackend.mockResolvedValue(block)
    preheatBlockCache([block])

    await cleanupSrsProperties(2, "orca-srs")

    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
    // 未发生写入，缓存无需失效
    expect(hasBlockCacheEntry(2)).toBe(true)
  })

  it("deleteProperties 抛错时向上传播且不失效缓存（后端未确认变更）", async () => {
    const block = makeBlock(3, ["srs.due"])
    mockOrca.invokeBackend.mockResolvedValue(block)
    preheatBlockCache([block])
    mockOrca.commands.invokeEditorCommand.mockRejectedValueOnce(
      new Error("deleteProperties failed")
    )

    await expect(cleanupSrsProperties(3, "orca-srs")).rejects.toThrow(
      "deleteProperties failed"
    )
    expect(hasBlockCacheEntry(3)).toBe(true)
  })
})
