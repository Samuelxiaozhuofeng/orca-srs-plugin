// @ts-nocheck
/**
 * 选择题创建：#card type=choice / _repr / 初始 SRS / undo 标志
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./storage", () => ({
  ensureCardSrsState: vi.fn(async () => undefined),
  writeInitialSrsState: vi.fn(async () => undefined),
  invalidateBlockCache: vi.fn()
}))

vi.mock("./tagCleanup", () => ({
  cleanupSrsProperties: vi.fn(async () => undefined)
}))

vi.mock("./tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => undefined)
}))

vi.mock("./cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async () => [
    { name: "type", value: "choice" },
    { name: "牌组", value: [] },
    { name: "status", value: "" }
  ])
}))

const mockBlocks: Record<number, any> = {}

const invokeEditorCommand = vi.fn(async () => true)

globalThis.orca = {
  state: { blocks: mockBlocks },
  commands: { invokeEditorCommand },
  notify: vi.fn(),
  invokeBackend: vi.fn(async () => undefined)
}

import { createChoiceCardFromBlock } from "./choiceCardCreator"
import { cleanupSrsProperties } from "./tagCleanup"
import { ensureCardSrsState, writeInitialSrsState } from "./storage"
import { ensureCardTagProperties } from "./tagPropertyInit"

function makeBlock(partial: Record<string, unknown>) {
  return {
    id: partial.id,
    created: new Date(),
    modified: new Date(),
    children: partial.children ?? [],
    aliases: [],
    properties: [],
    refs: partial.refs ?? [],
    backRefs: [],
    text: partial.text ?? "题干",
    content: [{ t: "t", v: partial.text ?? "题干" }],
    _repr: partial._repr
  }
}

describe("createChoiceCardFromBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as any])
  })

  it("新卡：插入 #card type=choice、设 _repr、写初始 SRS 并返回 undo 标志", async () => {
    mockBlocks[1] = makeBlock({ id: 1, text: "题干" })
    const cursor = {
      panelId: "p",
      rootBlockId: 1,
      anchor: { blockId: 1 },
      focus: { blockId: 1 }
    }

    const result = await createChoiceCardFromBlock(cursor as any, "orca-srs")

    expect(result).toMatchObject({
      blockId: 1,
      pluginName: "orca-srs",
      addedCardTag: true,
      wroteInitialSrs: true
    })
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      cursor,
      1,
      "card",
      expect.any(Array)
    )
    const insertTagCalls = invokeEditorCommand.mock.calls.filter(
      c => c[0] === "core.editor.insertTag"
    )
    expect(insertTagCalls).toHaveLength(1)
    expect(insertTagCalls[0][3]).toBe("card")
    expect(ensureCardTagProperties).toHaveBeenCalledWith("orca-srs")
    expect(cleanupSrsProperties).toHaveBeenCalledWith(1, "orca-srs")
    expect(writeInitialSrsState).toHaveBeenCalledWith(1)
    expect(mockBlocks[1]._repr).toMatchObject({
      type: "srs.choice-card",
      cardType: "choice"
    })
    expect(orca.notify).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("#correct"),
      expect.any(Object)
    )
  })

  it("已有 #card 时不重新 insertTag，只 setRefData type=choice 并 ensure SRS", async () => {
    const cardRef = {
      type: 2,
      alias: "card",
      id: 9,
      from: 2,
      to: 1,
      data: [{ name: "type", value: "basic" }]
    }
    mockBlocks[2] = makeBlock({
      id: 2,
      text: "题",
      refs: [cardRef],
      children: [20]
    })
    mockBlocks[20] = makeBlock({
      id: 20,
      text: "正确选项",
      refs: [{ type: 2, alias: "correct" }]
    })

    const result = await createChoiceCardFromBlock(
      {
        panelId: "p",
        rootBlockId: 2,
        anchor: { blockId: 2 },
        focus: { blockId: 2 }
      } as any,
      "orca-srs"
    )

    expect(result).toMatchObject({
      blockId: 2,
      addedCardTag: false,
      wroteInitialSrs: false
    })
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "type", value: "choice" }]
    )
    const insertTagCalls = invokeEditorCommand.mock.calls.filter(
      c => c[0] === "core.editor.insertTag"
    )
    expect(insertTagCalls).toHaveLength(0)
    expect(writeInitialSrsState).not.toHaveBeenCalled()
    expect(ensureCardSrsState).toHaveBeenCalledWith(2)
    // 有 #correct 子块时不提示缺正确项
    expect(orca.notify).not.toHaveBeenCalledWith(
      "info",
      expect.stringContaining("#correct"),
      expect.any(Object)
    )
  })

  it("已有 #card 且 type=choice 时不再 insert 标签", async () => {
    mockBlocks[3] = makeBlock({
      id: 3,
      refs: [
        { type: 2, alias: "card", data: [{ name: "type", value: "choice" }] }
      ]
    })

    const result = await createChoiceCardFromBlock(
      {
        panelId: "p",
        rootBlockId: 3,
        anchor: { blockId: 3 },
        focus: { blockId: 3 }
      } as any,
      "orca-srs"
    )

    expect(result).toMatchObject({
      addedCardTag: false,
      wroteInitialSrs: false
    })
    const insertTagCalls = invokeEditorCommand.mock.calls.filter(
      c => c[0] === "core.editor.insertTag"
    )
    expect(insertTagCalls).toHaveLength(0)
    // 仍会 setRefData 将 type 写为 choice（幂等）
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      expect.objectContaining({ alias: "card" }),
      [{ name: "type", value: "choice" }]
    )
  })

  it("无光标返回 null", async () => {
    const result = await createChoiceCardFromBlock(null as any, "orca-srs")
    expect(result).toBeNull()
    expect(orca.notify).toHaveBeenCalledWith("error", "无法获取光标位置")
  })
})
