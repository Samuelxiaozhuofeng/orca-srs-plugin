/**
 * reviewSessionManager.ts 直接测试
 *
 * 覆盖（对应 improvements/低危问题.md 第 19、24 条的测试缺口）：
 * 1. createReviewSessionBlockWithDescriptor 冻结描述符锚点路径：
 *    insertBlock 收到的 repr 含完整 sessionDescriptor、三个 srs.* 属性写入、
 *    创建后 state 中块的 _repr 与 insert 参数一致（AGENTS.md「会话从冻结描述符加载」契约）
 * 2. getOrCreateReviewSessionBlock 废弃单例路径必须抛错（禁止复活全局会话块模式的唯一闸门）
 * 3. insertBlock 返回值校验（低危#24）：返回 undefined/NaN/对象/非正数时抛出带上下文错误，
 *    且零属性写入、进程内指针不被污染
 * 4. resolveReviewSessionBlock：state 命中 / 后端回退 / 后端抛错必须 rejects（错误可见性规则）
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

;(globalThis as any).orca = {
  state: { blocks: mockBlocks },
  commands: { invokeEditorCommand: invokeEditorCommandMock },
  invokeBackend: invokeBackendMock
}

import {
  buildReviewSessionBlockRepr,
  createNormalAllSessionDescriptor,
  createNormalDeckSessionDescriptor,
  SESSION_DESCRIPTOR_REPR_KEY
} from "./reviewSessionDescriptor"
import {
  createReviewSessionBlockWithDescriptor,
  getLastCreatedReviewSessionBlockId,
  getOrCreateReviewSessionBlock,
  resetReviewSessionBlockManagerForTests,
  resolveReviewSessionBlock
} from "./reviewSessionManager"

const PLUGIN = "orca-srs"

const setPropertiesCalls = () =>
  (invokeEditorCommandMock.mock.calls as unknown[][]).filter(
    (c) => c[0] === "core.editor.setProperties"
  )

const insertBlockCalls = () =>
  (invokeEditorCommandMock.mock.calls as unknown[][]).filter(
    (c) => c[0] === "core.editor.insertBlock"
  )

beforeEach(() => {
  for (const key of Object.keys(mockBlocks)) {
    delete mockBlocks[key as unknown as DbId]
  }
  invokeEditorCommandMock.mockReset()
  invokeBackendMock.mockReset()
  resetReviewSessionBlockManagerForTests()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

/** 让 insertBlock 返回指定值，setProperties 返回 undefined */
function mockInsertReturning(value: unknown): void {
  invokeEditorCommandMock.mockImplementation(async (cmd: string) => {
    if (cmd === "core.editor.insertBlock") return value
    return undefined
  })
}

describe("createReviewSessionBlockWithDescriptor（冻结描述符锚点路径）", () => {
  it("insertBlock 收到完整 sessionDescriptor repr，写入三个 srs.* 属性并同步 state _repr", async () => {
    const descriptor = createNormalDeckSessionDescriptor("DeckA", {
      sessionId: "sess-aaaa1111-test",
      createdAt: 1_750_000_000_000
    })
    const expectedRepr = buildReviewSessionBlockRepr(descriptor)
    mockInsertReturning(101)
    mockBlocks[101 as DbId] = { id: 101 as DbId }

    const blockId = await createReviewSessionBlockWithDescriptor(
      PLUGIN,
      descriptor
    )

    expect(blockId).toBe(101)

    // insertBlock 参数：repr 含完整 sessionDescriptor，内容文本含牌组与 sessionId 前缀
    const inserts = insertBlockCalls()
    expect(inserts).toHaveLength(1)
    const [, , , , content, repr] = inserts[0] as [
      string,
      unknown,
      unknown,
      unknown,
      Array<{ t: string; v: string }>,
      Record<string, unknown>
    ]
    expect(repr).toEqual(expectedRepr)
    expect(
      (repr[SESSION_DESCRIPTOR_REPR_KEY] as Record<string, unknown>).sessionId
    ).toBe("sess-aaaa1111-test")
    expect(content[0].v).toContain("DeckA")
    expect(content[0].v).toContain("sess-aaa")

    // 三个 srs.* 属性精确写入
    const setProps = setPropertiesCalls()
    expect(setProps).toHaveLength(1)
    expect(setProps[0][2]).toEqual([101])
    expect(setProps[0][3]).toEqual([
      { name: "srs.isReviewSessionBlock", value: true, type: 4 },
      { name: "srs.pluginName", value: PLUGIN, type: 2 },
      { name: "srs.sessionId", value: "sess-aaaa1111-test", type: 2 }
    ])

    // 创建后 state 中块的 _repr 与 insert 参数一致（同一冻结描述）
    expect(mockBlocks[101 as DbId]._repr).toEqual(expectedRepr)
    expect(getLastCreatedReviewSessionBlockId()).toBe(101)
  })

  it("state 中暂无块时不崩溃：仍写属性、返回 ID 并告警（_repr 依赖 insert 参数）", async () => {
    const descriptor = createNormalAllSessionDescriptor({
      sessionId: "sess-bbbb2222-test",
      createdAt: 1_750_000_000_000
    })
    mockInsertReturning(202)

    const blockId = await createReviewSessionBlockWithDescriptor(
      PLUGIN,
      descriptor
    )

    expect(blockId).toBe(202)
    expect(setPropertiesCalls()).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("state 中尚无块 #202")
    )
    expect(getLastCreatedReviewSessionBlockId()).toBe(202)
  })
})

