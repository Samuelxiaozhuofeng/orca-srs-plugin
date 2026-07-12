// @ts-nocheck
/**
 * 渐进阅读右键菜单：分类与今天阅读
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const mockBlocks: Record<DbId, Block> = {}
const mockOrca = {
  state: { blocks: mockBlocks },
  notify: vi.fn(),
}

// @ts-ignore
globalThis.orca = mockOrca

vi.mock("./incrementalReadingStorage", () => ({
  advanceDueToToday: vi.fn(async () => ({
    priority: 50,
    lastRead: null,
    readCount: 0,
    due: new Date(),
  })),
}))

import { classifyTopicIRBlockMenu, advanceTopicDueToToday } from "./topicIRMenu"
import { advanceDueToToday } from "./incrementalReadingStorage"

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

function makeTopicBlock(id: DbId): Block {
  return makeBlock({
    id,
    refs: [
      {
        type: 2,
        alias: "card",
        id: 1,
        from: id,
        to: 1,
        data: [{ name: "type", value: "topic" }],
      } as any,
    ],
  })
}

function makeQueryBlock(id: DbId): Block {
  return makeBlock({
    id,
    properties: [{ name: "_repr", value: { type: "query" } } as any],
  })
}

describe("classifyTopicIRBlockMenu", () => {
  it("普通块 → join", () => {
    expect(classifyTopicIRBlockMenu(makeBlock({ id: 1 as DbId }))).toBe("join")
  })

  it("已有 basic #card 的普通块 → join（不是任意 card 就隐藏）", () => {
    const block = makeBlock({
      id: 2 as DbId,
      refs: [
        {
          type: 2,
          alias: "card",
          id: 1,
          from: 2,
          to: 1,
          data: [{ name: "type", value: "basic" }],
        } as any,
      ],
    })
    expect(classifyTopicIRBlockMenu(block)).toBe("join")
  })

  it("Topic IR → readToday", () => {
    expect(classifyTopicIRBlockMenu(makeTopicBlock(3 as DbId))).toBe("readToday")
  })

  it("查询块 → hidden", () => {
    expect(classifyTopicIRBlockMenu(makeQueryBlock(4 as DbId))).toBe("hidden")
  })

  it("查询块即使带 topic 标签也不显示", () => {
    const block = makeBlock({
      id: 5 as DbId,
      properties: [{ name: "_repr", value: { type: "query" } } as any],
      refs: [
        {
          type: 2,
          alias: "card",
          id: 1,
          from: 5,
          to: 1,
          data: [{ name: "type", value: "topic" }],
        } as any,
      ],
    })
    expect(classifyTopicIRBlockMenu(block)).toBe("hidden")
  })

  it("undefined → hidden", () => {
    expect(classifyTopicIRBlockMenu(undefined)).toBe("hidden")
  })
})

describe("advanceTopicDueToToday", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("成功时调用 advanceDueToToday 并给出清楚通知", async () => {
    const ok = await advanceTopicDueToToday(7 as DbId, "orca-srs")
    expect(ok).toBe(true)
    expect(advanceDueToToday).toHaveBeenCalledWith(7)
    expect(mockOrca.notify).toHaveBeenCalledWith("success", "已安排为今天阅读", {
      title: "渐进阅读",
    })
  })

  it("失败时返回 false，helper 不重复发错误通知", async () => {
    // 底层 advanceDueToToday 负责 console.error + orca.notify(error)；
    // advanceTopicDueToToday 仅返回 false，避免双重 toast。
    const err = new Error("write failed")
    vi.mocked(advanceDueToToday).mockRejectedValueOnce(err)

    const ok = await advanceTopicDueToToday(8 as DbId, "orca-srs")

    expect(ok).toBe(false)
    expect(mockOrca.notify).not.toHaveBeenCalledWith(
      "success",
      expect.anything(),
      expect.anything()
    )
    // helper 本身不额外发送错误通知
    expect(mockOrca.notify).not.toHaveBeenCalled()
  })
})

describe("registerContextMenu 使用 classifyTopicIRBlockMenu", () => {
  it("注册源码路径实际调用 classifyTopicIRBlockMenu 并注册菜单 ID", () => {
    // 直接 import contextMenuRegistry 会拉起 EPUB/React 组件的顶层 orca 依赖，
    // 这里校验注册源码绑定分类函数与菜单 ID，分类行为由上方单测覆盖。
    const source = readFileSync(
      resolve(__dirname, "registry/contextMenuRegistry.tsx"),
      "utf8"
    )
    expect(source).toContain('from "../topicIRMenu"')
    expect(source).toContain("classifyTopicIRBlockMenu")
    expect(source).toContain("classifyTopicIRBlockMenu(block) !== \"join\"")
    expect(source).toContain("classifyTopicIRBlockMenu(block) !== \"readToday\"")
    expect(source).toContain("${pluginName}.joinTopicIR")
    expect(source).toContain("${pluginName}.readTopicToday")
    expect(source).toContain("createTopicCardByBlockId")
    expect(source).toContain("advanceTopicDueToToday")
    expect(source).toContain("registeredMenuIds.push(joinTopicIRMenuId)")
    expect(source).toContain("registeredMenuIds.push(readTopicTodayMenuId)")
  })
})
