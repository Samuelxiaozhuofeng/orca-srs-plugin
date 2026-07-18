import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
        const alias = args[2] as string
        const block = blockMap.get(blockId)!
        // Match Orca semantics: remove only the named tag alias, not all type-2 refs
        block.refs = (block.refs ?? []).filter(
          (r) => !(r.type === 2 && r.alias === alias)
        )
        return true
      }
      return true
    })
  },
  notify: vi.fn(),
  state: { blocks: {} as Record<number, Block>, repo: "test-repo" }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

vi.mock("../cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async () => [{ name: "type", value: "topic" }])
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
  deleteCardSrsData: vi.fn(async () => undefined),
  invalidateBlockCache: vi.fn()
}))

import { initializeBookIR, retryFailedBookIRInit } from "./bookIRService"
import {
  advanceSequentialBook,
  isChapterFullyActive,
  resolveNextChapterDue
} from "./bookIRProgression"
import { removeBookFromIR, removeChaptersFromIR } from "./bookIRRemovalService"
import { parseBookIRPlan, toPlainJsonValue } from "./bookIRPlanRepository"
import { calculateChapterDueDates } from "../bookIRCreator"
import { IR_BOOK_PLAN_PROP } from "../../importers/epub/types"

const memoryStorage = new Map<string, string>()

