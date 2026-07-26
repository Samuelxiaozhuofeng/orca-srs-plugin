/**
 * incrementalReadingSessionManager.ts 直接测试
 *
 * 覆盖（对应 improvements/低危问题.md 第 20 条的测试缺口）：
 * getOrCreateIncrementalReadingSessionBlock 三级恢复逻辑
 * 1. 一级：内存指针可解析时复用，不读存储、不新建
 * 2. 二级：存储 id 可解析（state 命中 / 后端回退命中）时复用，不新建、不 setData
 * 3. 三级：存储 id 指向已删块（后端明确返回 null）或无存储 id 时才新建并 setData
 * 4. 失败路径（#20 核心）：后端读取失败（throw）≠「块不存在」——必须向上抛错，
 *    不得静默新建会话块并覆盖存储指针（否则旧会话块成孤儿、每次故障再造一个）
 *
 * mock 方式参照 src/srs/storage.test.ts：模块在调用时读取全局 orca，
 * 导入前完成 (globalThis as any).orca 赋值即可生效。
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
  getOrCreateIncrementalReadingSessionBlock,
  getStoredIncrementalReadingSessionBlockId,
  IR_SESSION_STORAGE_KEY,
  resetIncrementalReadingSessionManagerForTests
} from "./incrementalReadingSessionManager"

const PLUGIN = "orca-srs"

/** insertBlock 自增返回新 ID，并像真实编辑器一样把块写入 state */
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
  resetIncrementalReadingSessionManagerForTests()
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
  it("第二次调用复用内存指针（state 命中），不再读存储、不再新建", async () => {
    getDataMock.mockResolvedValue(undefined)

    const first = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)
    expect(first).toBe(500)
    expect(getDataMock).toHaveBeenCalledTimes(1)

    const second = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    expect(second).toBe(first)
    expect(getDataMock).toHaveBeenCalledTimes(1) // 未再读存储
    expect(insertBlockCalls()).toHaveLength(1) // 未再新建
    expect(setDataMock).toHaveBeenCalledTimes(1)
  })
})

describe("三级恢复：二级存储指针", () => {
  it("存储 id 在 state 命中时复用：写内存指针、不新建、不 setData", async () => {
    getDataMock.mockResolvedValue(42)
    mockBlocks[42 as DbId] = { id: 42 as DbId }

    const id = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    expect(id).toBe(42)
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()

    // 内存指针已建立：再次调用不读存储
    const again = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)
    expect(again).toBe(42)
    expect(getDataMock).toHaveBeenCalledTimes(1)
  })

  it("存储 id state 未命中但后端返回块时复用，不新建", async () => {
    getDataMock.mockResolvedValue(43)
    invokeBackendMock.mockResolvedValue({ id: 43 })

    const id = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    expect(id).toBe(43)
    expect(invokeBackendMock).toHaveBeenCalledWith("get-block", 43)
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()
  })

  it("存储值非 number 时跳过二级，直接新建", async () => {
    getDataMock.mockResolvedValue("not-a-number")

    const id = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    expect(id).toBe(500)
    expect(invokeBackendMock).not.toHaveBeenCalled()
    expect(setDataMock).toHaveBeenCalledWith(PLUGIN, IR_SESSION_STORAGE_KEY, 500)
  })
})

describe("三级恢复：三级新建", () => {
  it("存储 id 指向已删块（后端明确返回 null）才新建并 setData 覆盖指针", async () => {
    getDataMock.mockResolvedValue(44)
    invokeBackendMock.mockResolvedValue(null)

    const id = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    expect(id).toBe(500)
    expect(insertBlockCalls()).toHaveLength(1)
    expect(setDataMock).toHaveBeenCalledWith(PLUGIN, IR_SESSION_STORAGE_KEY, 500)

    // 新建块写入 ir.* 属性与 _repr
    const setProps = setPropertiesCalls()
    expect(setProps).toHaveLength(1)
    expect(setProps[0][2]).toEqual([500])
    expect(setProps[0][3]).toEqual([
      { name: "ir.isSessionBlock", value: true, type: 4 },
      { name: "ir.pluginName", value: PLUGIN, type: 2 }
    ])
    expect(mockBlocks[500 as DbId]._repr).toEqual({ type: "srs.ir-session" })
  })

  it("无存储 id（getData 返回 undefined）时新建并 setData", async () => {
    getDataMock.mockResolvedValue(undefined)

    const id = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    expect(id).toBe(500)
    expect(setDataMock).toHaveBeenCalledWith(PLUGIN, IR_SESSION_STORAGE_KEY, 500)
  })
})

describe("失败路径（低危#20）：后端读取失败 ≠ 块不存在", () => {
  it("解析存储 id 时后端抛错必须向上抛出，不得新建会话块或覆盖存储指针", async () => {
    getDataMock.mockResolvedValue(46)
    invokeBackendMock.mockRejectedValue(new Error("backend down"))

    await expect(
      getOrCreateIncrementalReadingSessionBlock(PLUGIN)
    ).rejects.toThrow("backend down")

    // 旧会话块不得被判定失效：零新建、零指针覆盖
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()
  })

  it("后端抛非 Error 值时包装为带块 ID 的 Error 后抛出", async () => {
    getDataMock.mockResolvedValue(47)
    invokeBackendMock.mockRejectedValue("socket closed")

    await expect(
      getOrCreateIncrementalReadingSessionBlock(PLUGIN)
    ).rejects.toThrow(/#47.*socket closed/)
    expect(setDataMock).not.toHaveBeenCalled()
  })

  it("解析内存指针时后端抛错同样向上抛出，故障恢复后仍复用原块", async () => {
    // 先建立内存指针
    getDataMock.mockResolvedValue(48)
    mockBlocks[48 as DbId] = { id: 48 as DbId }
    await getOrCreateIncrementalReadingSessionBlock(PLUGIN)

    // 模拟 state 驱逐 + 后端瞬时故障
    delete mockBlocks[48 as DbId]
    invokeBackendMock.mockRejectedValue(new Error("transient failure"))
    await expect(
      getOrCreateIncrementalReadingSessionBlock(PLUGIN)
    ).rejects.toThrow("transient failure")
    expect(insertBlockCalls()).toHaveLength(0)
    expect(setDataMock).not.toHaveBeenCalled()

    // 故障恢复（后端重新可用）后复用原块，不新建
    invokeBackendMock.mockReset()
    invokeBackendMock.mockResolvedValue({ id: 48 })
    const id = await getOrCreateIncrementalReadingSessionBlock(PLUGIN)
    expect(id).toBe(48)
    expect(insertBlockCalls()).toHaveLength(0)
  })
})

describe("getStoredIncrementalReadingSessionBlockId", () => {
  it("存储为 number 时返回该 id", async () => {
    getDataMock.mockResolvedValue(66)
    await expect(
      getStoredIncrementalReadingSessionBlockId(PLUGIN)
    ).resolves.toBe(66)
  })

  it("存储缺失或非 number 时返回 null", async () => {
    getDataMock.mockResolvedValue(undefined)
    await expect(
      getStoredIncrementalReadingSessionBlockId(PLUGIN)
    ).resolves.toBeNull()

    getDataMock.mockResolvedValue("bad")
    await expect(
      getStoredIncrementalReadingSessionBlockId(PLUGIN)
    ).resolves.toBeNull()
  })
})
