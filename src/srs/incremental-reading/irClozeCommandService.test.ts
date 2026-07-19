import { describe, expect, it, vi } from "vitest"
import type { Block, CursorData } from "../../orca.d.ts"
import { createClozeFromEditorCommand } from "./irClozeCommandService"

const cursor: CursorData = {
  panelId: "p1",
  rootBlockId: 10,
  anchor: { blockId: 10, isInline: true, index: 0, offset: 0 },
  focus: { blockId: 10, isInline: true, index: 0, offset: 4 },
  isForward: true
}

function blockWithType(type: string): Block {
  return {
    id: 10,
    content: [{ t: "t", v: "test" }],
    text: "test",
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [],
    refs: [{
      id: 1,
      from: 10,
      to: 1,
      type: 2,
      alias: "card",
      data: [{ name: "type", type: 2, value: type }]
    }],
    backRefs: []
  }
}

describe("IR Cloze editor command routing", () => {
  it("routes Extract cards through the atomic conversion service", async () => {
    const convertExtract = vi.fn(async () => ({
      ok: true as const,
      itemId: 10,
      clozeNumber: 2,
      extractId: 10,
      source: {
        extractId: 10,
        topicId: 1,
        sourceBookId: null,
        sourceBookTitle: null,
        selectedText: "test"
      },
      completedExtract: false
    }))
    const createRegularCloze = vi.fn(async () => ({ blockId: 10, clozeNumber: 1 }))

    const result = await createClozeFromEditorCommand(cursor, "orca-srs", {
      getBlock: vi.fn(async () => blockWithType("extracts")),
      convertExtract,
      createRegularCloze
    })

    expect(result).toEqual({ blockId: 10, clozeNumber: 2 })
    expect(convertExtract).toHaveBeenCalledWith(expect.objectContaining({
      extractId: 10,
      strategy: "keep_extract"
    }))
    expect(createRegularCloze).not.toHaveBeenCalled()
  })

  it("keeps ordinary blocks on the regular Cloze path", async () => {
    const createRegularCloze = vi.fn(async () => ({ blockId: 10, clozeNumber: 1 }))
    const convertExtract = vi.fn()
    const result = await createClozeFromEditorCommand(cursor, "orca-srs", {
      getBlock: vi.fn(async () => blockWithType("basic")),
      convertExtract,
      createRegularCloze
    })
    expect(result).toEqual({ blockId: 10, clozeNumber: 1 })
    expect(convertExtract).not.toHaveBeenCalled()
  })
})
