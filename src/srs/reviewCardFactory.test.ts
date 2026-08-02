/**
 * convertBlockToReviewCards 的暂停过滤与 include-suspended 收集路径。
 *
 * 回归重点：
 * - 默认（历史）行为：整块 suspend 不产出；变体级 suspend 只跳过该变体
 * - include-suspended：暂停行返回并带 isSuspended=true；同块 active 变体不标记
 * - IO / Direction 变体同样按变体隔离
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, BlockRef } from "../orca.d.ts"
import { clearBlockCache, preheatBlockCache } from "./storage"
import { convertBlockToReviewCards } from "./reviewCardFactory"

const PLUGIN = "srs-plugin"

;(globalThis as unknown as { orca: unknown }).orca = {
  state: { blocks: {} },
  invokeBackend: vi.fn(async () => {
    throw new Error("reviewCardFactory 测试不应触发后端调用")
  }),
  commands: { invokeEditorCommand: vi.fn() }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function cardRef(type: string): BlockRef {
  return {
    id: 100,
    from: 1,
    to: 1000,
    type: 2,
    alias: "card",
    data: [{ name: "type", value: type, type: 1 }]
  }
}

type Prop = { name: string; value: unknown }

function makeBlock(partial: {
  id: number
  type: string
  props?: Prop[]
  content?: Block["content"]
  text?: string
}): Block {
  return {
    id: partial.id,
    refs: [cardRef(partial.type)],
    properties: partial.props,
    content: partial.content,
    text: partial.text ?? "sample text"
  } as unknown as Block
}

function clozeContent(nums: number[]): Block["content"] {
  return nums.map((n) => ({ t: `${PLUGIN}.cloze`, clozeNumber: n, v: "x" }))
}

const ioMasks = JSON.stringify({
  version: 1,
  regions: [
    { id: "r1", n: 1, shape: "rect", x: 0, y: 0, w: 1, h: 1 },
    { id: "r2", n: 2, shape: "rect", x: 0, y: 0, w: 1, h: 1 }
  ]
})

const directionContent: Block["content"] = [
  { t: "text", v: "左文本" },
  { t: `${PLUGIN}.direction`, direction: "bidirectional", v: "→" },
  { t: "text", v: "右文本" }
]

/** 至少一个 srs.cN.* / srs.forward.* 属性，确保 ensure* 走读路径不写后端 */
const C1_DUE = { name: "srs.c1.due", value: "2026-01-01T00:00:00.000Z" }
const C2_DUE = { name: "srs.c2.due", value: "2026-01-02T00:00:00.000Z" }
const FWD_DUE = { name: "srs.forward.due", value: "2026-01-01T00:00:00.000Z" }
const BWD_DUE = { name: "srs.backward.due", value: "2026-01-02T00:00:00.000Z" }

beforeEach(() => {
  clearBlockCache()
})

afterEach(() => {
  clearBlockCache()
})

// ---------------------------------------------------------------------------

