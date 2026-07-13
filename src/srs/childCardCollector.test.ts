/**
 * collectChildCards：自身反链不得把父卡当作子卡（循环误报回归）
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, BlockRef, DbId } from "../orca.d.ts"

const mockBlocks: Record<number, Block> = {}

const mockOrca = {
  state: {
    blocks: mockBlocks as Record<number, Block | undefined>
  },
  invokeBackend: vi.fn()
}

;(globalThis as typeof globalThis & { orca: typeof mockOrca }).orca = mockOrca

vi.mock("./blockCardCollector", () => ({
  hasCardTag: vi.fn((block: Block | undefined) => {
    if (!block?.refs || block.refs.length === 0) return false
    return block.refs.some(
      (ref) => ref.type === 2 && String(ref.alias || "").toLowerCase() === "card"
    )
  }),
  convertBlockToReviewCards: vi.fn(async (block: Block) => [
    {
      id: block.id,
      front: block.text || `front-${block.id}`,
      back: `back-${block.id}`,
      srs: {
        stability: 1,
        difficulty: 5,
        interval: 1,
        due: new Date("2020-01-01T00:00:00Z"),
        lastReviewed: null,
        reps: 0,
        lapses: 0
      },
      isNew: true,
      deck: "default",
      cardType: "basic" as const
    }
  ])
}))

import { convertBlockToReviewCards } from "./blockCardCollector"
import { collectChildCards } from "./childCardCollector"

function makeBackRef(
  from: number,
  to: number,
  id: number = from,
  type: number = 3
): BlockRef {
  return {
    id: id as DbId,
    from: from as DbId,
    to: to as DbId,
    type
  }
}

function makeCardBlock(
  id: number,
  options: {
    text?: string
    backRefs?: BlockRef[]
  } = {}
): Block {
  return {
    id: id as DbId,
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [],
    refs: [
      {
        id: 1 as DbId,
        from: id as DbId,
        to: 100 as DbId,
        type: 2,
        alias: "card"
      }
    ],
    backRefs: options.backRefs ?? [],
    text: options.text ?? `Card ${id}`
  } as Block
}

beforeEach(() => {
  Object.keys(mockBlocks).forEach((key) => {
    delete mockBlocks[Number(key)]
  })
  mockOrca.invokeBackend.mockReset()
  mockOrca.invokeBackend.mockImplementation(async (method: string, blockId: unknown) => {
    if (method === "get-block") {
      return mockBlocks[Number(blockId)] ?? null
    }
    throw new Error(`unexpected backend: ${method}`)
  })
  vi.mocked(convertBlockToReviewCards).mockClear()
})

describe("collectChildCards self-backref", () => {
  it("自身反链不会把父卡自身作为子卡返回", async () => {
    const parentId = 1872
    // 真实场景：BlockRef from=1872,to=1872,type=3
    const parent = makeCardBlock(parentId, {
      text: "Parent self-ref",
      backRefs: [makeBackRef(parentId, parentId, 99, 3)]
    })
    mockBlocks[parentId] = parent

    const children = await collectChildCards(parentId as DbId)

    expect(children).toEqual([])
    expect(convertBlockToReviewCards).not.toHaveBeenCalled()
  })

  it("同时存在自身反链和真实子卡反链时，真实子卡仍正常返回", async () => {
    const parentId = 1872
    const childId = 2001
    const parent = makeCardBlock(parentId, {
      text: "Parent",
      backRefs: [
        makeBackRef(parentId, parentId, 1, 3),
        makeBackRef(childId, parentId, 2, 3)
      ]
    })
    const child = makeCardBlock(childId, { text: "Real child" })
    mockBlocks[parentId] = parent
    mockBlocks[childId] = child

    const children = await collectChildCards(parentId as DbId)

    expect(children).toHaveLength(1)
    expect(children[0]!.id).toBe(childId)
    expect(convertBlockToReviewCards).toHaveBeenCalledTimes(1)
    expect(convertBlockToReviewCards).toHaveBeenCalledWith(
      expect.objectContaining({ id: childId }),
      expect.anything()
    )
  })
})
