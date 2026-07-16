import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../storage", () => ({
  ensureCardSrsState: vi.fn(async () => undefined),
  writeInitialClozeSrsState: vi.fn(async () => undefined)
}))

vi.mock("../tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => undefined)
}))

vi.mock("../cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async () => [{ name: "type", value: "basic" }])
}))

import {
  buildClozeContentFragments,
  collectRollbackCandidates,
  verifyDeletedBlocks,
  writeAICardDrafts
} from "./aiCardWriter"
import { ensureCardSrsState, writeInitialClozeSrsState } from "../storage"

describe("buildClozeContentFragments", () => {
  it("splits text around cloze without inventing content", () => {
    const fragments = buildClozeContentFragments(
      "使役形（～させる）表示让某人做某事",
      "～させる",
      "orca-srs",
      1
    )
    expect(fragments).toEqual([
      { t: "t", v: "使役形（" },
      { t: "orca-srs.cloze", v: "～させる", clozeNumber: 1 },
      { t: "t", v: "）表示让某人做某事" }
    ])
  })
})

describe("collectRollbackCandidates", () => {
  it("unions tracked ids with newly appeared children", () => {
    expect(
      collectRollbackCandidates([101], [1, 2], [1, 2, 101, 202])
    ).toEqual([101, 202])
  })
})

