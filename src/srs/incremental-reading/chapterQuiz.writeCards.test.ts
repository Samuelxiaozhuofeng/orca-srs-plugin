/**
 * Custom Panel 兼容：章末小测写卡不依赖 orca.commands.invokeGroup。
 * 直接调用导出写卡函数，模拟仅有 invokeEditorCommand 的宿主环境。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../storage", () => ({
  ensureCardSrsState: vi.fn(async () => undefined),
  writeInitialClozeSrsState: vi.fn(async () => undefined),
  invalidateBlockCache: vi.fn(() => undefined)
}))

vi.mock("../tagPropertyInit", () => ({
  ensureCardTagProperties: vi.fn(async () => undefined)
}))

vi.mock("../cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async (_plugin: string, _id: number, type: string) => [
    { name: "type", value: type }
  ])
}))

import {
  writeBasicCardFromQuizQuestion,
  writeClozeCardFromQuizQuestion,
  type ChapterQuizQuestion
} from "./chapterQuiz"
import {
  ensureCardSrsState,
  writeInitialClozeSrsState
} from "../storage"

const sampleQuestion: ChapterQuizQuestion = {
  id: "q0",
  text: "什么是渐进阅读？",
  options: ["一次性读完整书", "分次阅读并提炼", "只读标题", "跳过难段"],
  correctIndex: 1,
  explanation: "渐进阅读强调分次加工。"
}

describe("chapterQuiz write cards without invokeGroup (Custom Panel)", () => {
  const parentBlock = {
    id: 10,
    text: "父 Topic",
    content: [{ t: "t", v: "父 Topic" }],
    children: [] as number[],
    refs: [],
    properties: [],
    aliases: [],
    backRefs: [],
    created: new Date(),
    modified: new Date()
  }

  type HarnessBlock = {
    id: number
    text: string
    content: Array<{ t: string; v: string; [k: string]: unknown }>
    children: number[]
    refs: unknown[]
    properties: unknown[]
    aliases: unknown[]
    backRefs: unknown[]
    created: Date
    modified: Date
  }

  let nextId = 100
  const deletedBatches: number[][] = []
  const invokeEditorCommand = vi.fn()

  function installHarness(opts?: { failOn?: "insertTag" }) {
    nextId = 100
    deletedBatches.length = 0
    parentBlock.children = []
    const blocks: Record<number, HarnessBlock> = {
      10: parentBlock as HarnessBlock
    }

    invokeEditorCommand.mockImplementation(
      async (command: string, _cursor: unknown, ...args: unknown[]) => {
        if (command === "core.editor.insertBlock") {
          const id = nextId++
          const parent = args[0] as { id?: number; children?: number[] }
          const content = (args[2] as HarnessBlock["content"] | undefined) ?? []
          const text =
            Array.isArray(content) && content[0]?.t === "t"
              ? String(content[0].v)
              : "card"
          const block: HarnessBlock = {
            id,
            text,
            content,
            children: [],
            refs: [],
            properties: [],
            aliases: [],
            backRefs: [],
            created: new Date(),
            modified: new Date()
          }
          blocks[id] = block
          if (parent && typeof parent.id === "number") {
            const p = blocks[parent.id]
            if (p) p.children = [...(p.children ?? []), id]
          }
          return id
        }
        if (command === "core.editor.insertTag") {
          if (opts?.failOn === "insertTag") {
            throw new Error("simulated insertTag failure")
          }
          return true
        }
        if (command === "core.editor.deleteBlocks") {
          const ids = args[0] as number[]
          deletedBatches.push([...ids])
          for (const id of ids) {
            delete blocks[id]
            parentBlock.children = parentBlock.children.filter((c) => c !== id)
          }
          return true
        }
        return true
      }
    )

    ;(globalThis as unknown as { orca: unknown }).orca = {
      state: { blocks, plugins: {} },
      // 故意不提供 invokeGroup：模拟 Custom Panel 无编辑器事务组
      commands: {
        invokeEditorCommand
      },
      invokeBackend: vi.fn(async (cmd: string, id: number) => {
        if (cmd === "get-block") {
          return blocks[id] ?? null
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

  afterEach(() => {
    delete (globalThis as { orca?: unknown }).orca
  })

  it("writeBasicCardFromQuizQuestion succeeds without invokeGroup", async () => {
    const id = await writeBasicCardFromQuizQuestion({
      pluginName: "orca-srs",
      parentBlockId: 10,
      question: sampleQuestion
    })

    expect(id).toBe(100)
    expect(parentBlock.children).toContain(100)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertBlock",
      null,
      expect.objectContaining({ id: 10 }),
      "lastChild",
      [{ t: "t", v: "什么是渐进阅读？" }]
    )
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      100,
      "card",
      expect.any(Array)
    )
    expect(ensureCardSrsState).toHaveBeenCalledWith(100)
    expect(deletedBatches).toHaveLength(0)
  })

  it("writeClozeCardFromQuizQuestion succeeds without invokeGroup", async () => {
    const id = await writeClozeCardFromQuizQuestion({
      pluginName: "orca-srs",
      parentBlockId: 10,
      text: "渐进阅读强调分次加工。",
      clozeText: "分次加工"
    })

    expect(id).toBe(100)
    expect(parentBlock.children).toContain(100)
    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      100,
      "card",
      expect.any(Array)
    )
    expect(writeInitialClozeSrsState).toHaveBeenCalledWith(100, 1, 0)
    expect(deletedBatches).toHaveLength(0)
  })

  it("mid-write failure deletes top-level block and rethrows original error", async () => {
    installHarness({ failOn: "insertTag" })

    await expect(
      writeBasicCardFromQuizQuestion({
        pluginName: "orca-srs",
        parentBlockId: 10,
        question: sampleQuestion
      })
    ).rejects.toThrow("simulated insertTag failure")

    expect(deletedBatches).toEqual([[100]])
    expect(parentBlock.children).not.toContain(100)
    expect(ensureCardSrsState).not.toHaveBeenCalled()
  })
})