beforeEach(() => {
  blockMap.clear()
  irIndex.clear()
  memoryStorage.clear()
  mockOrca.state.blocks = {}
  mockOrca.state.repo = "test-repo"
  vi.clearAllMocks()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value)
    },
    removeItem: (key: string) => {
      memoryStorage.delete(key)
    }
  })
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
    const stored = book.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)
    expect(stored?.type).toBe(0)
    expect(typeof stored?.value).toBe("object")
    const plan = parseBookIRPlan(stored?.value, 100)
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
    const stored = blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)
    expect(stored?.type).toBe(0)
    expect(typeof stored?.value).toBe("object")
    const plan = parseBookIRPlan(stored?.value, 100)
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["2"]).toBe("active")
    // chapter 1 no longer has card
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2)).toBeFalsy()
    // chapter 2 is the live IR topic
    expect(blockMap.get(2)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(blockMap.get(2)!.properties?.find((p) => p.name === "ir.sourceBookId")?.value).toBe(100)
    expect(blockMap.get(2)!.properties?.some((p) => p.name === "ir.due")).toBe(true)
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

  it("throws before mutating plan/current when next init fails (activate-before-strip)", async () => {
    await setupSequential()
    // Give chapter 3 an unrelated non-IR tag so we can prove it is never stripped
    blockMap.get(3)!.refs = [{ type: 2, alias: "bookmark", to: 3 } as any]
    setProp(blockMap.get(3)!, "note.custom", "keep-me", 1)

    // Make chapter 2 missing so next init fails
    blockMap.delete(2)
    delete mockOrca.state.blocks[2]

    await expect(
      advanceSequentialBook({
        bookBlockId: 100,
        chapterId: 1,
        outcome: "completed"
      })
    ).rejects.toThrow(/激活下一章/)

    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    // Plan and current chapter untouched
    expect(plan.outcomes["1"]).toBe("active")
    expect(plan.activeChapterId).toBe(1)
    expect(plan.outcomes["2"]).toBe("pending")
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    // Unrelated data on chapter 3 preserved; no whole-book cleanup
    expect(blockMap.get(3)!.refs?.some((r) => r.alias === "bookmark")).toBe(true)
    expect(blockMap.get(3)!.properties?.find((p) => p.name === "note.custom")?.value).toBe("keep-me")
    expect(blockMap.get(100)!.properties?.some((p) => p.name === IR_BOOK_PLAN_PROP)).toBe(true)
  })

  it("complete chapter only strips current chapter; never batch-targets selectedChapterIds", async () => {
    await setupSequential()
    // Unrelated non-IR data on pending chapter 3 must survive
    blockMap.get(3)!.refs = [
      ...(blockMap.get(3)!.refs ?? []),
      { type: 2, alias: "bookmark", to: 3 } as any
    ]
    setProp(blockMap.get(3)!, "note.custom", "preserve", 1)

    const stripTargets: { removeTag: DbId[]; deleteProps: DbId[] } = {
      removeTag: [],
      deleteProps: []
    }
    const orig = mockOrca.commands.invokeEditorCommand.getMockImplementation()
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.removeTag") {
        stripTargets.removeTag.push(args[1] as DbId)
      }
      if (command === "core.editor.deleteProperties") {
        const ids = args[1] as DbId[]
        stripTargets.deleteProps.push(...ids)
      }
      return orig!(command, ...args)
    })

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "today"
    })
    expect(result.kind).toBe("advanced")

    // Strip commands target only chapter 1 (plan writes hit book 100 via setProperties, not strip)
    expect(stripTargets.removeTag).toEqual([1])
    // deleteProperties may include chapter 1 (ir.*/srs.*) and never 2 or 3 for strip.
    // Book plan uses setProperties, not deleteProperties, on happy path.
    expect(stripTargets.deleteProps.every((id) => id === 1)).toBe(true)
    expect(stripTargets.deleteProps).not.toContain(2)
    expect(stripTargets.deleteProps).not.toContain(3)

    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.outcomes["2"]).toBe("active")
    expect(plan.outcomes["3"]).toBe("pending")

    // Next is sole live IR topic
    const ch2 = blockMap.get(2)!
    expect(ch2.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(ch2.properties?.find((p) => p.name === "ir.sourceBookId")?.value).toBe(100)
    expect(ch2.properties?.find((p) => p.name === "ir.due")?.value).toBeInstanceOf(Date)

    // Pending chapter 3: no IR scheduling; unrelated data intact
    const ch3 = blockMap.get(3)!
    expect(ch3.properties?.some((p) => p.name === "ir.due")).toBe(false)
    expect(ch3.refs?.some((r) => r.type === 2 && r.alias === "card")).toBeFalsy()
    expect(ch3.refs?.some((r) => r.alias === "bookmark")).toBe(true)
    expect(ch3.properties?.find((p) => p.name === "note.custom")?.value).toBe("preserve")

    // Current stripped
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBeFalsy()
  })

  it("restores sourceBookTitle from the book block when the current chapter title is null", async () => {
    await setupSequential()
    setProp(blockMap.get(1)!, "ir.sourceBookTitle", null, 2)
    blockMap.get(100)!.aliases = ["真实书名"]

    await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "today"
    })

    expect(
      blockMap.get(2)!.properties?.find((p) => p.name === "ir.sourceBookTitle")?.value
    ).toBe("真实书名")
  })

  it("repairs the next #card when removing the current tag makes it disappear", async () => {
    await setupSequential()
    const original = mockOrca.commands.invokeEditorCommand.getMockImplementation()!
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, ...args: any[]) => {
        const result = await original(command, ...args)
        if (command === "core.editor.removeTag" && args[1] === 1) {
          const next = blockMap.get(2)!
          next.refs = (next.refs ?? []).filter(
            ref => !(ref.type === 2 && ref.alias === "card")
          )
        }
        return result
      }
    )

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "tomorrow"
    })

    expect(result.kind).toBe("advanced")
    expect(blockMap.get(2)!.refs?.some(
      ref => ref.type === 2 && ref.alias === "card"
    )).toBe(true)
    const nextInsertCalls = mockOrca.commands.invokeEditorCommand.mock.calls.filter(
      ([command, , blockId]) => command === "core.editor.insertTag" && blockId === 2
    )
    expect(nextInsertCalls).toHaveLength(2)
  })

  it("nextChapterSchedule=today sets next due to local midnight today and plan active", async () => {
    await setupSequential()
    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "today"
    })
    expect(result.kind).toBe("advanced")
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["2"]).toBe("active")

    const due = blockMap.get(2)!.properties?.find((p) => p.name === "ir.due")?.value as Date
    expect(due).toBeInstanceOf(Date)
    const expected = resolveNextChapterDue("today")
    expect(due.getTime()).toBe(expected.getTime())
    // Today due is at start of today → still "due" for today's queue collectors
    const now = new Date()
    expect(due.getTime()).toBeLessThanOrEqual(now.getTime())
  })

  it("nextChapterSchedule=tomorrow keeps plan active but due is tomorrow (not due today)", async () => {
    await setupSequential()
    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "tomorrow"
    })
    expect(result.kind).toBe("advanced")
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    // plan state identical shape to today: completed current, active next
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["2"]).toBe("active")

    const due = blockMap.get(2)!.properties?.find((p) => p.name === "ir.due")?.value as Date
    expect(due).toBeInstanceOf(Date)
    const expected = resolveNextChapterDue("tomorrow")
    expect(due.getTime()).toBe(expected.getTime())
    // Not due "today" at local day granularity
    const todayStart = resolveNextChapterDue("today")
    expect(due.getTime()).toBeGreaterThan(todayStart.getTime())
  })

  it("complete with no next chapter still finishes without requiring schedule", async () => {
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1],
      mode: "sequential",
      priority: 50,
      totalDays: 5
    })
    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "tomorrow"
    })
    expect(result.kind).toBe("advanced")
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBeNull()
    expect(result.message).toMatch(/全部完成/)
  })

  it("setProperties payloads for plan and chapter init are structuredClone-safe", async () => {
    await setupSequential()
    const payloads: unknown[] = []
    const orig = mockOrca.commands.invokeEditorCommand.getMockImplementation()
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.setProperties") {
        payloads.push(args[2])
        // Mirror real Orca IPC: non-cloneable args throw DataCloneError-like message
        structuredClone(args[1])
        structuredClone(args[2])
      }
      if (command === "core.editor.insertTag") {
        structuredClone(args[1])
        structuredClone(args[2])
        structuredClone(args[3])
        structuredClone(args[4])
      }
      if (command === "core.editor.setRefData") {
        structuredClone(args[1])
        structuredClone(args[2])
      }
      return orig!(command, ...args)
    })

    await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "tomorrow"
    })

    expect(payloads.length).toBeGreaterThan(0)
    for (const payload of payloads) {
      expect(() => structuredClone(payload)).not.toThrow()
    }
  })

  it("resolveNextChapterDue is deterministic for today vs tomorrow", () => {
    const now = new Date(2026, 6, 18, 15, 30, 0)
    const today = resolveNextChapterDue("today", now)
    const tomorrow = resolveNextChapterDue("tomorrow", now)
    expect(today.getFullYear()).toBe(2026)
    expect(today.getMonth()).toBe(6)
    expect(today.getDate()).toBe(18)
    expect(today.getHours()).toBe(0)
    expect(tomorrow.getDate()).toBe(19)
    expect(tomorrow.getTime() - today.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe("toPlainJsonValue / proxy safety", () => {
  it("materializes proxy-backed plan fields so structuredClone succeeds", () => {
    const raw = {
      version: 1,
      bookBlockId: 100,
      mode: "sequential",
      priority: 50,
      totalDays: 5,
      selectedChapterIds: new Proxy([1, 2, 3], {}),
      activeChapterId: 1,
      outcomes: new Proxy({ "1": "active", "2": "pending", "3": "pending" }, {}),
      lastError: null
    }
    // Proxy objects themselves cannot be structured-cloned
    expect(() => structuredClone(raw)).toThrow(/could not be cloned/i)

    const plain = parseBookIRPlan(raw, 100)
    expect(() => structuredClone(plain)).not.toThrow()
    expect(() => structuredClone(toPlainJsonValue(plain))).not.toThrow()
    expect(Array.isArray(plain.selectedChapterIds)).toBe(true)
    expect(plain.selectedChapterIds).toEqual([1, 2, 3])
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
    setProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP, persisted, 0)
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

  it("dedupes selectedChapterIds on parse (first wins)", () => {
    const plan = parseBookIRPlan(
      {
        version: 1,
        bookBlockId: 100,
        mode: "sequential",
        priority: 50,
        totalDays: 5,
        selectedChapterIds: [1, 2, 1, 3, 2],
        activeChapterId: 1,
        outcomes: { "1": "active", "2": "pending", "3": "pending" },
        lastError: null
      },
      100
    )
    expect(plan.selectedChapterIds).toEqual([1, 2, 3])
  })
})

describe("initializeBookIR chapter id dedupe", () => {
  it("dedupes duplicate chapterIds so progression order stays unique", async () => {
    const result = await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 1, 3, 2],
      mode: "sequential",
      priority: 50,
      totalDays: 5
    })
    expect(result.plan!.selectedChapterIds).toEqual([1, 2, 3])
    expect(result.success).toEqual([1])
    // Only first chapter activated once
    expect(blockMap.get(1)!.properties?.filter((p) => p.name === "ir.due")).toHaveLength(1)
  })
})

describe("advanceSequentialBook plan-save / retry recovery", () => {
  const defaultEditorImpl = mockOrca.commands.invokeEditorCommand.getMockImplementation()!

  afterEach(() => {
    mockOrca.commands.invokeEditorCommand.mockImplementation(defaultEditorImpl)
  })

  async function setupSequential() {
    mockOrca.commands.invokeEditorCommand.mockImplementation(defaultEditorImpl)
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "sequential",
      priority: 50,
      totalDays: 5
    })
  }

  it("plan-save failure after next init returns partial, keeps current, dual-live until retry", async () => {
    await setupSequential()
    let planWriteCount = 0
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.setProperties") {
        const props = args[2] as Array<{ name: string }>
        if (props.some((p) => p.name === IR_BOOK_PLAN_PROP)) {
          planWriteCount++
          // First plan write after next init is the afterAdvance save — fail it.
          // Second is the broken checkpoint — allow.
          if (planWriteCount === 1) {
            throw new Error("plan save boom")
          }
        }
      }
      return defaultEditorImpl(command, ...args)
    })

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed",
      nextChapterSchedule: "today"
    })

    expect(result.kind).toBe("partial")
    expect(result.currentChapterRemoved).toBe(false)
    expect(result.planPersisted).toBe(true) // checkpoint saved
    // Current still live
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(blockMap.get(1)!.properties?.some((p) => p.name === "ir.due")).toBe(true)
    // Next already has IR
    expect(blockMap.get(2)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(blockMap.get(2)!.properties?.find((p) => p.name === "ir.sourceBookId")?.value).toBe(100)

    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBeNull()
    expect(plan.lastError).toMatch(/计划保存失败/)
  })

  it("surfaces both errors when plan save and checkpoint write fail", async () => {
    await setupSequential()
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.setProperties") {
        const props = args[2] as Array<{ name: string }>
        if (props.some((p) => p.name === IR_BOOK_PLAN_PROP)) {
          throw new Error("plan ipc dead")
        }
      }
      return defaultEditorImpl(command, ...args)
    })
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed"
    })
    consoleSpy.mockRestore()

    expect(result.kind).toBe("partial")
    expect(result.currentChapterRemoved).toBe(false)
    expect(result.planPersisted).toBe(false)
    expect(result.message).toMatch(/检查点/)
    expect(result.message).toMatch(/plan ipc dead/)
    // Backend plan unchanged (still original active=1)
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBe(1)
    // Dual live IR still present
    expect(blockMap.get(1)!.refs?.some((r) => r.alias === "card")).toBe(true)
    expect(blockMap.get(2)!.refs?.some((r) => r.alias === "card")).toBe(true)
  })

  it("retrySequentialActivation reconciles dual-live to single card after plan-save failure", async () => {
    await setupSequential()
    let planWriteCount = 0
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.setProperties") {
        const props = args[2] as Array<{ name: string }>
        if (props.some((p) => p.name === IR_BOOK_PLAN_PROP)) {
          planWriteCount++
          if (planWriteCount === 1) throw new Error("plan save boom")
        }
      }
      return defaultEditorImpl(command, ...args)
    })

    await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed"
    })
    // Restore normal plan writes for retry
    mockOrca.commands.invokeEditorCommand.mockImplementation(defaultEditorImpl)

    const { retrySequentialActivation } = await import("./bookIRProgression")
    const repaired = await retrySequentialActivation(100)
    expect(repaired.kind).toBe("advanced")
    expect(repaired.plan!.activeChapterId).toBe(2)
    expect(repaired.plan!.outcomes["2"]).toBe("active")
    // Single live sequential card
    expect(blockMap.get(2)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(blockMap.get(2)!.properties?.find((p) => p.name === "ir.sourceBookId")?.value).toBe(100)
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBeFalsy()
    expect(blockMap.get(3)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBeFalsy()
  })

  it("retry completes due-only partial next (missing #card) into fully active", async () => {
    await setupSequential()
    // Simulate half-init: next has ir.due + sourceBookId but no #card
    setProp(blockMap.get(2)!, "ir.due", new Date(), 5)
    setProp(blockMap.get(2)!, "ir.sourceBookId", 100, 3)
    blockMap.get(2)!.refs = []
    // Broken plan after failed advance
    const broken = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    await (await import("./bookIRPlanRepository")).saveBookIRPlan(100, {
      ...broken,
      activeChapterId: null,
      outcomes: { ...broken.outcomes, "1": "active", "2": "pending" },
      lastError: "partial next"
    })
    // Leave current live — retry should prefer last partial/live and strip current
    const { retrySequentialActivation } = await import("./bookIRProgression")
    const repaired = await retrySequentialActivation(100)
    expect(repaired.kind).toBe("advanced")
    expect(repaired.plan!.activeChapterId).toBe(2)
    expect(blockMap.get(2)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(blockMap.get(2)!.properties?.some((p) => p.name === "ir.due")).toBe(true)
    // At most one live card for this book
    const liveCount = [1, 2, 3].filter((id) => {
      const b = blockMap.get(id)!
      const hasCard = b.refs?.some((r) => r.type === 2 && r.alias === "card")
      const source = b.properties?.find((p) => p.name === "ir.sourceBookId")?.value
      return hasCard && source === 100
    }).length
    expect(liveCount).toBe(1)
  })

  it("refuses to wipe a chapter that already belongs to another book", async () => {
    await setupSequential()
    // Chapter 2 has IR for a different book
    setProp(blockMap.get(2)!, "ir.due", new Date(), 5)
    setProp(blockMap.get(2)!, "ir.sourceBookId", 999, 3)
    blockMap.get(2)!.refs = [{ type: 2, alias: "card", to: 2 } as any]

    await expect(
      advanceSequentialBook({
        bookBlockId: 100,
        chapterId: 1,
        outcome: "completed"
      })
    ).rejects.toThrow(/属于书籍 #999/)

    // Current chapter untouched
    expect(blockMap.get(1)!.refs?.some((r) => r.alias === "card")).toBe(true)
    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBe(1)
  })

  it("refuses to overwrite unrelated #card with missing sourceBookId (no init commands)", async () => {
    await setupSequential()
    // Pending chapter has an existing unrelated card + IR/SRS-like props, no sourceBookId
    const ch2 = blockMap.get(2)!
    ch2.refs = [{ type: 2, alias: "card", to: 2 } as any]
    setProp(ch2, "ir.due", new Date("2030-01-01"), 5)
    setProp(ch2, "ir.priority", 80, 3)
    setProp(ch2, "ir.readCount", 5, 3)
    setProp(ch2, "srs.due", new Date("2030-02-01"), 5)
    // Explicitly no ir.sourceBookId

    const commandsBefore = mockOrca.commands.invokeEditorCommand.mock.calls.length

    await expect(
      advanceSequentialBook({
        bookBlockId: 100,
        chapterId: 1,
        outcome: "completed",
        nextChapterSchedule: "today"
      })
    ).rejects.toThrow(/缺少 ir\.sourceBookId/)

    // No editor mutations after the throw path for chapter 2 (no insertTag/setProperties on 2)
    const newCalls = mockOrca.commands.invokeEditorCommand.mock.calls.slice(commandsBefore)
    // invokeEditorCommand(cmd, null, blockId|ids, ...)
    const ch2Mutations = newCalls.filter((call) => {
      const command = call[0] as string
      if (command === "core.editor.insertTag") {
        return call[2] === 2
      }
      if (command === "core.editor.setRefData") {
        const ref = call[2] as { from?: DbId; to?: DbId } | undefined
        return ref?.from === 2 || ref?.to === 2
      }
      if (command === "core.editor.setProperties" || command === "core.editor.deleteProperties") {
        const ids = call[2] as DbId[]
        return Array.isArray(ids) && ids.includes(2)
      }
      if (command === "core.editor.removeTag") {
        return call[2] === 2
      }
      return false
    })
    expect(ch2Mutations).toHaveLength(0)

    // Unrelated progress preserved
    expect(ch2.properties?.find((p) => p.name === "ir.readCount")?.value).toBe(5)
    expect(ch2.properties?.find((p) => p.name === "srs.due")).toBeTruthy()
    expect(ch2.refs?.some((r) => r.alias === "card")).toBe(true)

    const plan = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(plan.activeChapterId).toBe(1)
    expect(blockMap.get(1)!.refs?.some((r) => r.alias === "card")).toBe(true)
  })
})