describe("writeAICardDrafts rollback", () => {
  const sourceBlock = {
    id: 10,
    text: "使役形（～させる）表示让某人做某事。",
    content: [{ t: "t", v: "使役形（～させる）表示让某人做某事。" }],
    children: [] as number[],
    refs: [],
    properties: [],
    aliases: [],
    backRefs: [],
    created: new Date(),
    modified: new Date()
  }

  let nextId = 100
  const deletedBatches: number[][] = []
  const invokeGroupOptions: Array<{ undoable?: boolean; topGroup?: boolean } | undefined> =
    []

  const invokeEditorCommand = vi.fn()
  const invokeGroup = vi.fn(
    async (
      fn: () => Promise<void>,
      options?: { undoable?: boolean; topGroup?: boolean }
    ) => {
      invokeGroupOptions.push(options)
      await fn()
    }
  )

  function installHarness() {
    nextId = 100
    deletedBatches.length = 0
    invokeGroupOptions.length = 0
    sourceBlock.children = []
    ;(globalThis as any).orca = {
      state: {
        blocks: { 10: sourceBlock },
        plugins: {}
      },
      commands: {
        invokeEditorCommand,
        invokeGroup
      },
      invokeBackend: vi.fn(async (cmd: string, id: number) => {
        if (cmd === "get-block") {
          return (globalThis as any).orca.state.blocks[id] ?? null
        }
        return null
      }),
      notify: vi.fn()
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    installHarness()
  })

  it("rolls back earlier completed card and commit-then-reject child", async () => {
    let topLevelInserts = 0

    invokeEditorCommand.mockImplementation(
      async (command: string, _cursor: unknown, ...args: any[]) => {
        if (command === "core.editor.insertBlock") {
          const id = nextId++
          const parent = args[0]
          const position = args[1]
          const content = args[2]
          const block = {
            id,
            text:
              Array.isArray(content) && content[0]?.t === "t"
                ? String(content[0].v)
                : "card",
            content: content ?? [],
            children: [] as number[],
            refs: [],
            properties: [],
            aliases: [],
            backRefs: [],
            created: new Date(),
            modified: new Date()
          }
          ;(globalThis as any).orca.state.blocks[id] = block

          if (parent?.id === 10 && position === "lastChild") {
            sourceBlock.children.push(id)
            topLevelInserts++
            if (topLevelInserts === 2) {
              // Commit-then-reject: child is already on source, but command rejects
              throw new Error("simulated commit-then-reject")
            }
          }
          return id
        }
        if (command === "core.editor.deleteBlocks") {
          deletedBatches.push([...(args[0] as number[])])
          for (const id of args[0] as number[]) {
            delete (globalThis as any).orca.state.blocks[id]
            sourceBlock.children = sourceBlock.children.filter(c => c !== id)
          }
          return true
        }
        return true
      }
    )

    const result = await writeAICardDrafts({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      drafts: [
        {
          id: "draft_1",
          type: "basic",
          question: "Q1 使役形",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        },
        {
          id: "draft_2",
          type: "basic",
          question: "Q2 使役形",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("WRITE_FAILED")
    expect(result.error.message).toMatch(/回滚/)

    // Cleanup group should be non-undoable
    const cleanupOpts = invokeGroupOptions.find(o => o && o.undoable === false)
    expect(cleanupOpts).toEqual({ undoable: false, topGroup: true })

    // Both completed first card and commit-then-reject second child deleted
    expect(deletedBatches.length).toBeGreaterThan(0)
    const allDeleted = deletedBatches.flat()
    expect(allDeleted).toContain(100) // first top-level (question) id
    expect(allDeleted.some(id => id >= 101)).toBe(true)
    expect(result.orphanBlockIds).toBeUndefined()
    expect(ensureCardSrsState).toHaveBeenCalled()
  })

  it("reports orphanBlockIds when delete leaves blocks", async () => {
    invokeEditorCommand.mockImplementation(
      async (command: string, _cursor: unknown, ...args: any[]) => {
        if (command === "core.editor.insertBlock") {
          const id = nextId++
          const parent = args[0]
          const position = args[1]
          const block = {
            id,
            text: "q",
            content: args[2] ?? [],
            children: [] as number[],
            refs: [],
            properties: [],
            aliases: [],
            backRefs: [],
            created: new Date(),
            modified: new Date()
          }
          ;(globalThis as any).orca.state.blocks[id] = block
          if (parent?.id === 10 && position === "lastChild") {
            sourceBlock.children.push(id)
            if (sourceBlock.children.length === 1) {
              // Fail after first top-level
              throw new Error("fail after first")
            }
          }
          return id
        }
        if (command === "core.editor.deleteBlocks") {
          // Pretend delete does nothing
          deletedBatches.push([...(args[0] as number[])])
          return true
        }
        return true
      }
    )

    const result = await writeAICardDrafts({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      drafts: [
        {
          id: "draft_1",
          type: "basic",
          question: "Q1",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.orphanBlockIds?.length).toBeGreaterThan(0)
    expect(result.error.message).toMatch(/回滚/)
  })

  it("writes cloze with prebuilt fragments and no setBlockContent", async () => {
    invokeEditorCommand.mockImplementation(
      async (command: string, _cursor: unknown, ...args: any[]) => {
        if (command === "core.editor.insertBlock") {
          const id = nextId++
          const block = {
            id,
            text: "t",
            content: args[2] ?? [],
            children: [] as number[],
            refs: [],
            properties: [],
            aliases: [],
            backRefs: [],
            created: new Date(),
            modified: new Date()
          }
          ;(globalThis as any).orca.state.blocks[id] = block
          if (args[0]?.id === 10) sourceBlock.children.push(id)
          return id
        }
        return true
      }
    )

    const result = await writeAICardDrafts({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      drafts: [
        {
          id: "draft_1",
          type: "cloze",
          text: "使役形（～させる）表示让某人做某事。",
          clozeText: "～させる",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    expect(result.success).toBe(true)
    expect(writeInitialClozeSrsState).toHaveBeenCalled()
    const insertCalls = invokeEditorCommand.mock.calls.filter(
      c => c[0] === "core.editor.insertBlock"
    )
    expect(insertCalls.length).toBe(1)
    const content = insertCalls[0][4]
    expect(content.some((f: any) => f.t === "orca-srs.cloze")).toBe(true)
  })

  it("treats successful get-block null as missing (no state fallback for orphans)", async () => {
    ;(globalThis as any).orca.invokeBackend = vi.fn(async () => null)
    // state still has block 10 — but backend says null
    const result = await writeAICardDrafts({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      drafts: [
        {
          id: "draft_1",
          type: "basic",
          question: "Q",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("SOURCE_MISSING")
  })

  it("stops before inserting when the source disappears inside the write group", async () => {
    let sourceReads = 0
    ;(globalThis as any).orca.invokeBackend = vi.fn(
      async (command: string, id: number) => {
        if (command !== "get-block") return null
        if (id !== sourceBlock.id) {
          return (globalThis as any).orca.state.blocks[id] ?? null
        }
        sourceReads++
        return sourceReads === 1 ? sourceBlock : null
      }
    )

    const result = await writeAICardDrafts({
      pluginName: "orca-srs",
      sourceBlockId: sourceBlock.id,
      drafts: [
        {
          id: "draft_1",
          type: "basic",
          question: "Q",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("WRITE_FAILED")
    expect(result.error.message).toMatch(/源块已不存在/)
    expect(
      invokeEditorCommand.mock.calls.some(
        call => call[0] === "core.editor.insertBlock"
      )
    ).toBe(false)
  })
})

describe("verifyDeletedBlocks", () => {
  beforeEach(() => {
    ;(globalThis as any).orca = {
      invokeBackend: vi.fn()
    }
  })

  it("returns remaining ids that still exist", async () => {
    ;(globalThis as any).orca.invokeBackend.mockImplementation(
      async (_cmd: string, id: number) => (id === 1 ? { id: 1 } : null)
    )
    const { remaining, verificationFailed } = await verifyDeletedBlocks([1, 2])
    expect(verificationFailed).toBe(false)
    expect(remaining).toEqual([1])
  })

  it("conservatively reports all when every check throws", async () => {
    ;(globalThis as any).orca.invokeBackend.mockRejectedValue(new Error("down"))
    const { remaining, verificationFailed } = await verifyDeletedBlocks([3, 4])
    expect(verificationFailed).toBe(true)
    expect(remaining).toEqual([3, 4])
  })
})
