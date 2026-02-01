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
  notify: vi.fn(),
}

// @ts-ignore
globalThis.orca = mockOrca

vi.mock("./tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => {}),
}))

vi.mock("./incrementalReadingStorage", () => ({
  ensureIRState: vi.fn(async () => ({
    priority: 5,
    lastRead: null,
    readCount: 0,
    due: new Date(),
  })),
}))

import { createTopicCard } from "./topicCardCreator"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { ensureIRState } from "./incrementalReadingStorage"

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

  it("应在无 #card 标签时插入标签并初始化状态", async () => {
    const blockId = 1 as DbId
    mockBlocks[blockId] = makeBlock({ id: blockId, text: "Topic" })
    const cursor = { anchor: { blockId }, focus: { blockId } }

    const result = await createTopicCard(cursor, "orca-srs")

    expect(result?.blockId).toBe(blockId)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      cursor,
      blockId,
      "card",
      [
        { name: "type", value: "topic" },
        { name: "牌组", value: [] },
        { name: "status", value: "" },
      ]
    )
    expect(ensureCardTagProperties).toHaveBeenCalledWith("orca-srs")
    expect(ensureIRState).toHaveBeenCalledWith(blockId)
    expect(mockOrca.notify).toHaveBeenCalledWith("success", "已创建 Topic 卡片", { title: "渐进阅读" })
  })

  it("应在已有 #card 标签时更新 type=topic", async () => {
    const blockId = 2 as DbId
    const cardRef = { type: 2, alias: "card", id: 100, from: blockId, to: 1, data: [] }
    mockBlocks[blockId] = makeBlock({ id: blockId, text: "Topic", refs: [cardRef as any] })
    const cursor = { anchor: { blockId }, focus: { blockId } }

    const result = await createTopicCard(cursor, "orca-srs")

    expect(result?.blockId).toBe(blockId)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      cardRef,
      [
        { name: "type", value: "topic" },
      ]
    )
    expect(ensureIRState).toHaveBeenCalledWith(blockId)
  })

  it("缺少光标时应返回空结果", async () => {
    const result = await createTopicCard(null, "orca-srs")
    expect(result).toBeNull()
    expect(mockOrca.notify).toHaveBeenCalledWith("error", "无法获取光标位置")
  })
})