describe("retryFailedBookIRInit sequential reconciliation", () => {
  it("reconciles dual-live when plan still points at the old chapter", async () => {
    await initializeBookIR({
      bookBlockId: 100,
      bookTitle: "Book",
      chapterIds: [1, 2, 3],
      mode: "sequential",
      priority: 50,
      totalDays: 5
    })
    // Simulate plan-save + checkpoint both failed: plan still active=1, but next already has IR
    const ch2 = blockMap.get(2)!
    ch2.refs = [{ type: 2, alias: "card", to: 2 } as any]
    setProp(ch2, "ir.due", new Date(), 5)
    setProp(ch2, "ir.sourceBookId", 100, 3)
    setProp(ch2, "ir.priority", 50, 3)

    const planBefore = parseBookIRPlan(
      blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value,
      100
    )
    expect(planBefore.activeChapterId).toBe(1)
    expect(blockMap.get(1)!.refs?.some((r) => r.alias === "card")).toBe(true)
    expect(blockMap.get(2)!.refs?.some((r) => r.alias === "card")).toBe(true)

    const result = await retryFailedBookIRInit(100, "Book")
    expect(result.kind).toBe("advanced")
    expect(result.plan!.activeChapterId).toBe(2)
    expect(result.plan!.outcomes["2"]).toBe("active")
    // Single live sequential card for this book
    expect(blockMap.get(2)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBe(true)
    expect(blockMap.get(1)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBeFalsy()
    expect(blockMap.get(3)!.refs?.some((r) => r.type === 2 && r.alias === "card")).toBeFalsy()
  })
})

describe("isChapterFullyActive strict backend truth", () => {
  it("accepts single-element Orca arrays for ir.sourceBookId and ir.due", async () => {
    const block = blockMap.get(1)!
    block.refs = [{ type: 2, alias: "card", to: 1 } as any]
    setProp(block, "ir.due", [new Date("2026-07-18T00:00:00")], 5)
    setProp(block, "ir.sourceBookId", [100], 3)
    // Keep state empty so truth must come from get-block → blockMap
    mockOrca.state.blocks = {}

    await expect(isChapterFullyActive(1, 100)).resolves.toBe(true)
    // multi-element source is not fully active
    setProp(block, "ir.sourceBookId", [100, 200], 3)
    await expect(isChapterFullyActive(1, 100)).resolves.toBe(false)
    // empty array due is not fully active
    setProp(block, "ir.sourceBookId", 100, 3)
    setProp(block, "ir.due", [], 5)
    await expect(isChapterFullyActive(1, 100)).resolves.toBe(false)
  })

  it("propagates backend get-block failures instead of trusting orca.state", async () => {
    const stale = makeBlock(1, "stale")
    stale.refs = [{ type: 2, alias: "card", to: 1 } as any]
    setProp(stale, "ir.due", new Date(), 5)
    setProp(stale, "ir.sourceBookId", 100, 3)
    mockOrca.state.blocks[1] = stale
    // Backend fails — must not report fully active from stale state
    mockOrca.invokeBackend.mockImplementation(async (command: string, id: DbId) => {
      if (command === "get-block" && id === 1) {
        throw new Error("backend offline")
      }
      if (command === "get-block") return blockMap.get(id)
      return undefined
    })

    await expect(isChapterFullyActive(1, 100)).rejects.toThrow(/后端状态失败|backend offline/)

    // Restore default backend mock so later suites in the same worker stay healthy
    mockOrca.invokeBackend.mockImplementation(async (command: string, id: DbId) => {
      if (command === "get-block") return blockMap.get(id)
      return undefined
    })
  })
})
