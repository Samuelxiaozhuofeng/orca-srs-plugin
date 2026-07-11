import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"

const blockMap = new Map<DbId, Block>()
const irIndex = new Set<DbId>()

function makeBlock(id: DbId, text = ""): Block {
  return {
    id,
    content: [],
    text,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: [],
    refs: [],
    backRefs: []
  } as unknown as Block
}

function setProp(block: Block, name: string, value: unknown, type = 2): void {
  const props = block.properties ?? []
  const idx = props.findIndex((p) => p.name === name)
  const prop = { name, value, type } as any
  if (idx >= 0) props[idx] = prop
  else props.push(prop)
  block.properties = props
}

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, id: DbId) => {
    if (command === "get-block") return blockMap.get(id)
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertTag") {
        const blockId = args[1] as DbId
        const block = blockMap.get(blockId)!
        block.refs = [
          ...(block.refs ?? []),
          { type: 2, alias: "card", to: blockId } as any
        ]
        return true
      }
      if (command === "core.editor.setRefData") return true
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = blockMap.get(id)!
          for (const p of props) setProp(block, p.name, p.value, p.type)
        }
        return true
      }
      if (command === "core.editor.deleteProperties") {
        const ids = args[1] as DbId[]
        const names = args[2] as string[]
        for (const id of ids) {
          const block = blockMap.get(id)!
          block.properties = (block.properties ?? []).filter((p) => !names.includes(p.name))
        }
        return true
      }
      if (command === "core.editor.removeTag") {
        const blockId = args[1] as DbId
        const block = blockMap.get(blockId)!
        block.refs = (block.refs ?? []).filter((r) => !(r.type === 2))
        return true
      }
      return true
    })
  },
  notify: vi.fn(),
  state: { blocks: {} as Record<number, Block> }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

vi.mock("../cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async () => ({}))
}))

vi.mock("../incremental-reading/irIndex", () => ({
  upsertIRIndexId: vi.fn((_p: string, id: DbId) => {
    irIndex.add(id)
  }),
  removeIRIndexId: vi.fn((_p: string, id: DbId) => {
    irIndex.delete(id)
  })
}))

vi.mock("../storage", () => ({
  deleteCardSrsData: vi.fn(async () => undefined)
}))

import { initializeBookIR } from "./bookIRService"
import { advanceSequentialBook } from "./bookIRProgression"
import { removeBookFromIR, removeChaptersFromIR } from "./bookIRRemovalService"
import { parseBookIRPlan } from "./bookIRPlanRepository"
import { calculateChapterDueDates } from "../bookIRCreator"
import { IR_BOOK_PLAN_PROP } from "../../importers/epub/types"

beforeEach(() => {
  blockMap.clear()
  irIndex.clear()
  mockOrca.state.blocks = {}
  vi.clearAllMocks()
  // seed chapters + book
  for (const id of [100, 1, 2, 3]) {
    const b = makeBlock(id, `block-${id}`)
    blockMap.set(id, b)
    mockOrca.state.blocks[id] = b
  }
})

describe("calculateChapterDueDates", () => {
  it("keeps chapter 1 today and spreads remaining", () => {
    const dates = calculateChapterDueDates(3, 10)
    expect(dates).toHaveLength(3)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expect(dates[0].getTime()).toBeGreaterThanOrEqual(today.getTime())
    expect(dates[0].getTime()).toBeLessThan(today.getTime() + 24 * 60 * 60 * 1000)
    expect(dates[1].getTime()).toBeGreaterThan(dates[0].getTime())
    expect(dates[2].getTime()).toBeGreaterThan(dates[1].getTime())
  })
})

