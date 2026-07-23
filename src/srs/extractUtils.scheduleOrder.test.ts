/**
 * Batch B2 修补：createExtract 排期初始化顺序
 * invalidate(tag) → [setSource → invalidate(source)] → ensure → updatePriority
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import {
  initializeExtractScheduleAfterCreate,
  readTopicBookProvenance
} from "./extractUtils"

describe("readTopicBookProvenance", () => {
  it("reads number book id and non-empty title", () => {
    const block = {
      id: 1,
      properties: [
        { name: "ir.sourceBookId", value: 100, type: 3 },
        { name: "ir.sourceBookTitle", value: "  My Book  ", type: 2 }
      ]
    } as Block
    expect(readTopicBookProvenance(block)).toEqual({
      sourceBookId: 100,
      sourceBookTitle: "My Book"
    })
  })

  it("unwraps single-element Orca arrays and coerces string ids", () => {
    const block = {
      id: 1,
      properties: [
        { name: "ir.sourceBookId", value: ["42"], type: 3 },
        { name: "ir.sourceBookTitle", value: ["Title"], type: 2 }
      ]
    } as Block
    expect(readTopicBookProvenance(block)).toEqual({
      sourceBookId: 42,
      sourceBookTitle: "Title"
    })
  })

  it("returns nulls when book meta is absent or empty", () => {
    const block = {
      id: 1,
      properties: [
        { name: "ir.sourceBookTitle", value: "   ", type: 2 }
      ]
    } as Block
    expect(readTopicBookProvenance(block)).toEqual({
      sourceBookId: null,
      sourceBookTitle: null
    })
  })
})

describe("initializeExtractScheduleAfterCreate order", () => {
  it("with source: invalidate → setSource → invalidate → ensure → updatePriority", async () => {
    const order: string[] = []
    const ensureIRState = vi.fn(async () => {
      order.push("ensure")
      return {} as any
    })
    const setSourceTopicId = vi.fn(async () => {
      order.push("setSource")
    })
    const invalidateIrBlockCache = vi.fn(() => {
      order.push("invalidate")
    })
    const updatePriority = vi.fn(async () => {
      order.push("updatePriority")
      return {} as any
    })

    await initializeExtractScheduleAfterCreate({
      extractBlockId: 1646 as DbId,
      sourceTopicId: 231 as DbId,
      priority: 50,
      deps: {
        ensureIRState,
        setSourceTopicId,
        invalidateIrBlockCache,
        updatePriority
      }
    })

    // invalidate(extract) → setSource → invalidate(extract) → invalidate(source)
    // → ensure → invalidate(source) → updatePriority
    expect(order).toEqual([
      "invalidate",
      "setSource",
      "invalidate",
      "invalidate",
      "ensure",
      "invalidate",
      "updatePriority"
    ])
    expect(setSourceTopicId).toHaveBeenCalledWith(1646, 231)
    expect(invalidateIrBlockCache).toHaveBeenCalledTimes(4)
    expect(invalidateIrBlockCache).toHaveBeenCalledWith(1646)
    expect(invalidateIrBlockCache).toHaveBeenCalledWith(231)
    expect(ensureIRState).toHaveBeenCalledWith(1646)
    expect(updatePriority).toHaveBeenCalledWith(1646, 50)
    // ensure 必须在第一次 invalidate 之后（标签对 ensure 可见）
    expect(order.indexOf("ensure")).toBeGreaterThan(order.indexOf("invalidate"))
    // updatePriority 在 ensure 之后
    expect(order.indexOf("updatePriority")).toBeGreaterThan(order.indexOf("ensure"))
  })

  it("without source: invalidate → ensure → updatePriority", async () => {
    const order: string[] = []
    await initializeExtractScheduleAfterCreate({
      extractBlockId: 1 as DbId,
      sourceTopicId: null,
      priority: 40,
      deps: {
        ensureIRState: async () => {
          order.push("ensure")
          return {} as any
        },
        setSourceTopicId: async () => {
          order.push("setSource")
        },
        invalidateIrBlockCache: () => {
          order.push("invalidate")
        },
        updatePriority: async () => {
          order.push("updatePriority")
          return {} as any
        }
      }
    })
    expect(order).toEqual(["invalidate", "ensure", "updatePriority"])
  })

  describe("default setSource multi-prop write", () => {
    const originalOrca = (globalThis as any).orca

    beforeEach(() => {
      ;(globalThis as any).orca = {
        state: {
          blocks: {
            231: {
              id: 231,
              properties: [
                { name: "ir.sourceBookId", value: 900, type: 3 },
                { name: "ir.sourceBookTitle", value: "Book Nine", type: 2 }
              ]
            }
          }
        },
        commands: {
          invokeEditorCommand: vi.fn(async () => undefined)
        },
        invokeBackend: vi.fn()
      }
    })

    afterEach(() => {
      ;(globalThis as any).orca = originalOrca
    })

    it("batches sourceTopicId + book provenance from source Topic", async () => {
      const order: string[] = []
      await initializeExtractScheduleAfterCreate({
        extractBlockId: 1646 as DbId,
        sourceTopicId: 231 as DbId,
        priority: 50,
        deps: {
          ensureIRState: async () => {
            order.push("ensure")
            return {} as any
          },
          invalidateIrBlockCache: () => {
            order.push("invalidate")
          },
          updatePriority: async () => {
            order.push("updatePriority")
            return {} as any
          }
          // intentionally omit setSourceTopicId → exercise default multi-prop write
        }
      })

      // extract → (setSource) → extract → source → ensure → source → updatePriority
      expect(order).toEqual([
        "invalidate",
        "invalidate",
        "invalidate",
        "ensure",
        "invalidate",
        "updatePriority"
      ])

      const invoke = (globalThis as any).orca.commands.invokeEditorCommand as ReturnType<
        typeof vi.fn
      >
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(invoke).toHaveBeenCalledWith(
        "core.editor.setProperties",
        null,
        [1646],
        [
          { name: "ir.sourceTopicId", value: 231, type: 3 },
          { name: "ir.sourceBookId", value: 900, type: 3 },
          { name: "ir.sourceBookTitle", value: "Book Nine", type: 2 }
        ]
      )
    })

    it("writes only sourceTopicId when Topic has no book meta", async () => {
      ;(globalThis as any).orca.state.blocks[231] = {
        id: 231,
        properties: []
      }

      await initializeExtractScheduleAfterCreate({
        extractBlockId: 10 as DbId,
        sourceTopicId: 231 as DbId,
        priority: 30,
        deps: {
          ensureIRState: async () => ({} as any),
          invalidateIrBlockCache: () => {},
          updatePriority: async () => ({} as any)
        }
      })

      const invoke = (globalThis as any).orca.commands.invokeEditorCommand as ReturnType<
        typeof vi.fn
      >
      expect(invoke).toHaveBeenCalledWith(
        "core.editor.setProperties",
        null,
        [10],
        [{ name: "ir.sourceTopicId", value: 231, type: 3 }]
      )
    })

    it("uses explicit book provenance when provided", async () => {
      await initializeExtractScheduleAfterCreate({
        extractBlockId: 10 as DbId,
        sourceTopicId: 231 as DbId,
        priority: 30,
        sourceBookId: 111 as DbId,
        sourceBookTitle: "Explicit",
        deps: {
          ensureIRState: async () => ({} as any),
          invalidateIrBlockCache: () => {},
          updatePriority: async () => ({} as any)
        }
      })

      const invoke = (globalThis as any).orca.commands.invokeEditorCommand as ReturnType<
        typeof vi.fn
      >
      expect(invoke).toHaveBeenCalledWith(
        "core.editor.setProperties",
        null,
        [10],
        [
          { name: "ir.sourceTopicId", value: 231, type: 3 },
          { name: "ir.sourceBookId", value: 111, type: 3 },
          { name: "ir.sourceBookTitle", value: "Explicit", type: 2 }
        ]
      )
    })
  })
})
