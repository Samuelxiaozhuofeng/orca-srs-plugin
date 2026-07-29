// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./storage", () => ({
  writeInitialClozeSrsState: vi.fn(async () => undefined),
  ensureClozeSrsState: vi.fn(async () => undefined),
  invalidateBlockCache: vi.fn()
}))
vi.mock("./tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => undefined)
}))

const cardRef = {
  id: 100,
  from: 1,
  to: 2,
  type: 2,
  alias: "card",
  data: [{ name: "type", type: 2, value: "extracts" }]
}
const block = {
  id: 1,
  text: "remember this",
  content: [{ t: "t", v: "remember this" }],
  refs: [cardRef],
  properties: [],
  children: [],
  aliases: [],
  backRefs: [],
  created: new Date(),
  modified: new Date()
}

const invokeEditorCommand = vi.fn(async (command: string, _cursor: unknown, ...args: any[]) => {
  if (command === "core.editor.setBlocksContent") {
    block.content = args[0][0].content
  }
  return true
})

globalThis.orca = {
  state: { blocks: { 1: block } },
  commands: { invokeEditorCommand },
  notify: vi.fn(),
  plugins: {
    getData: vi.fn(async () => null)
  }
}

import {
  cloneBlockContent,
  createCloze,
  getAllClozeNumbers,
  getMaxClozeNumberFromContent
} from "./clozeUtils"
import { ensureClozeSrsState, writeInitialClozeSrsState } from "./storage"

describe("getMaxClozeNumberFromContent", () => {
  it("counts legacy-prefix cloze fragments so numbering matches getAllClozeNumbers", () => {
    // 回归：中危#8 — 旧插件名（srs-plugin）创建的 fragment 也必须参与最大编号计算，
    // 否则生成侧与读取侧（getAllClozeNumbers 宽松匹配）判定不一致，产生重复编号。
    const content = [
      { t: "srs-plugin.cloze", v: "legacy", clozeNumber: 1 },
      { t: "t", v: " and text" },
      { t: "orca-srs.cloze", v: "current", clozeNumber: 2 }
    ]
    expect(getMaxClozeNumberFromContent(content, "orca-srs")).toBe(2)
    expect(getAllClozeNumbers(content, "orca-srs")).toEqual([1, 2])
    // 只有旧前缀时同样计入
    expect(
      getMaxClozeNumberFromContent(
        [{ t: "srs-plugin.cloze", v: "legacy", clozeNumber: 3 }],
        "orca-srs"
      )
    ).toBe(3)
  })

  it("ignores non-cloze fragments and fragments without a numeric clozeNumber", () => {
    const content = [
      { t: "t", v: "plain" },
      { t: "orca-srs.cloze", v: "broken" },
      { t: "orca-srs.clozeX", v: "not cloze", clozeNumber: 9 }
    ]
    expect(getMaxClozeNumberFromContent(content, "orca-srs")).toBe(0)
    expect(getAllClozeNumbers(content, "orca-srs")).toEqual([])
  })
})

