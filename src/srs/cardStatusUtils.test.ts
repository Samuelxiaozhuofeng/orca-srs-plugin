/**
 * 变体级暂停/恢复（srs.cN.suspended / srs.forward|backward.suspended）+ legacy 整块暂停迁移。
 *
 * 回归重点（模块文档/问题经验.md）：
 * - 后端 get-block 抛错/返回空必须可见失败，绝不回退可能陈旧的 orca.state.blocks
 * - 每次 block-property 写后立即失效 SRS + IR 缓存（不能攒到下一次写）
 * - legacy 整块恢复：行内图/子块图 IO 宿主（_repr 非 IO 但 cardType=image-occlusion + masks）
 *   必须按 masks 显式保持其它遮罩编号暂停，不能误当文字 cloze
 * - 中途失败整体抛错，不伪装成功
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, BlockRef } from "../orca.d.ts"

const mocks = vi.hoisted(() => ({
  invalidateBlockCache: vi.fn(),
  invalidateIrBlockCache: vi.fn(),
  invokeBackend: vi.fn(),
  invokeEditorCommand: vi.fn()
}))

vi.mock("./storage", () => ({
  invalidateBlockCache: (...args: unknown[]) => mocks.invalidateBlockCache(...args)
}))

vi.mock("./incremental-reading/irBlockCache", () => ({
  invalidateIrBlockCache: (...args: unknown[]) => mocks.invalidateIrBlockCache(...args)
}))

import {
  buildVariantSuspendedPropName,
  isVariantSuspended,
  suspendCard,
  unsuspendCard
} from "./cardStatusUtils"

const stateBlocks: Record<number, Block> = {}

;(globalThis as unknown as { orca: unknown }).orca = {
  state: { blocks: stateBlocks },
  invokeBackend: mocks.invokeBackend,
  commands: { invokeEditorCommand: mocks.invokeEditorCommand }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const PLUGIN = "srs-plugin"

function cardRef(type?: string, status?: string): BlockRef {
  const data = []
  if (type !== undefined) data.push({ name: "type", value: type, type: 1 })
  if (status !== undefined) data.push({ name: "status", value: status, type: 1 })
  return { id: 100, from: 1, to: 1000, type: 2, alias: "card", data }
}

type Prop = { name: string; value: unknown }

function makeBlock(partial: {
  id: number
  type?: string
  status?: string
  props?: Prop[]
  content?: Block["content"]
  repr?: unknown
}): Block {
  return {
    id: partial.id,
    refs: [cardRef(partial.type, partial.status)],
    properties: partial.props,
    content: partial.content,
    text: "sample text",
    _repr: partial.repr
  } as unknown as Block
}

function clozeContent(nums: number[]): Block["content"] {
  return nums.map((n) => ({ t: `${PLUGIN}.cloze`, clozeNumber: n, v: "x" }))
}

const directionContent: Block["content"] = [
  { t: `${PLUGIN}.direction`, direction: "bidirectional", v: "→" }
]

const ioMasks = JSON.stringify({
  version: 1,
  regions: [
    { id: "r1", n: 1, shape: "rect", x: 0, y: 0, w: 1, h: 1 },
    { id: "r2", n: 2, shape: "rect", x: 0, y: 0, w: 1, h: 1 }
  ]
})

beforeEach(() => {
  for (const fn of [
    mocks.invalidateBlockCache,
    mocks.invalidateIrBlockCache,
    mocks.invokeBackend,
    mocks.invokeEditorCommand
  ]) {
    fn.mockReset()
  }
  mocks.invokeEditorCommand.mockResolvedValue(undefined)
})

afterEach(() => {
  for (const key of Object.keys(stateBlocks)) {
    delete stateBlocks[Number(key)]
  }
})

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

describe("buildVariantSuspendedPropName", () => {
  it("cloze / direction 属性名与文档契约一致", () => {
    expect(buildVariantSuspendedPropName(1)).toBe("srs.c1.suspended")
    expect(buildVariantSuspendedPropName(undefined, "forward")).toBe("srs.forward.suspended")
    expect(buildVariantSuspendedPropName(undefined, "backward")).toBe("srs.backward.suspended")
  })

  it("非法输入返回 null", () => {
    expect(buildVariantSuspendedPropName(0)).toBeNull()
    expect(buildVariantSuspendedPropName(1.5)).toBeNull()
    expect(buildVariantSuspendedPropName(undefined, "both" as never)).toBeNull()
    expect(buildVariantSuspendedPropName()).toBeNull()
  })
})

describe("isVariantSuspended", () => {
  it("只认严格 true；未知值一律视为未暂停", () => {
    const block = makeBlock({
      id: 1,
      props: [
        { name: "srs.c1.suspended", value: true },
        { name: "srs.c2.suspended", value: "true" },
        { name: "srs.c3.suspended", value: 1 }
      ]
    })
    expect(isVariantSuspended(block, "cloze", 1)).toBe(true)
    expect(isVariantSuspended(block, "cloze", 2)).toBe(false)
    expect(isVariantSuspended(block, "cloze", 3)).toBe(false)
    expect(isVariantSuspended(block, "basic")).toBe(false)
    expect(isVariantSuspended(undefined, "cloze", 1)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Basic：整块暂停/恢复 + 缓存失效 + 失败可见
// ---------------------------------------------------------------------------

describe("suspendCard / unsuspendCard（无变体卡）", () => {
  it("暂停写 #card status=suspend，恢复写空，均立即失效缓存", async () => {
    mocks.invokeBackend.mockResolvedValue(makeBlock({ id: 1, type: "basic" }))

    await suspendCard({ id: 1, cardType: "basic" })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      expect.objectContaining({ alias: "card" }),
      [{ name: "status", value: "suspend" }]
    )
    expect(mocks.invalidateBlockCache).toHaveBeenCalledWith(1)
    expect(mocks.invalidateIrBlockCache).toHaveBeenCalledWith(1)

    mocks.invokeEditorCommand.mockClear()
    mocks.invalidateBlockCache.mockClear()
    mocks.invalidateIrBlockCache.mockClear()

    await unsuspendCard({ id: 1, cardType: "basic" })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      expect.objectContaining({ alias: "card" }),
      [{ name: "status", value: "" }]
    )
    expect(mocks.invalidateBlockCache).toHaveBeenCalledWith(1)
    expect(mocks.invalidateIrBlockCache).toHaveBeenCalledWith(1)
  })

  it("后端 get-block 抛错：可见失败（含 blockId），绝不回退 orca.state.blocks", async () => {
    // state 里放着看似可用的陈旧块（有 #card 标签），后端却抛错
    stateBlocks[7] = makeBlock({ id: 7, type: "basic", status: "suspend" })
    mocks.invokeBackend.mockRejectedValue(new Error("backend down"))

    await expect(unsuspendCard({ id: 7, cardType: "basic" })).rejects.toThrow(/7/)
    await expect(unsuspendCard({ id: 7, cardType: "basic" })).rejects.toThrow(/backend down/)
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("后端 get-block 返回空：同样失败，不写任何东西", async () => {
    mocks.invokeBackend.mockResolvedValue(null)
    await expect(unsuspendCard({ id: 9, cardType: "basic" })).rejects.toThrow(/9/)
    await expect(suspendCard({ id: 9, cardType: "basic" })).rejects.toThrow(/9/)
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("块没有 #card 标签：失败可见", async () => {
    mocks.invokeBackend.mockResolvedValue({ id: 11, refs: [] } as unknown as Block)
    await expect(suspendCard({ id: 11, cardType: "basic" })).rejects.toThrow(/11/)
    await expect(unsuspendCard({ id: 11, cardType: "basic" })).rejects.toThrow(/11/)
  })
})

// ---------------------------------------------------------------------------
// Cloze / Direction / IO：变体级暂停互不影响
// ---------------------------------------------------------------------------

describe("suspendCard / unsuspendCard（变体级）", () => {
  it("Cloze c1 暂停只写 srs.c1.suspended；恢复只删自己的属性，c2 不受影响", async () => {
    const block = makeBlock({
      id: 2,
      type: "cloze",
      content: clozeContent([1, 2]),
      props: [{ name: "srs.c1.suspended", value: true }]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await suspendCard({ id: 2, cardType: "cloze", clozeNumber: 1 })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [2],
      [{ name: "srs.c1.suspended", value: true, type: 4 }]
    )
    expect(isVariantSuspended(block, "cloze", 1)).toBe(true)
    expect(isVariantSuspended(block, "cloze", 2)).toBe(false)
    expect(mocks.invalidateBlockCache).toHaveBeenCalledWith(2)

    mocks.invokeEditorCommand.mockClear()
    mocks.invalidateBlockCache.mockClear()

    await unsuspendCard({ id: 2, cardType: "cloze", clozeNumber: 1 })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [2],
      ["srs.c1.suspended"]
    )
    expect(mocks.invalidateBlockCache).toHaveBeenCalledWith(2)
    expect(mocks.invalidateIrBlockCache).toHaveBeenCalledWith(2)
  })

  it("Direction forward 暂停不影响 backward，分别恢复", async () => {
    const block = makeBlock({
      id: 3,
      type: "direction",
      content: directionContent,
      props: [{ name: "srs.forward.suspended", value: true }]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await suspendCard({ id: 3, cardType: "direction", directionType: "forward" })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [3],
      [{ name: "srs.forward.suspended", value: true, type: 4 }]
    )
    expect(isVariantSuspended(block, "direction", undefined, "forward")).toBe(true)
    expect(isVariantSuspended(block, "direction", undefined, "backward")).toBe(false)

    mocks.invokeEditorCommand.mockClear()

    await unsuspendCard({ id: 3, cardType: "direction", directionType: "forward" })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [3],
      ["srs.forward.suspended"]
    )

    mocks.invokeEditorCommand.mockClear()
    await unsuspendCard({ id: 3, cardType: "direction", directionType: "backward" })
    // backward 没有暂停属性：不发删除、不写任何东西
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("IO c1 暂停不影响 c2（非 legacy 变体路径不需要 masks）", async () => {
    const block = makeBlock({
      id: 4,
      type: "image-occlusion",
      props: [
        { name: "srs.c1.suspended", value: true },
        { name: "srs.io.masks", value: ioMasks }
      ]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await suspendCard({ id: 4, cardType: "image-occlusion", clozeNumber: 1 })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [4],
      [{ name: "srs.c1.suspended", value: true, type: 4 }]
    )
    expect(isVariantSuspended(block, "image-occlusion", 1)).toBe(true)
    expect(isVariantSuspended(block, "image-occlusion", 2)).toBe(false)

    mocks.invokeEditorCommand.mockClear()
    await unsuspendCard({ id: 4, cardType: "image-occlusion", clozeNumber: 1 })
    expect(mocks.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.deleteProperties",
      null,
      [4],
      ["srs.c1.suspended"]
    )
  })

  it("变体卡缺少 clozeNumber / directionType：定位失败可见", async () => {
    await expect(suspendCard({ id: 5, cardType: "cloze" })).rejects.toThrow(/clozeNumber/)
    await expect(suspendCard({ id: 5, cardType: "direction" })).rejects.toThrow(/directionType/)
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// legacy 整块暂停（#card.status=suspend）迁移恢复
// ---------------------------------------------------------------------------

describe("unsuspendCard legacy 整块暂停迁移", () => {
  it("Cloze：恢复 c1 时把其它存活变体 c2 显式保持暂停，再清整块 status；每次写后立即失效", async () => {
    const block = makeBlock({
      id: 20,
      type: "cloze",
      status: "suspend",
      content: clozeContent([1, 2]),
      props: [{ name: "srs.c1.due", value: "2026-01-01T00:00:00.000Z" }]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    const order: string[] = []
    mocks.invokeEditorCommand.mockImplementation(async (cmd: string) => {
      order.push(cmd)
    })
    mocks.invalidateBlockCache.mockImplementation((id: number) => {
      order.push(`b:${id}`)
    })
    mocks.invalidateIrBlockCache.mockImplementation((id: number) => {
      order.push(`ir:${id}`)
    })

    await unsuspendCard({ id: 20, cardType: "cloze", clozeNumber: 1 }, { pluginName: PLUGIN })

    // 顺序：setProperties(其他变体暂停) → 立即失效 → setRefData(清整块) → 立即失效
    expect(order).toEqual([
      "core.editor.setProperties",
      "b:20",
      "ir:20",
      "core.editor.setRefData",
      "b:20",
      "ir:20"
    ])
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.setProperties",
      null,
      [20],
      [{ name: "srs.c2.suspended", value: true, type: 4 }]
    )
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(
      2,
      "core.editor.setRefData",
      null,
      expect.objectContaining({ alias: "card" }),
      [{ name: "status", value: "" }]
    )
  })

  it("Direction：恢复 forward 时 backward 显式保持暂停", async () => {
    const block = makeBlock({
      id: 21,
      type: "direction",
      status: "suspend",
      content: directionContent
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await unsuspendCard(
      { id: 21, cardType: "direction", directionType: "forward" },
      { pluginName: PLUGIN }
    )
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.setProperties",
      null,
      [21],
      [{ name: "srs.backward.suspended", value: true, type: 4 }]
    )
  })

  it("行内 IO 宿主（_repr 非 IO 但 cardType=image-occlusion + masks）：恢复 c1 时按 masks 保持 c2 暂停", async () => {
    // 行内图/子块图宿主不改 _repr（见 模块文档/SRS_图片遮罩.md），
    // 必须靠结构化 cardType 判定 IO，否则 c2 会被误当文字 cloze 而隐式恢复。
    const block = makeBlock({
      id: 22,
      type: "image-occlusion",
      status: "suspend",
      repr: { type: "image", src: "./a.png" },
      props: [{ name: "srs.io.masks", value: ioMasks }]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await unsuspendCard(
      { id: 22, cardType: "image-occlusion", clozeNumber: 1 },
      { pluginName: PLUGIN }
    )
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.setProperties",
      null,
      [22],
      [{ name: "srs.c2.suspended", value: true, type: 4 }]
    )
  })

  it("纯图片 IO 宿主（_repr=srs.image-occlusion）同样按 masks 保持其它编号暂停", async () => {
    const block = makeBlock({
      id: 23,
      type: "image-occlusion",
      status: "suspend",
      repr: { type: "srs.image-occlusion", src: "./a.png" },
      props: [{ name: "srs.io.masks", value: ioMasks }]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await unsuspendCard(
      { id: 23, cardType: "image-occlusion", clozeNumber: 2 },
      { pluginName: PLUGIN }
    )
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.setProperties",
      null,
      [23],
      [{ name: "srs.c1.suspended", value: true, type: 4 }]
    )
  })

  it("legacy 整块 + 目标变体已有变体级暂停：清整块后再删目标属性", async () => {
    const block = makeBlock({
      id: 24,
      type: "cloze",
      status: "suspend",
      content: clozeContent([1, 2]),
      props: [
        { name: "srs.c1.suspended", value: true },
        { name: "srs.c2.due", value: "2026-01-01T00:00:00.000Z" }
      ]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await unsuspendCard({ id: 24, cardType: "cloze", clozeNumber: 1 }, { pluginName: PLUGIN })
    // 1) 其它变体保持暂停  2) 清整块 status  3) 删目标变体属性
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(1, "core.editor.setProperties", null, [24], [
      { name: "srs.c2.suspended", value: true, type: 4 }
    ])
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(2, "core.editor.setRefData", null, expect.anything(), [
      { name: "status", value: "" }
    ])
    expect(mocks.invokeEditorCommand).toHaveBeenNthCalledWith(
      3,
      "core.editor.deleteProperties",
      null,
      [24],
      ["srs.c1.suspended"]
    )
  })

  it("迁移中途失败：整体抛错，绝不静默成功", async () => {
    const block = makeBlock({
      id: 25,
      type: "cloze",
      status: "suspend",
      content: clozeContent([1, 2]),
      props: [{ name: "srs.c1.due", value: "2026-01-01T00:00:00.000Z" }]
    })
    mocks.invokeBackend.mockResolvedValue(block)
    mocks.invokeEditorCommand
      .mockResolvedValueOnce(undefined) // setProperties 成功
      .mockRejectedValueOnce(new Error("setRefData boom")) // 清整块失败

    await expect(
      unsuspendCard({ id: 25, cardType: "cloze", clozeNumber: 1 }, { pluginName: PLUGIN })
    ).rejects.toThrow("setRefData boom")
  })

  it("legacy 整块恢复读取损坏 masks：失败可见", async () => {
    const block = makeBlock({
      id: 26,
      type: "image-occlusion",
      status: "suspend",
      repr: { type: "image", src: "./a.png" },
      props: [{ name: "srs.io.masks", value: "{not-json" }]
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await expect(
      unsuspendCard({ id: 26, cardType: "image-occlusion", clozeNumber: 1 }, { pluginName: PLUGIN })
    ).rejects.toThrow(/26/)
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("legacy IO 的 masks 缺失或目标编号已删除：拒绝清整块暂停", async () => {
    const missingMasks = makeBlock({
      id: 27,
      type: "image-occlusion",
      status: "suspend",
      repr: { type: "image", src: "./a.png" }
    })
    mocks.invokeBackend.mockResolvedValueOnce(missingMasks)
    await expect(
      unsuspendCard({ id: 27, cardType: "image-occlusion", clozeNumber: 1 })
    ).rejects.toThrow(/srs\.io\.masks/)

    const staleTarget = makeBlock({
      id: 28,
      type: "image-occlusion",
      status: "suspend",
      props: [{ name: "srs.io.masks", value: ioMasks }]
    })
    mocks.invokeBackend.mockResolvedValueOnce(staleTarget)
    await expect(
      unsuspendCard({ id: 28, cardType: "image-occlusion", clozeNumber: 3 })
    ).rejects.toThrow(/c3.*不存在/)
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("legacy Cloze 目标编号已删除：拒绝清整块暂停", async () => {
    const block = makeBlock({
      id: 29,
      type: "cloze",
      status: "suspend",
      content: clozeContent([2])
    })
    mocks.invokeBackend.mockResolvedValue(block)

    await expect(
      unsuspendCard({ id: 29, cardType: "cloze", clozeNumber: 1 }, { pluginName: PLUGIN })
    ).rejects.toThrow(/c1.*不存在/)
    expect(mocks.invokeEditorCommand).not.toHaveBeenCalled()
  })
})
