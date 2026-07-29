/**
 * flashcardHomeManager.ts 直接测试
 *
 * 覆盖：
 * 1. resolveBlock 三态：state 命中 / 存储 ID 后端命中 / 后端明确 null 才新建
 * 2. 后端 throw 零 insert / 零 setData；故障恢复后复用旧块
 * 3. insertBlock 返回值校验：坏 ID 抛带上下文错误，零 setProperties、零 setData
 *
 * mock 方式参照 incrementalReadingSessionManager.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DbId } from "../orca.d.ts"

const mockBlocks: Record<DbId, { id: DbId; _repr?: Record<string, unknown> }> =
  {}

const invokeEditorCommandMock = vi.fn()
const invokeBackendMock = vi.fn()
const getDataMock = vi.fn()
const setDataMock = vi.fn()
const removeDataMock = vi.fn()

;(globalThis as any).orca = {
  state: { blocks: mockBlocks },
  commands: { invokeEditorCommand: invokeEditorCommandMock },
  invokeBackend: invokeBackendMock,
  plugins: {
    getData: getDataMock,
    setData: setDataMock,
    removeData: removeDataMock
  }
}

import {
  getOrCreateFlashcardHomeBlock,
  resetFlashcardHomeManagerForTests
} from "./flashcardHomeManager"

const PLUGIN = "orca-srs"
const STORAGE_KEY = "flashcardHomeBlockId"

let nextInsertId = 0

const insertBlockCalls = () =>
  (invokeEditorCommandMock.mock.calls as unknown[][]).filter(
    (c) => c[0] === "core.editor.insertBlock"
  )

const setPropertiesCalls = () =>
  (invokeEditorCommandMock.mock.calls as unknown[][]).filter(
    (c) => c[0] === "core.editor.setProperties"
  )

beforeEach(() => {
  for (const key of Object.keys(mockBlocks)) {
    delete mockBlocks[key as unknown as DbId]
  }
  invokeEditorCommandMock.mockReset()
  invokeBackendMock.mockReset()
  getDataMock.mockReset()
  setDataMock.mockReset()
  removeDataMock.mockReset()
  resetFlashcardHomeManagerForTests()
  nextInsertId = 500
  invokeEditorCommandMock.mockImplementation(async (cmd: string) => {
    if (cmd === "core.editor.insertBlock") {
      const id = nextInsertId++ as DbId
      mockBlocks[id] = { id }
      return id
    }
    return undefined
  })
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("三级恢复：一级内存指针", () => {
  it("state 命中时复用内存指针，不再读存储、不再新建", async () => {
    getDataMock.mockResolvedValue(undefined)

    const first = await getOrCreateFlashcardHomeBlock(PLUGIN)
    expect(first).toBe(500)
    expect(getDataMock).toHaveBeenCalledTimes(1)

    const second = await getOrCreateFlashcardHomeBlock(PLUGIN)

    expect(second).toBe(first)
    expect(getDataMock).toHaveBeenCalledTimes(1)
    expect(insertBlockCalls()).toHaveLength(1)
    expect(setDataMock).toHaveBeenCalledTimes(1)
  })
})

describe("三级恢复：二级存储指针", () => {
  it("存储 ID 在 state 命中时复用：写内存指针、不新建、不 setData", async () => {
    getDataMock.mockResolvedValue(42)
    mockBlocks[42 as DbId] = { id: 42 as DbId }

    const id = await getOrCreateFlashcardHomeBlock(PLUGIN)

    expect(id).toBe(42)
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()
  })

  it("存储 ID state 未命中但后端返回块时复用，不新建", async () => {
    getDataMock.mockResolvedValue(43)
    invokeBackendMock.mockResolvedValue({ id: 43 })

    const id = await getOrCreateFlashcardHomeBlock(PLUGIN)

    expect(id).toBe(43)
    expect(invokeBackendMock).toHaveBeenCalledWith("get-block", 43)
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()
  })
})

describe("三级恢复：三级新建", () => {
  it("存储 ID 指向已删块（后端明确返回 null）才新建并 setData 覆盖指针", async () => {
    getDataMock.mockResolvedValue(44)
    invokeBackendMock.mockResolvedValue(null)

    const id = await getOrCreateFlashcardHomeBlock(PLUGIN)

    expect(id).toBe(500)
    expect(insertBlockCalls()).toHaveLength(1)
    expect(setDataMock).toHaveBeenCalledWith(PLUGIN, STORAGE_KEY, 500)

    const setProps = setPropertiesCalls()
    expect(setProps).toHaveLength(1)
    expect(setProps[0][2]).toEqual([500])
    expect(setProps[0][3]).toEqual([
      { name: "srs.isFlashcardHomeBlock", value: true, type: 4 },
      { name: "srs.pluginName", value: PLUGIN, type: 2 }
    ])
    expect(mockBlocks[500 as DbId]._repr).toEqual({ type: "srs.flashcard-home" })
  })

  it("无存储 ID 时新建并 setData", async () => {
    getDataMock.mockResolvedValue(undefined)

    const id = await getOrCreateFlashcardHomeBlock(PLUGIN)

    expect(id).toBe(500)
    expect(setDataMock).toHaveBeenCalledWith(PLUGIN, STORAGE_KEY, 500)
  })
})

describe("失败路径：后端读取失败 ≠ 块不存在", () => {
  it("解析存储 ID 时后端抛错必须向上抛出，零 insert、零 setData", async () => {
    getDataMock.mockResolvedValue(46)
    invokeBackendMock.mockRejectedValue(new Error("backend down"))

    await expect(getOrCreateFlashcardHomeBlock(PLUGIN)).rejects.toThrow(
      "backend down"
    )

    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()
  })

  it("后端抛非 Error 值时包装为带块 ID 的 Error 后抛出", async () => {
    getDataMock.mockResolvedValue(47)
    invokeBackendMock.mockRejectedValue("socket closed")

    await expect(getOrCreateFlashcardHomeBlock(PLUGIN)).rejects.toThrow(
      /#47.*socket closed/
    )
    expect(setDataMock).not.toHaveBeenCalled()
  })

  it("故障恢复后复用旧块，不新建", async () => {
    getDataMock.mockResolvedValue(48)
    mockBlocks[48 as DbId] = { id: 48 as DbId }
    await getOrCreateFlashcardHomeBlock(PLUGIN)

    delete mockBlocks[48 as DbId]
    invokeBackendMock.mockRejectedValue(new Error("transient failure"))
    await expect(getOrCreateFlashcardHomeBlock(PLUGIN)).rejects.toThrow(
      "transient failure"
    )
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()

    invokeBackendMock.mockReset()
    invokeBackendMock.mockResolvedValue({ id: 48 })
    const id = await getOrCreateFlashcardHomeBlock(PLUGIN)
    expect(id).toBe(48)
    expect(insertBlockCalls()).toHaveLength(0)
  })
})

describe("insertBlock 返回值校验", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["对象", { id: 1 }],
    ["字符串", "123"],
    ["零", 0],
    ["负数", -5]
  ])(
    "insertBlock 返回 %s 时抛出带上下文错误且零 setProperties/setData",
    async (_label, bad) => {
      getDataMock.mockResolvedValue(undefined)
      invokeEditorCommandMock.mockImplementation(async (cmd: string) => {
        if (cmd === "core.editor.insertBlock") return bad
        return undefined
      })

      await expect(getOrCreateFlashcardHomeBlock(PLUGIN)).rejects.toThrow(
        /insertBlock 未返回有效块 ID/
      )
      await expect(getOrCreateFlashcardHomeBlock(PLUGIN)).rejects.toThrow(
        /Flash Home/
      )

      expect(setPropertiesCalls()).toHaveLength(0)
      expect(setDataMock).not.toHaveBeenCalled()
    }
  )
})
