// @ts-nocheck
/**
 * Topic 卡片创建测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"

const mockBlocks: Record<DbId, Block> = {}

const mockOrca = {
  state: {
    blocks: mockBlocks,
  },
  commands: {
    invokeEditorCommand: vi.fn(),
  },
  plugins: {
    getData: vi.fn(async () => null),
  },
  notify: vi.fn(),
  invokeBackend: vi.fn(async () => undefined),
}

// @ts-ignore
globalThis.orca = mockOrca

vi.mock("./tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => {}),
}))

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(async () => ({
    priority: 50,
    lastRead: null,
    readCount: 0,
    due: new Date(),
  })),
  invalidateIrBlockCache: vi.fn(),
}))

vi.mock("./incremental-reading/irIndex", () => ({
  upsertIRIndexId: vi.fn(),
}))

import { createTopicCard, createTopicCardByBlockId } from "./topicCardCreator"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { ensureIRState, invalidateIrBlockCache } from "./incrementalReadingStorage"
import { upsertIRIndexId } from "./incremental-reading/irIndex"

function makeBlock(partial: Partial<Block> & { id: DbId }): Block {
  return {
    id: partial.id,
    created: partial.created ?? new Date(),
    modified: partial.modified ?? new Date(),
    children: partial.children ?? [],
    aliases: partial.aliases ?? [],
    properties: partial.properties ?? [],
    refs: partial.refs ?? [],
    backRefs: partial.backRefs ?? [],
    parent: partial.parent,
    text: partial.text ?? "",
    content: partial.content ?? [],
  } as any
}

describe("topicCardCreator", () => {
  beforeEach(() => {
    Object.keys(mockBlocks).forEach((k) => delete mockBlocks[k as any])
    vi.clearAllMocks()
  })

  it("按 blockId 加入普通块：默认 Topic tag + IR 初始化，并失效缓存", async () => {
    const blockId = 1 as DbId
    mockBlocks[blockId] = makeBlock({ id: blockId, text: "Topic" })

    const result = await createTopicCardByBlockId(blockId, "orca-srs")

    expect(result?.blockId).toBe(blockId)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      [
        { name: "type", value: "topic" },
        { name: "牌组", value: [] },
        { name: "status", value: "" },
      ]
    )
    expect(ensureCardTagProperties).toHaveBeenCalledWith("orca-srs")
    expect(invalidateIrBlockCache).toHaveBeenCalledWith(blockId)
    expect(ensureIRState).toHaveBeenCalledWith(blockId)
    expect(upsertIRIndexId).toHaveBeenCalledWith("orca-srs", blockId, "topic")
    expect(mockOrca.notify).toHaveBeenCalledWith("success", "已加入渐进阅读", { title: "渐进阅读" })
  })

  it("原 cursor 入口委托 createTopicCardByBlockId 并工作", async () => {
    const blockId = 10 as DbId
    mockBlocks[blockId] = makeBlock({ id: blockId, text: "From cursor" })
    const cursor = { anchor: { blockId }, focus: { blockId } }

    const result = await createTopicCard(cursor, "orca-srs")

    expect(result?.blockId).toBe(blockId)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      expect.any(Array)
    )
    expect(ensureIRState).toHaveBeenCalledWith(blockId)
    expect(mockOrca.notify).toHaveBeenCalledWith("success", "已加入渐进阅读", { title: "渐进阅读" })
  })

  it("找不到块时不假装成功", async () => {
    const blockId = 999 as DbId
    mockOrca.invokeBackend.mockResolvedValueOnce(undefined)

    const result = await createTopicCardByBlockId(blockId, "orca-srs")

    expect(result).toBeNull()
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
    expect(ensureIRState).not.toHaveBeenCalled()
    expect(mockOrca.notify).toHaveBeenCalledWith("error", "未找到当前块", { title: "渐进阅读" })
  })

  it("后端 get-block 可补全 state 中缺失的块", async () => {
    const blockId = 42 as DbId
    const backendBlock = makeBlock({ id: blockId, text: "From backend" })
    mockOrca.invokeBackend.mockResolvedValueOnce(backendBlock)

    const result = await createTopicCardByBlockId(blockId, "orca-srs")

    expect(result?.blockId).toBe(blockId)
    expect(mockOrca.invokeBackend).toHaveBeenCalledWith("get-block", blockId)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      expect.any(Array)
    )
  })

  it("已有其他类型 #card 时更新为 topic", async () => {
    const blockId = 2 as DbId
    const cardRef = {
      type: 2,
      alias: "card",
      id: 100,
      from: blockId,
      to: 1,
      data: [{ name: "type", value: "basic" }],
    }
    mockBlocks[blockId] = makeBlock({ id: blockId, text: "Topic", refs: [cardRef as any] })

    const result = await createTopicCardByBlockId(blockId, "orca-srs")

    expect(result?.blockId).toBe(blockId)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "type", value: "topic" }]
    )
    expect(ensureCardTagProperties).not.toHaveBeenCalled()
    expect(invalidateIrBlockCache).toHaveBeenCalledWith(blockId)
    expect(ensureIRState).toHaveBeenCalledWith(blockId)
  })

  it("缺少光标时应返回空结果", async () => {
    const result = await createTopicCard(null, "orca-srs")
    expect(result).toBeNull()
    expect(mockOrca.notify).toHaveBeenCalledWith("error", "无法获取光标位置")
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("标签处理失败时不假装成功", async () => {
    const blockId = 3 as DbId
    mockBlocks[blockId] = makeBlock({ id: blockId, text: "fail" })
    mockOrca.commands.invokeEditorCommand.mockRejectedValueOnce(new Error("insert failed"))

    const result = await createTopicCardByBlockId(blockId, "orca-srs")

    expect(result).toBeNull()
    expect(ensureIRState).not.toHaveBeenCalled()
    expect(mockOrca.notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("创建 Topic 卡片失败"),
      { title: "渐进阅读" }
    )
  })
})