describe("initializeBookIR", () => {
  it("distributed initializes all selected chapters with ir.*", async () => {
    const result = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "distributed",
      priority: 50,
      totalDays: 10
    })
    expect(result.success).toEqual([1, 2, 3])
    expect(result.failed).toHaveLength(0)
    for (const id of [1, 2, 3]) {
      const block = blockMap.get(id)!
      expect(block.properties?.some((p) => p.name === "ir.due")).toBe(true)
      expect(block.refs?.some((r) => r.type === 2)).toBe(true)
    }
    const book = blockMap.get(100)!
    const planRaw = book.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value
    const plan = parseBookIRPlan(planRaw, 100)
    expect(plan.mode).toBe("distributed")
    expect(plan.selectedChapterIds).toEqual([1, 2, 3])
  })

  it("keeps priority-based intervalDays while spreading chapter due dates", async () => {
    const result = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "distributed",
      priority: 50,
      totalDays: 10
    })
    expect(result.success).toEqual([1, 2, 3])

    const dueDates: Date[] = []
    for (const id of [1, 2, 3]) {
      const block = blockMap.get(id)!
      const intervalProp = block.properties?.find((p) => p.name === "ir.intervalDays")
      expect(intervalProp?.value).toBe(8)

      const dueProp = block.properties?.find((p) => p.name === "ir.due")
      expect(dueProp?.value).toBeInstanceOf(Date)
      dueDates.push(dueProp!.value as Date)
    }

    expect(new Set(dueDates.map((d) => d.getTime())).size).toBe(3)
    expect(dueDates[1].getTime()).toBeGreaterThan(dueDates[0].getTime())
    expect(dueDates[2].getTime()).toBeGreaterThan(dueDates[1].getTime())
  })

  it("sequential only activates first chapter", async () => {
    const result = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "sequential",
      priority: 40,
      totalDays: 5
    })
    expect(result.success).toEqual([1])
    expect(blockMap.get(1)!.properties?.some((p) => p.name === "ir.due")).toBe(true)
    expect(blockMap.get(2)!.properties?.some((p) => p.name === "ir.due")).toBe(false)
    expect(blockMap.get(3)!.refs?.length ?? 0).toBe(0)
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBe(1)
    expect(plan.outcomes["1"]).toBe("active")
    expect(plan.outcomes["2"]).toBe("pending")
  })

  it("empty selection does not create plan", async () => {
    const result = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [],
      mode: "distributed",
      priority: 50,
      totalDays: 10
    })
    expect(result.plan).toBeNull()
    expect(blockMap.get(100)!.properties?.some((p) => p.name === IR_BOOK_PLAN_PROP)).toBeFalsy()
  })
})

describe("advanceSequentialBook", () => {
  async function setupSequential() {
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "sequential",
      priority: 50,
      totalDays: 5
    })
  }

  it("complete unlocks next and records completed", async () => {
    await setupSequential()
    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed"
    })
    expect(result.kind).toBe("advanced")
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["2"]).toBe("active")
    // chapter 1 no longer has card
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2)).toBeFalsy()
    // chapter 3 still locked
    expect(blockMap.get(3)!.properties?.some((p) => p.name === "ir.due")).toBe(false)
  })

  it("skip records skipped distinct from completed", async () => {
    await setupSequential()
    await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "skipped"
    })
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.outcomes["1"]).toBe("skipped")
    expect(plan.activeChapterId).toBe(2)
  })

  it("postpone does not call progression (manual check: active stays)", async () => {
    await setupSequential()
    const planBefore = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    // simulate postpone only changes due on active chapter
    setProp(blockMap.get(1)!, "ir.due", new Date("2030-01-01"), 5)
    const planAfter = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(planAfter.activeChapterId).toBe(planBefore.activeChapterId)
    expect(planAfter.outcomes["2"]).toBe("pending")
    expect(blockMap.get(2)!.properties?.some((p) => p.name === "ir.due")).toBe(false)
  })

  it("checkpoints outcome before next init; partial when next init fails", async () => {
    await setupSequential()
    // Make chapter 2 missing so next init fails
    blockMap.delete(2)
    delete mockOrca.state.blocks[2]

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed"
    })
    expect(result.kind).toBe("partial")
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBeNull()
    expect(plan.outcomes["2"]).toBe("pending")
    expect(plan.lastError).toBeTruthy()
  })
})

describe("retryFailedBookIRInit", () => {
  it("preserves successful outcomes and only retries pending", async () => {
    // Fail chapter 2 on first distributed init
    const orig = mockOrca.commands.invokeEditorCommand.getMockImplementation()
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertTag" && args[1] === 2) {
        throw new Error("init fail 2")
      }
      return orig!(command, ...args)
    })

    const first = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "distributed",
      priority: 50,
      totalDays: 10
    })
    expect(first.success).toContain(1)
    expect(first.success).toContain(3)
    expect(first.failed.some((f) => f.chapterId === 2)).toBe(true)
    expect(first.plan!.outcomes["1"]).toBe("active")
    expect(first.plan!.outcomes["2"]).toBe("pending")

    // Restore mock and retry
    mockOrca.commands.invokeEditorCommand.mockImplementation(orig!)

    const { retryFailedBookIRInit } = await import("./bookIRService")
    const retried = await retryFailedBookIRInit(100, "Book", first.plan!)
    expect(retried.success).toEqual([2])
    expect(retried.plan!.outcomes["1"]).toBe("active")
    expect(retried.plan!.outcomes["2"]).toBe("active")
    expect(retried.plan!.outcomes["3"]).toBe("active")
    expect(retried.plan!.selectedChapterIds).toEqual([1, 2, 3])
  })

  it("reloads the persisted plan instead of trusting a stale UI snapshot", async () => {
    const orig = mockOrca.commands.invokeEditorCommand.getMockImplementation()
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertTag" && args[1] === 2) {
        throw new Error("init fail 2")
      }
      return orig!(command, ...args)
    })
    const first = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2],
      mode: "distributed",
      priority: 50,
      totalDays: 10
    })
    const stalePlan = first.plan!
    const persisted = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    persisted.outcomes["2"] = "removed"
    setProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP, JSON.stringify(persisted), 2)
    mockOrca.commands.invokeEditorCommand.mockImplementation(orig!)

    const { retryFailedBookIRInit } = await import("./bookIRService")
    const retried = await retryFailedBookIRInit(100, "Book", stalePlan)
    expect(retried.success).toEqual([])
    expect(retried.plan!.outcomes["2"]).toBe("removed")
  })
})

