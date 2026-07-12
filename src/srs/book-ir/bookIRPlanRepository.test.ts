import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { IR_BOOK_PLAN_PROP } from "../../importers/epub/types"
import type { BookIRPlanV1 } from "../../importers/epub/types"

const PROP_TYPE_JSON = 0

const blockMap = new Map<DbId, Block>()

function makeBlock(id: DbId): Block {
  return {
    id,
    content: [],
    text: "",
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

function setProp(block: Block, name: string, value: unknown, type: number): void {
  const props = block.properties ?? []
  const idx = props.findIndex((p) => p.name === name)
  const prop = { name, value, type } as Block["properties"][number]
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
    invokeEditorCommand: vi.fn(async (command: string, ...args: unknown[]) => {
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = blockMap.get(id)!
          for (const p of props) setProp(block, p.name, p.value, p.type)
        }
        return true
      }
      return true
    })
  },
  state: { blocks: {} as Record<number, Block> }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import {
  loadBookIRPlan,
  parseBookIRPlan,
  saveBookIRPlan
} from "./bookIRPlanRepository"
import { advanceSequentialBook } from "./bookIRProgression"

vi.mock("../cardTagDataBuilder", () => ({
  buildCardTagData: vi.fn(async () => ({}))
}))

vi.mock("../incremental-reading/irIndex", () => ({
  upsertIRIndexId: vi.fn(),
  removeIRIndexId: vi.fn()
}))

vi.mock("../storage", () => ({
  deleteCardSrsData: vi.fn(async () => undefined)
}))

function samplePlan(bookBlockId = 100): BookIRPlanV1 {
  return {
    version: 1,
    bookBlockId,
    mode: "sequential",
    priority: 50,
    totalDays: 5,
    selectedChapterIds: [1, 2],
    activeChapterId: 1,
    outcomes: { "1": "active", "2": "pending" },
    lastError: null
  }
}

beforeEach(() => {
  blockMap.clear()
  mockOrca.state.blocks = {}
  vi.clearAllMocks()
  for (const id of [100, 1, 2]) {
    const block = makeBlock(id)
    blockMap.set(id, block)
    mockOrca.state.blocks[id] = block
  }
})

describe("saveBookIRPlan", () => {
  it("writes ir.bookPlan as PropType.JSON object", async () => {
    const plan = samplePlan()
    await saveBookIRPlan(100, plan)

    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [100],
      [{ name: IR_BOOK_PLAN_PROP, value: plan, type: PROP_TYPE_JSON }]
    )

    const stored = blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)
    expect(stored?.type).toBe(PROP_TYPE_JSON)
    expect(stored?.value).toEqual(plan)
    expect(typeof stored?.value).toBe("object")
  })
})

describe("parseBookIRPlan backward compatibility", () => {
  it("accepts JSON object (PropType.JSON)", () => {
    const plan = samplePlan()
    expect(parseBookIRPlan(plan, 100)).toEqual(plan)
  })

  it("accepts JSON string (legacy text storage)", () => {
    const plan = samplePlan()
    expect(parseBookIRPlan(JSON.stringify(plan), 100)).toEqual(plan)
  })

  it("accepts a single-element JSON string array from legacy type 2 storage", () => {
    const plan = samplePlan()
    expect(parseBookIRPlan([JSON.stringify(plan)], 100)).toEqual(plan)
  })

  it("rejects BlockRefs-shaped corrupted values with a clear error", () => {
    expect(() => parseBookIRPlan([1, 2, 3], 100)).toThrow(/invalid BlockRefs array/i)
  })
})

describe("loadBookIRPlan", () => {
  it("loads object and string plans from block properties", async () => {
    const plan = samplePlan()
    setProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP, plan, PROP_TYPE_JSON)
    expect(await loadBookIRPlan(100)).toEqual(plan)

    setProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP, JSON.stringify(plan), 1)
    expect(await loadBookIRPlan(100)).toEqual(plan)

    setProp(blockMap.get(100)!, IR_BOOK_PLAN_PROP, [JSON.stringify(plan)], 2)
    expect(await loadBookIRPlan(100)).toEqual(plan)
  })
})

describe("advanceSequentialBook with corrected plan storage", () => {
  function seedActiveChapter(): void {
    setProp(blockMap.get(1)!, "ir.due", new Date(), 5)
    blockMap.get(1)!.refs = [{ type: 2, alias: "card", to: 1 } as Block["refs"][number]]
  }

  it("complete chapter records completed and unlocks next chapter", async () => {
    await saveBookIRPlan(100, samplePlan())
    seedActiveChapter()

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed"
    })
    expect(result.kind).toBe("advanced")

    const stored = blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)
    expect(stored?.type).toBe(PROP_TYPE_JSON)
    const plan = parseBookIRPlan(stored?.value, 100)
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["2"]).toBe("active")
  })

  it("migrates a legacy type 2 wrapped plan while completing the chapter", async () => {
    setProp(
      blockMap.get(100)!,
      IR_BOOK_PLAN_PROP,
      [JSON.stringify(samplePlan())],
      2
    )
    seedActiveChapter()

    const result = await advanceSequentialBook({
      bookBlockId: 100,
      chapterId: 1,
      outcome: "completed"
    })

    expect(result.kind).toBe("advanced")
    const stored = blockMap.get(100)!.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)
    expect(stored?.type).toBe(PROP_TYPE_JSON)
    const plan = parseBookIRPlan(stored?.value, 100)
    expect(plan.outcomes["1"]).toBe("completed")
    expect(plan.activeChapterId).toBe(2)
    expect(plan.outcomes["2"]).toBe("active")
  })
})
