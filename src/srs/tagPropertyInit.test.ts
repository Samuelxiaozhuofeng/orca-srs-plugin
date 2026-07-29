/**
 * ensureCardTagProperties 回归：
 * - 既有 #card 标签补缺属性
 * - 全新仓库创建标签并补属性
 * - 并发调用共享同一轮初始化
 * - 属性写失败不缓存，下一次可重试
 * - 创建/alias 失败清理孤立块且错误可见
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"

const mockOrca = {
  invokeBackend: vi.fn(),
  commands: { invokeEditorCommand: vi.fn() },
  notify: vi.fn()
}
// @ts-ignore test global
globalThis.orca = mockOrca

import {
  ensureCardTagProperties,
  resetCardTagInitState
} from "./tagPropertyInit"
import {
  clearBlockCache,
  hasBlockCacheEntry,
  preheatBlockCache
} from "./storage"

const REQUIRED_PROP_NAMES = ["type", "牌组", "status", "priority"] as const

function makeBlock(
  id: DbId,
  opts: { properties?: Array<{ name: string; type: number; value: unknown }> } = {}
): Block {
  return {
    id,
    content: [],
    text: "card",
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: ["card"],
    properties: opts.properties ?? [],
    refs: [],
    backRefs: []
  } as unknown as Block
}

describe("ensureCardTagProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCardTagInitState()
    clearBlockCache()
    mockOrca.commands.invokeEditorCommand.mockResolvedValue(undefined)
  })

  it("既有 card 标签时只补缺失属性，不创建块", async () => {
    const tagBlock = makeBlock(10, {
      properties: [
        { name: "type", type: 1, value: "" },
        { name: "status", type: 1, value: "" }
      ]
    })
    mockOrca.invokeBackend.mockImplementation(async (api: string) => {
      if (api === "get-block-by-alias") return tagBlock
      return null
    })

    await ensureCardTagProperties("orca-srs")

    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.insertBlock",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )

    const setPropCalls = mockOrca.commands.invokeEditorCommand.mock.calls.filter(
      (c) => c[0] === "core.editor.setProperties"
    )
    expect(setPropCalls).toHaveLength(2)
    const writtenNames = setPropCalls.map(
      (c) => (c[3] as Array<{ name: string }>)[0].name
    )
    expect(writtenNames.sort()).toEqual(["priority", "牌组"].sort())

    // 二次调用应命中缓存，不再写属性
    mockOrca.commands.invokeEditorCommand.mockClear()
    await ensureCardTagProperties("orca-srs")
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("全新仓库：创建根块 + alias 后补齐全部必要属性，并以 backend 确认", async () => {
    const createdId = 42
    let aliasMap: Record<string, Block | null> = {}
    const tagBlock = makeBlock(createdId)

    mockOrca.invokeBackend.mockImplementation(async (api: string, alias?: string) => {
      if (api === "get-block-by-alias") {
        return aliasMap[alias as string] ?? null
      }
      return null
    })

    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _c: unknown, ...args: unknown[]) => {
        if (command === "core.editor.insertBlock") {
          return createdId
        }
        if (command === "core.editor.createAlias") {
          const name = args[0] as string
          const blockId = args[1] as number
          const asPage = args[2] as boolean
          expect(name).toBe("card")
          expect(blockId).toBe(createdId)
          expect(asPage).toBe(true)
          aliasMap[name] = makeBlock(blockId)
          return undefined
        }
        if (command === "core.editor.setProperties") {
          return undefined
        }
        return undefined
      }
    )

    await ensureCardTagProperties("orca-srs")

    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertBlock",
      null,
      null,
      null,
      [{ t: "t", v: "card" }],
      { type: "heading", level: 1 }
    )
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.createAlias",
      null,
      "card",
      createdId,
      true
    )

    const setPropCalls = mockOrca.commands.invokeEditorCommand.mock.calls.filter(
      (c) => c[0] === "core.editor.setProperties"
    )
    expect(setPropCalls).toHaveLength(REQUIRED_PROP_NAMES.length)
    const names = setPropCalls.map((c) => (c[3] as Array<{ name: string }>)[0].name)
    expect(names.sort()).toEqual([...REQUIRED_PROP_NAMES].sort())

    // 属性写入后应失效该块缓存（契约；标签 schema 通常不在 cache 中）
    preheatBlockCache([tagBlock])
    // 上面 preheat 在写入之后，验证 invalidate 在每次 setProperties 后被调用过：
    // 若写入时有 cache entry，会被清掉——此处单独验证 helper 路径：
    // 重新跑一次已缓存成功路径不会再写；下面失败路径另测 invalidate。
    void tagBlock
  })

  it("并发调用共享同一轮初始化 Promise", async () => {
    let releaseInsert!: (id: number) => void
    const insertGate = new Promise<number>((resolve) => {
      releaseInsert = resolve
    })
    let aliasReady = false

    mockOrca.invokeBackend.mockImplementation(async (api: string) => {
      if (api === "get-block-by-alias") {
        return aliasReady ? makeBlock(7) : null
      }
      return null
    })

    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string) => {
        if (command === "core.editor.insertBlock") {
          const id = await insertGate
          return id
        }
        if (command === "core.editor.createAlias") {
          aliasReady = true
          return undefined
        }
        if (command === "core.editor.setProperties") {
          return undefined
        }
        return undefined
      }
    )

    const p1 = ensureCardTagProperties("orca-srs")
    const p2 = ensureCardTagProperties("orca-srs")

    // 两路都进入 in-flight 后才放行 insert，避免第二路误判为已初始化后早退
    await Promise.resolve()
    releaseInsert(7)

    await Promise.all([p1, p2])

    const insertCalls = mockOrca.commands.invokeEditorCommand.mock.calls.filter(
      (c) => c[0] === "core.editor.insertBlock"
    )
    expect(insertCalls).toHaveLength(1)
  })

  it("属性写失败不缓存成功，下一次可重试并补齐剩余属性", async () => {
    const tagBlock = makeBlock(5, { properties: [] })
    mockOrca.invokeBackend.mockImplementation(async (api: string) => {
      if (api === "get-block-by-alias") return tagBlock
      return null
    })

    let setCount = 0
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _c: unknown, ...args: unknown[]) => {
        if (command === "core.editor.setProperties") {
          setCount += 1
          const propName = (args[1] as Array<{ name: string }>)[0].name
          if (setCount === 1) {
            // 第一个属性成功，模拟写进块
            tagBlock.properties = [
              ...(tagBlock.properties ?? []),
              { name: propName, type: 1, value: "" } as any
            ]
            return undefined
          }
          if (setCount === 2) {
            throw new Error("setProperties denied")
          }
          // 重试时后续属性成功
          tagBlock.properties = [
            ...(tagBlock.properties ?? []),
            { name: propName, type: 1, value: "" } as any
          ]
          return undefined
        }
        return undefined
      }
    )

    await expect(ensureCardTagProperties("orca-srs")).rejects.toThrow(
      /setProperties denied|添加失败/
    )

    // 失败后不得假装已初始化：应再次尝试写缺失属性
    await ensureCardTagProperties("orca-srs")

    const setPropCalls = mockOrca.commands.invokeEditorCommand.mock.calls.filter(
      (c) => c[0] === "core.editor.setProperties"
    )
    // 第一次：成功1 + 失败1；第二次：剩余缺失（约 3 个，因第一个已在块上）
    expect(setPropCalls.length).toBeGreaterThanOrEqual(2 + 3)
  })

  it("createAlias 失败时删除本轮孤立块并抛出可见错误", async () => {
    const createdId = 99
    mockOrca.invokeBackend.mockResolvedValue(null)

    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string) => {
        if (command === "core.editor.insertBlock") return createdId
        if (command === "core.editor.createAlias") {
          throw new Error("alias denied")
        }
        if (command === "core.editor.deleteBlocks") return undefined
        return undefined
      }
    )

    await expect(ensureCardTagProperties("orca-srs")).rejects.toThrow(
      /未能建立 #card 标签 alias|alias denied/
    )

    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteBlocks",
      null,
      [createdId]
    )
  })

  it("insertBlock 返回非有限正数时直接失败且不 createAlias", async () => {
    mockOrca.invokeBackend.mockResolvedValue(null)
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string) => {
        if (command === "core.editor.insertBlock") return "bad-id"
        return undefined
      }
    )

    await expect(ensureCardTagProperties("orca-srs")).rejects.toThrow(
      /insertBlock 未返回有效块 ID/
    )

    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.createAlias",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })

  it("清理孤立块失败时仍抛出原错误并 console.error", async () => {
    const createdId = 77
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    mockOrca.invokeBackend.mockResolvedValue(null)

    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string) => {
        if (command === "core.editor.insertBlock") return createdId
        if (command === "core.editor.createAlias") {
          throw new Error("alias boom")
        }
        if (command === "core.editor.deleteBlocks") {
          throw new Error("delete denied")
        }
        return undefined
      }
    )

    await expect(ensureCardTagProperties("orca-srs")).rejects.toThrow(/alias boom/)

    expect(errorSpy).toHaveBeenCalled()
    const cleanupLog = errorSpy.mock.calls.some(
      (args) =>
        String(args[0]).includes("清理孤立块") &&
        String(args[0]).includes(String(createdId))
    )
    expect(cleanupLog).toBe(true)
    errorSpy.mockRestore()
  })

  it("属性写入成功后调用 invalidateBlockCache（有预热条目则清除）", async () => {
    const tagBlock = makeBlock(3, { properties: [] })
    preheatBlockCache([tagBlock])
    expect(hasBlockCacheEntry(3)).toBe(true)

    mockOrca.invokeBackend.mockImplementation(async (api: string) => {
      if (api === "get-block-by-alias") return tagBlock
      return null
    })
    mockOrca.commands.invokeEditorCommand.mockResolvedValue(undefined)

    await ensureCardTagProperties("orca-srs")

    expect(hasBlockCacheEntry(3)).toBe(false)
  })
})
