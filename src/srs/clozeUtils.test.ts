// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./storage", () => ({
  writeInitialClozeSrsState: vi.fn(async () => undefined)
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
  notify: vi.fn()
}

import { createCloze } from "./clozeUtils"
import { writeInitialClozeSrsState } from "./storage"

describe("createCloze", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    block.content = [{ t: "t", v: "remember this" }]
  })

  it("converts an existing Extract card tag to cloze", async () => {
    const result = await createCloze({
      panelId: "p1",
      rootBlockId: 1,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 0 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 8 },
      isForward: true
    }, "orca-srs")

    expect(result).toEqual({ blockId: 1, clozeNumber: 1 })
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "type", value: "cloze" }]
    )
    expect(writeInitialClozeSrsState).toHaveBeenCalledWith(1, 1, 0)
  })
})
