/**
 * scanCardsFromTags 兜底门控回归
 *
 * - 标签查询成功返回空数组 → 不调用 get-all-blocks
 * - 有结果 → 不兜底
 * - 标签查询 throw → 才走 get-all-blocks 手工过滤
 * - 两条路径都失败 → 可见失败，不得伪装「没有找到卡片」
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"

const invokeBackendMock = vi.fn()
const notifyMock = vi.fn()

;(globalThis as any).orca = {
  state: { blocks: {} },
  invokeBackend: invokeBackendMock,
  notify: notifyMock,
  commands: { invokeEditorCommand: vi.fn() }
}

import { scanCardsFromTags } from "./cardCreator"

const PLUGIN = "orca-srs"

function makeBlock(
  id: DbId,
  opts: { cardTag?: boolean; text?: string } = {}
): Block {
  return {
    id,
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [],
    refs: opts.cardTag
      ? [{ type: 2, alias: "card", id: 1 as DbId } as any]
      : [],
    backRefs: [],
    text: opts.text ?? `block-${id}`,
    content: []
  } as Block
}

const invokedMethods = () =>
  invokeBackendMock.mock.calls.map((c) => c[0] as string)

beforeEach(() => {
  invokeBackendMock.mockReset()
  notifyMock.mockReset()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("scanCardsFromTags 兜底门控", () => {
  it("成功返回空数组：不调用 get-all-blocks，提示没有找到卡片", async () => {
    invokeBackendMock.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") return []
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return null
    })

    await scanCardsFromTags(PLUGIN)

    expect(invokedMethods()).toEqual(["get-blocks-with-tags"])
    expect(invokedMethods()).not.toContain("get-all-blocks")
    expect(notifyMock).toHaveBeenCalledWith(
      "info",
      "没有找到带 #card 标签的块",
      expect.objectContaining({ title: "SRS 扫描" })
    )
  })

  it("有结果时不走 get-all-blocks 兜底", async () => {
    const card = makeBlock(10 as DbId, { cardTag: true })
    ;(card as any)._repr = { type: "srs.card" }

    invokeBackendMock.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") return [card]
      if (method === "get-all-blocks") {
        throw new Error("不应触发 get-all-blocks 全库扫描")
      }
      return null
    })

    await scanCardsFromTags(PLUGIN)

    expect(invokedMethods().filter((m) => m === "get-blocks-with-tags")).toHaveLength(1)
    expect(invokedMethods()).not.toContain("get-all-blocks")
    // 已是 srs.card 会跳过转换，但仍走成功完成路径
    expect(notifyMock).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("转换了"),
      expect.objectContaining({ title: "SRS 扫描完成" })
    )
  })

  it("标签查询 throw 后才走 get-all-blocks 兜底并按 #card 过滤", async () => {
    const cardBlock = makeBlock(20 as DbId, { cardTag: true })
    const plainBlock = makeBlock(21 as DbId, { cardTag: false })

    invokeBackendMock.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") {
        throw new Error("tags api down")
      }
      if (method === "get-all-blocks") {
        return [cardBlock, plainBlock]
      }
      return null
    })

    await scanCardsFromTags(PLUGIN)

    expect(invokedMethods()).toContain("get-all-blocks")
    expect(invokedMethods().filter((m) => m === "get-all-blocks")).toHaveLength(1)
    // 兜底找到 1 张后会处理（可能 skip 或 convert）；不得报「没有找到」
    expect(notifyMock).not.toHaveBeenCalledWith(
      "info",
      "没有找到带 #card 标签的块",
      expect.anything()
    )
  })

  it("标签查询与全库兜底均失败时报告失败，不得伪装没有找到卡片", async () => {
    invokeBackendMock.mockImplementation(async (method: string) => {
      if (method === "get-blocks-with-tags") {
        throw new Error("tags api down")
      }
      if (method === "get-all-blocks") {
        throw new Error("all-blocks down")
      }
      return null
    })

    await scanCardsFromTags(PLUGIN)

    expect(notifyMock).toHaveBeenCalledWith(
      "error",
      expect.stringMatching(/扫描失败/),
      expect.objectContaining({ title: "SRS 扫描" })
    )
    expect(notifyMock).not.toHaveBeenCalledWith(
      "info",
      "没有找到带 #card 标签的块",
      expect.anything()
    )
  })
})
