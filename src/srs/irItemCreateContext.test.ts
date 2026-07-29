import { describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import {
  getIrItemCreateOptionsForBlock,
  isIrItemSourceBlock,
  resolveIrItemSourceForBlock
} from "./irItemCreateContext"

function makeBlock(
  id: DbId,
  opts: {
    parent?: DbId | null
    type?: string
    irDue?: boolean
  } = {}
): Block {
  const refs =
    opts.type != null
      ? [
          {
            id: id as number,
            from: id,
            to: id,
            type: 2 as const,
            alias: "card",
            data: [{ name: "type", value: opts.type, type: 1 }]
          }
        ]
      : []
  const properties = opts.irDue
    ? [{ name: "ir.due", value: new Date(), type: 5 }]
    : []
  return {
    id,
    text: `block ${id}`,
    content: [],
    parent: opts.parent ?? undefined,
    children: [],
    refs,
    properties,
    aliases: [],
    backRefs: [],
    created: new Date(),
    modified: new Date()
  } as Block
}

describe("resolveIrItemSourceForBlock", () => {
  it("returns self when block is topic", async () => {
    const topic = makeBlock(1, { type: "topic" })
    const blocks = new Map<DbId, Block>([[1, topic]])
    const r = await resolveIrItemSourceForBlock(1, topic, {
      getBlock: async id => blocks.get(id),
      loadPriority: async () => 80
    })
    expect(r).toEqual({
      sourceBlockId: 1,
      sourceKind: "topic",
      priority: 80,
      depth: 0
    })
    expect(isIrItemSourceBlock(topic)).toBe(true)
  })

  it("walks to topic ancestor for nested body blocks", async () => {
    // topic(10) → body(11) → body(12)  dig on 12
    const topic = makeBlock(10, { type: "topic" })
    const body1 = makeBlock(11, { parent: 10 })
    const body2 = makeBlock(12, { parent: 11 })
    const blocks = new Map<DbId, Block>([
      [10, topic],
      [11, body1],
      [12, body2]
    ])
    const r = await resolveIrItemSourceForBlock(12, body2, {
      getBlock: async id => blocks.get(id),
      loadPriority: async id => (id === 10 ? 42 : 0)
    })
    expect(r?.sourceBlockId).toBe(10)
    expect(r?.sourceKind).toBe("topic")
    expect(r?.priority).toBe(42)
    expect(r?.depth).toBe(2)
  })

  it("walks to extract ancestor", async () => {
    const extract = makeBlock(20, { type: "extracts" })
    const child = makeBlock(21, { parent: 20 })
    const blocks = new Map<DbId, Block>([
      [20, extract],
      [21, child]
    ])
    const r = await resolveIrItemSourceForBlock(21, child, {
      getBlock: async id => blocks.get(id),
      loadPriority: async () => 55
    })
    expect(r?.sourceBlockId).toBe(20)
    expect(r?.sourceKind).toBe("extracts")
  })

  it("returns undefined options when no IR ancestor", async () => {
    const plain = makeBlock(30)
    const blocks = new Map<DbId, Block>([[30, plain]])
    const opts = await getIrItemCreateOptionsForBlock(plain, 30, {
      getBlock: async id => blocks.get(id),
      loadPriority: async () => 50
    })
    expect(opts).toBeUndefined()
  })

  it("stops on cycle without hanging", async () => {
    const a = makeBlock(1, { parent: 2 })
    const b = makeBlock(2, { parent: 1 })
    const blocks = new Map<DbId, Block>([
      [1, a],
      [2, b]
    ])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const r = await resolveIrItemSourceForBlock(1, a, {
      getBlock: async id => blocks.get(id),
      loadPriority: async () => 1
    })
    expect(r).toBeNull()
    warn.mockRestore()
  })

  it("getIrItemCreateOptionsForBlock yields ir_item for grandchild of topic", async () => {
    const topic = makeBlock(1, { type: "topic" })
    const mid = makeBlock(2, { parent: 1 })
    const leaf = makeBlock(3, { parent: 2 })
    const blocks = new Map<DbId, Block>([
      [1, topic],
      [2, mid],
      [3, leaf]
    ])
    const opts = await getIrItemCreateOptionsForBlock(leaf, 3, {
      getBlock: async id => blocks.get(id),
      loadPriority: async () => 70
    })
    expect(opts).toEqual({
      initialDueOrigin: "ir_item",
      irPriority: 70
    })
  })
})