describe("insertBlock 返回值校验（低危#24）", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["对象", { id: 1 }],
    ["字符串", "123"],
    ["零", 0],
    ["负数", -5]
  ])("insertBlock 返回 %s 时抛出带上下文错误且零属性写入", async (_label, bad) => {
    const descriptor = createNormalDeckSessionDescriptor("DeckA", {
      sessionId: "sess-cccc3333-test",
      createdAt: 1_750_000_000_000
    })
    mockInsertReturning(bad)

    await expect(
      createReviewSessionBlockWithDescriptor(PLUGIN, descriptor)
    ).rejects.toThrow(/insertBlock 未返回有效块 ID/)

    // 错误带上下文：sessionId 可定位到具体启动流程
    await expect(
      createReviewSessionBlockWithDescriptor(PLUGIN, descriptor)
    ).rejects.toThrow(/sess-cccc3333-test/)

    // 坏 ID 绝不落盘：零 setProperties 调用、进程内指针未被污染
    expect(setPropertiesCalls()).toHaveLength(0)
    expect(getLastCreatedReviewSessionBlockId()).toBeNull()
  })
})

describe("getOrCreateReviewSessionBlock（废弃单例路径守卫）", () => {
  it("必须抛错，禁止复活无描述的全局会话块模式", async () => {
    await expect(getOrCreateReviewSessionBlock(PLUGIN)).rejects.toThrow(
      /已废弃/
    )
    // 守卫在任何编辑命令之前抛出，不产生任何块/属性写入
    expect(invokeEditorCommandMock).not.toHaveBeenCalled()
  })
})

describe("resolveReviewSessionBlock", () => {
  it("state 命中时直接返回，不调用后端", async () => {
    mockBlocks[7 as DbId] = { id: 7 as DbId }

    const block = await resolveReviewSessionBlock(7 as DbId)

    expect(block).toBe(mockBlocks[7 as DbId])
    expect(invokeBackendMock).not.toHaveBeenCalled()
  })

  it("state 未命中时回退后端 get-block 并返回结果", async () => {
    const backendBlock = { id: 8 }
    invokeBackendMock.mockResolvedValue(backendBlock)

    const block = await resolveReviewSessionBlock(8 as DbId)

    expect(block).toBe(backendBlock)
    expect(invokeBackendMock).toHaveBeenCalledWith("get-block", 8)
  })

  it("后端抛 Error 时原样 rejects（错误可见，不得返回 undefined）", async () => {
    const backendError = new Error("backend down")
    invokeBackendMock.mockRejectedValue(backendError)

    await expect(resolveReviewSessionBlock(9 as DbId)).rejects.toBe(
      backendError
    )
  })

  it("后端抛非 Error 值时包装为带块 ID 的 Error 后 rejects", async () => {
    invokeBackendMock.mockRejectedValue("socket closed")

    await expect(resolveReviewSessionBlock(10 as DbId)).rejects.toThrow(
      /无法获取复习会话块 #10.*socket closed/
    )
  })
})