describe("createCloze", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    block.content = [{ t: "t", v: "remember this" }]
    block.refs = [cardRef]
  })

  it("converts an existing Extract card tag to cloze", async () => {
    const result = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 0 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 8 },
      isForward: true
    }, "orca-srs")

    expect(result).toMatchObject({
      blockId: 1,
      clozeNumber: 1,
      pluginName: "orca-srs",
      addedCardTag: false,
      wroteInitialClozeSrs: true,
      isFirstClozeCard: false
    })
    // 挖空前正文快照：撤销必须还原，避免残留 .cloze fragment
    expect(result?.originalContent).toEqual([{ t: "t", v: "remember this" }])
    // 快照与当前 content 解耦（深拷贝），防止 valtio 变异污染 undoArgs
    expect(result?.originalContent).not.toBe(block.content)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "type", value: "cloze" }]
    )
    expect(writeInitialClozeSrsState).toHaveBeenCalledWith(1, 1, 0, undefined)
  })

  it("撤销后 originalContent 使 getMaxClozeNumber 归零，再挖空仍为 c1", async () => {
    // 回归：Cmd+Z 不还原文 → 残留 c1 fragment → 再挖变成 c2 双卡
    const result = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 0 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 8 },
      isForward: true
    }, "orca-srs")

    expect(result?.clozeNumber).toBe(1)
    expect(getMaxClozeNumberFromContent(block.content, "orca-srs")).toBe(1)

    // 模拟 undo 用 originalContent 还原
    const restored = cloneBlockContent(result!.originalContent!)!
    block.content = restored
    expect(getMaxClozeNumberFromContent(block.content, "orca-srs")).toBe(0)
    expect(getAllClozeNumbers(block.content, "orca-srs")).toEqual([])

    vi.clearAllMocks()
    const again = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 0 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 8 },
      isForward: true
    }, "orca-srs")
    expect(again?.clozeNumber).toBe(1)
  })

  it("assigns number 2 when a legacy-prefix cloze fragment already holds number 1", async () => {
    // 回归：中危#8 — 块内已有旧前缀（srs-plugin.cloze, clozeNumber=1）fragment 时，
    // 新挖空必须编号为 2，不得与旧填空共享编号 1（cardKey/srs.cN.* 混叠）。
    block.content = [
      { t: "srs-plugin.cloze", v: "legacy", clozeNumber: 1 },
      { t: "t", v: " remember this" }
    ]

    const result = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 1, offset: 1 },
      focus: { blockId: 1, isInline: true, index: 1, offset: 9 },
      isForward: true
    }, "orca-srs")

    expect(result).toMatchObject({
      blockId: 1,
      clozeNumber: 2,
      addedCardTag: false,
      isFirstClozeCard: false,
      wroteInitialClozeSrs: true
    })
    const newFragment = block.content.find(f => f.t === "orca-srs.cloze")
    expect(newFragment?.clozeNumber).toBe(2)
    // 新编号 c2 初始写入；旧前缀 c1 走 ensure，不覆盖
    expect(writeInitialClozeSrsState).toHaveBeenCalledTimes(1)
    expect(writeInitialClozeSrsState).toHaveBeenCalledWith(1, 2, 1, undefined)
    expect(ensureClozeSrsState).toHaveBeenCalledTimes(1)
    expect(ensureClozeSrsState).toHaveBeenCalledWith(1, 1, 0)
  })

  it("keeps existing cloze SRS state when adding a second cloze", async () => {
    // 回归：高危#2 — 块已有 c1（已有 srs.c1.* 复习历史）时二次挖空 c2：
    // c1 只能走 ensureClozeSrsState（有 hasPropertyWithPrefix 守卫，不覆盖进度），
    // 仅本次新建的 c2 走 writeInitialClozeSrsState。
    block.content = [
      { t: "orca-srs.cloze", v: "remember", clozeNumber: 1 },
      { t: "t", v: " this detail" }
    ]

    const result = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 1, offset: 6 },
      focus: { blockId: 1, isInline: true, index: 1, offset: 12 },
      isForward: true
    }, "orca-srs")

    expect(result).toMatchObject({
      blockId: 1,
      clozeNumber: 2,
      addedCardTag: false,
      isFirstClozeCard: false,
      wroteInitialClozeSrs: true
    })
    // 已存在的 c1：仅 ensure（daysOffset = clozeNumber - 1 = 0），绝不初始重写
    expect(ensureClozeSrsState).toHaveBeenCalledTimes(1)
    expect(ensureClozeSrsState).toHaveBeenCalledWith(1, 1, 0)
    // 新建的 c2：仅初始写入（daysOffset = 1）
    expect(writeInitialClozeSrsState).toHaveBeenCalledTimes(1)
    expect(writeInitialClozeSrsState).toHaveBeenCalledWith(1, 2, 1, undefined)
    expect(writeInitialClozeSrsState).not.toHaveBeenCalledWith(1, 1, expect.anything())
  })

  it("无 #card 时首次 cloze 标记 addedCardTag/isFirstClozeCard", async () => {
    block.refs = []
    const result = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 0 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 8 },
      isForward: true
    }, "orca-srs")

    expect(result).toMatchObject({
      blockId: 1,
      clozeNumber: 1,
      addedCardTag: true,
      isFirstClozeCard: true,
      wroteInitialClozeSrs: true
    })
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      1,
      "card",
      expect.any(Array)
    )
  })

  it("ir_item 路径把 absolute due 传给 writeInitialClozeSrsState（1–14 天）", async () => {
    const before = Date.now()
    const result = await createCloze(
      {
        panelId: "p1",
        rootBlockId: 1,
        anchor: { blockId: 1, isInline: true, index: 0, offset: 0 },
        focus: { blockId: 1, isInline: true, index: 0, offset: 8 },
        isForward: true
      },
      "orca-srs",
      { initialDueOrigin: "ir_item", irPriority: 50 }
    )

    expect(result?.clozeNumber).toBe(1)
    expect(writeInitialClozeSrsState).toHaveBeenCalledTimes(1)
    const args = vi.mocked(writeInitialClozeSrsState).mock.calls[0]
    expect(args[0]).toBe(1)
    expect(args[1]).toBe(1)
    expect(args[2]).toBe(0)
    const absoluteDue = args[3] as Date
    expect(absoluteDue).toBeInstanceOf(Date)
    const delayDays = (absoluteDue.getTime() - before) / (24 * 60 * 60 * 1000)
    // dispersed：至少约 1 天，不超过 14 天（允许少量时钟误差）
    expect(delayDays).toBeGreaterThanOrEqual(0.99)
    expect(delayDays).toBeLessThanOrEqual(14.01)
    expect(result?.initialDue?.getTime()).toBe(absoluteDue.getTime())
  })
})
