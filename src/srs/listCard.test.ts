// @ts-nocheck
/**
 * 列表卡测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"

const mockBlocks: Record<DbId, Block> = {}

const mockOrca = {
  state: {
    blocks: mockBlocks,
  },
  invokeBackend: vi.fn(),
  commands: {
    invokeEditorCommand: vi.fn(),
  },
  notify: vi.fn(),
  broadcasts: { broadcast: vi.fn() },
}

// @ts-ignore
globalThis.orca = mockOrca

import { collectReviewCards } from "./cardCollector"
import { getCardKey } from "./childCardCollector"
import { ensureCardSrsStateWithInitialDue, loadCardSrsState } from "./storage"

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

describe("list cards", () => {
  beforeEach(() => {
    Object.keys(mockBlocks).forEach((k) => delete mockBlocks[k as any])
    vi.clearAllMocks()

    mockOrca.invokeBackend.mockImplementation(async (name: string, args: any[]) => {
      if (name === "get-blocks-with-tags") {
        const tag = args?.[0]
        if (tag?.toLowerCase?.() === "card") {
          return [mockBlocks[100 as DbId]]
        }
        return []
      }
      if (name === "get-block") {
        const id = args as unknown as DbId
        return mockBlocks[id]
      }
      return null
    })

    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _cursor: any, blockIds: any, propsOrOther: any) => {
        if (command !== "core.editor.setProperties") return null
        const ids = blockIds as DbId[]
        const props = propsOrOther as any[]
        for (const id of ids) {
          const block = mockBlocks[id]
          if (!block) continue
          block.properties = block.properties ?? []
          for (const p of props) {
            const idx = block.properties.findIndex((x: any) => x.name === p.name)
            if (idx >= 0) block.properties[idx] = { ...block.properties[idx], ...p }
            else block.properties.push({ ...p })
          }
        }
        return null
      }
    )
  })

  it("collectReviewCards should return first due list item as a ReviewCard", async () => {
    const now = Date.now()
    const dueNow = new Date(now - 1000)
    const dueTomorrow = new Date(now + 24 * 60 * 60 * 1000)

    const parentId = 100 as DbId
    const item1 = 201 as DbId
    const item2 = 202 as DbId
    const item3 = 203 as DbId

    mockBlocks[parentId] = makeBlock({
      id: parentId,
      text: "列表卡",
      children: [item1, item2, item3],
      refs: [
        {
          type: 2,
          alias: "card",
          data: [{ name: "type", value: "list" }],
        },
      ],
    })

    mockBlocks[item1] = makeBlock({
      id: item1,
      text: "1",
      properties: [{ name: "srs.due", type: 5, value: dueNow }],
      parent: parentId,
    })
    mockBlocks[item2] = makeBlock({
      id: item2,
      text: "2",
      properties: [{ name: "srs.due", type: 5, value: dueTomorrow }],
      parent: parentId,
    })
    mockBlocks[item3] = makeBlock({
      id: item3,
      text: "3",
      properties: [{ name: "srs.due", type: 5, value: dueTomorrow }],
      parent: parentId,
    })

    const cards = await collectReviewCards("orca-srs")
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe(parentId)
    expect(cards[0].listItemId).toBe(item1)
    expect(cards[0].listItemIndex).toBe(1)
    expect(cards[0].listItemIds).toEqual([item1, item2, item3])
  })

  it("getCardKey should distinguish list items by listItemId", () => {
    const parentId = 100 as DbId
    const a = getCardKey({ id: parentId, listItemId: 201 as DbId } as any)
    const b = getCardKey({ id: parentId, listItemId: 202 as DbId } as any)
    expect(a).not.toBe(b)
  })

  it("ensureCardSrsStateWithInitialDue should initialize due when missing", async () => {
    const itemId = 300 as DbId
    mockBlocks[itemId] = makeBlock({ id: itemId, properties: [] })

    const due = new Date(2025, 0, 1, 0, 0, 0, 0)
    await ensureCardSrsStateWithInitialDue(itemId, due)
    const srs = await loadCardSrsState(itemId)
    expect(srs.due.getTime()).toBe(due.getTime())
  })
})
