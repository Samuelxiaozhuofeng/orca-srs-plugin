/**
 * Batch B2 修补：createExtract 排期初始化顺序
 * invalidate(tag) → [setSource → invalidate(source)] → ensure → updatePriority
 */
import { describe, expect, it, vi } from "vitest"
import type { DbId } from "../orca.d.ts"
import { initializeExtractScheduleAfterCreate } from "./extractUtils"

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

    expect(order).toEqual([
      "invalidate",
      "setSource",
      "invalidate",
      "ensure",
      "updatePriority"
    ])
    expect(setSourceTopicId).toHaveBeenCalledWith(1646, 231)
    expect(invalidateIrBlockCache).toHaveBeenCalledTimes(2)
    expect(invalidateIrBlockCache).toHaveBeenCalledWith(1646)
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
})