describe("removal", () => {
  it("whole book removal clears plan and preserves epub props + content text", async () => {
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2],
      mode: "distributed",
      priority: 50,
      totalDays: 5
    })
    setProp(blockMap.get(1)!, "epub.chapterKey", "0:c1", 2)
    setProp(blockMap.get(2)!, "epub.chapterKey", "1:c2", 2)
    blockMap.get(1)!.text = "Chapter body 1"
    blockMap.get(2)!.text = "Chapter body 2"

    const result = await removeBookFromIR(100)
    expect(result.kind).toBe("removed")
    expect(result.success).toEqual([1, 2])
    expect(blockMap.get(100)!.properties?.some((p) => p.name === IR_BOOK_PLAN_PROP)).toBe(false)
    expect(blockMap.get(1)!.text).toBe("Chapter body 1")
    expect(blockMap.get(1)!.properties?.find((p) => p.name === "epub.chapterKey")?.value).toBe("0:c1")
    expect(blockMap.get(1)!.properties?.some((p) => p.name === "ir.due")).toBe(false)
  })

  it("chapter removal pauses sequential without silent advance", async () => {
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "sequential",
      priority: 50,
      totalDays: 5
    })
    const result = await removeChaptersFromIR(100, [1], {
      pauseSequenceIfActiveRemoved: true
    })
    expect(result.sequentialPaused).toBe(true)
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBeNull()
    expect(plan.outcomes["1"]).toBe("removed")
    // chapter 2 not auto-activated
    expect(blockMap.get(2)!.properties?.some((p) => p.name === "ir.due")).toBe(false)
  })

  it("partial removal keeps plan and reports failures", async () => {
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2],
      mode: "distributed",
      priority: 50,
      totalDays: 5
    })

    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.removeTag" && args[1] === 2) {
        throw new Error("remove failed")
      }
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = blockMap.get(id)!
          for (const p of props) setProp(block, p.name, p.value, p.type)
        }
        return true
      }
      if (command === "core.editor.deleteProperties") {
        const ids = args[1] as DbId[]
        const names = args[2] as string[]
        for (const id of ids) {
          const block = blockMap.get(id)!
          block.properties = (block.properties ?? []).filter((p) => !names.includes(p.name))
        }
        return true
      }
      if (command === "core.editor.insertTag") {
        const blockId = args[1] as DbId
        const block = blockMap.get(blockId)!
        block.refs = [...(block.refs ?? []), { type: 2, alias: "card", to: blockId } as any]
        return true
      }
      if (command === "core.editor.removeTag") {
        const blockId = args[1] as DbId
        const block = blockMap.get(blockId)!
        block.refs = (block.refs ?? []).filter((r) => r.type !== 2)
        return true
      }
      return true
    })

    // re-init after mock swap - blocks already have IR; just call remove
    // Ensure chapter 2 still has card so removeTag fails path triggers
    blockMap.get(2)!.refs = [{ type: 2, alias: "card", to: 2 } as any]
    setProp(blockMap.get(2)!, "ir.due", new Date(), 5)

    const result = await removeBookFromIR(100)
    expect(result.kind).toBe("partial")
    expect(result.failed.some((f) => f.chapterId === 2)).toBe(true)
    expect(
      blockMap.get(100)!.properties?.some((p) => p.name === IR_BOOK_PLAN_PROP)
    ).toBe(true)
  })
})

describe("plan validation", () => {
  it("rejects malformed plan", () => {
    expect(() => parseBookIRPlan("{bad")).toThrow()
    expect(() => parseBookIRPlan(JSON.stringify({ version: 9 }))).toThrow()
  })
})
