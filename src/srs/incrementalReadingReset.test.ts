import { describe, expect, it } from "vitest"

import type { Block, BlockProperty, BlockRef, DbId } from "../orca.d.ts"
import { selectIncrementalReadingCardIdsFromBlocks } from "./incrementalReadingReset"

function createCardRef(blockId: DbId, typeValue: string): BlockRef {
  const data: BlockProperty[] = [{ name: "type", value: typeValue, type: 2 }]
  return {
    id: blockId * 100,
    from: blockId,
    to: 1,
    type: 2,
    alias: "card",
    data
  }
}

function createBlock(id: DbId, typeValue: string): Block {
  return {
    id,
    content: [],
    text: `${typeValue}-${id}`,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [],
    refs: [createCardRef(id, typeValue)],
    backRefs: []
  }
}

describe("incrementalReadingReset", () => {
  it("selects only topic/extracts and orders topic first", () => {
    const blocks: Block[] = [
      createBlock(1, "extracts"),
      createBlock(2, "topic"),
      createBlock(3, "basic")
    ]

    expect(selectIncrementalReadingCardIdsFromBlocks(blocks)).toEqual([2, 1])
  })

  it("dedupes ids while keeping stable order", () => {
    const blocks: Block[] = [
      createBlock(10, "topic"),
      createBlock(11, "extracts"),
      createBlock(10, "topic"),
      createBlock(11, "extracts")
    ]

    expect(selectIncrementalReadingCardIdsFromBlocks(blocks)).toEqual([10, 11])
  })
})