describe("convertBlockToReviewCards 默认（历史）行为", () => {
  it("整块 suspend：直接不产出", async () => {
    const block = makeBlock({
      id: 1,
      type: "cloze",
      content: clozeContent([1, 2]),
      props: [C1_DUE, C2_DUE]
    })
    // 给 #card ref 加 status=suspend
    block.refs = [
      {
        id: 100,
        from: 1,
        to: 1000,
        type: 2,
        alias: "card",
        data: [
          { name: "type", value: "cloze", type: 1 },
          { name: "status", value: "suspend", type: 1 }
        ]
      }
    ]
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN)
    expect(cards).toEqual([])
  })

  it("Cloze c1 变体暂停：只跳过 c1，c2 正常返回且不带 isSuspended", async () => {
    const block = makeBlock({
      id: 2,
      type: "cloze",
      content: clozeContent([1, 2]),
      props: [C1_DUE, C2_DUE, { name: "srs.c1.suspended", value: true }]
    })
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN)
    expect(cards.map((c) => c.clozeNumber)).toEqual([2])
    expect(cards[0].isSuspended).toBeUndefined()
  })

  it("IO c1 变体暂停：只跳过 c1，c2 正常返回", async () => {
    const block = makeBlock({
      id: 3,
      type: "image-occlusion",
      props: [C1_DUE, C2_DUE, { name: "srs.c1.suspended", value: true }, { name: "srs.io.masks", value: ioMasks }]
    })
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN)
    expect(cards.map((c) => c.clozeNumber)).toEqual([2])
    expect(cards[0].cardType).toBe("image-occlusion")
  })

  it("Direction forward 暂停：只跳过 forward，backward 正常返回", async () => {
    const block = makeBlock({
      id: 4,
      type: "direction",
      content: directionContent,
      props: [FWD_DUE, BWD_DUE, { name: "srs.forward.suspended", value: true }]
    })
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN)
    expect(cards.map((c) => c.directionType)).toEqual(["backward"])
  })

  it("Basic 整块 suspend：默认不产出", async () => {
    const block = makeBlock({ id: 5, type: "basic", props: [{ name: "srs.due", value: "2026-01-01T00:00:00.000Z" }] })
    block.refs = [
      {
        id: 100,
        from: 5,
        to: 1000,
        type: 2,
        alias: "card",
        data: [
          { name: "type", value: "basic", type: 1 },
          { name: "status", value: "suspend", type: 1 }
        ]
      }
    ]
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN)
    expect(cards).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe("convertBlockToReviewCards include-suspended 路径", () => {
  it("legacy 整块 suspend：全部变体返回并标记 isSuspended=true", async () => {
    const block = makeBlock({
      id: 11,
      type: "cloze",
      content: clozeContent([1, 2]),
      props: [C1_DUE, C2_DUE]
    })
    block.refs = [
      {
        id: 100,
        from: 11,
        to: 1000,
        type: 2,
        alias: "card",
        data: [
          { name: "type", value: "cloze", type: 1 },
          { name: "status", value: "suspend", type: 1 }
        ]
      }
    ]
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN, new Date(), {
      includeSuspended: true
    })
    expect(cards.map((c) => c.clozeNumber)).toEqual([1, 2])
    for (const card of cards) {
      expect(card.isSuspended).toBe(true)
    }
  })

  it("变体级暂停：暂停行返回并标记；同块 active 变体仍返回且不标记", async () => {
    const block = makeBlock({
      id: 12,
      type: "cloze",
      content: clozeContent([1, 2]),
      props: [C1_DUE, C2_DUE, { name: "srs.c1.suspended", value: true }]
    })
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN, new Date(), {
      includeSuspended: true
    })
    expect(cards).toHaveLength(2)
    const c1 = cards.find((c) => c.clozeNumber === 1)
    const c2 = cards.find((c) => c.clozeNumber === 2)
    expect(c1?.isSuspended).toBe(true)
    expect(c2?.isSuspended).toBeUndefined()
  })

  it("IO 行内宿主（_repr 非 IO）：include 时暂停的遮罩行标记，active 行不标记", async () => {
    const block = makeBlock({
      id: 13,
      type: "image-occlusion",
      props: [
        C1_DUE,
        C2_DUE,
        { name: "srs.c2.suspended", value: true },
        { name: "srs.io.masks", value: ioMasks }
      ],
      text: "行内图宿主文本"
    })
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN, new Date(), {
      includeSuspended: true
    })
    expect(cards.map((c) => c.clozeNumber).sort()).toEqual([1, 2])
    const c1 = cards.find((c) => c.clozeNumber === 1)
    const c2 = cards.find((c) => c.clozeNumber === 2)
    expect(c1?.isSuspended).toBeUndefined()
    expect(c2?.isSuspended).toBe(true)
  })

  it("Direction：include 时 forward 暂停行标记，backward 不标记", async () => {
    const block = makeBlock({
      id: 14,
      type: "direction",
      content: directionContent,
      props: [FWD_DUE, BWD_DUE, { name: "srs.forward.suspended", value: true }]
    })
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN, new Date(), {
      includeSuspended: true
    })
    expect(cards).toHaveLength(2)
    const fwd = cards.find((c) => c.directionType === "forward")
    const bwd = cards.find((c) => c.directionType === "backward")
    expect(fwd?.isSuspended).toBe(true)
    expect(bwd?.isSuspended).toBeUndefined()
  })

  it("Basic 整块 suspend：include 时返回并标记", async () => {
    const block = makeBlock({ id: 15, type: "basic", props: [{ name: "srs.due", value: "2026-01-01T00:00:00.000Z" }] })
    block.refs = [
      {
        id: 100,
        from: 15,
        to: 1000,
        type: 2,
        alias: "card",
        data: [
          { name: "type", value: "basic", type: 1 },
          { name: "status", value: "suspend", type: 1 }
        ]
      }
    ]
    preheatBlockCache([block])

    const cards = await convertBlockToReviewCards(block, PLUGIN, new Date(), {
      includeSuspended: true
    })
    expect(cards).toHaveLength(1)
    expect(cards[0].isSuspended).toBe(true)
  })
})
