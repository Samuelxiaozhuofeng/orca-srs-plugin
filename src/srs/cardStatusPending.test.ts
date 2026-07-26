import { describe, expect, it } from "vitest"
import { extractCardStatus } from "./cardStatusUtils"
import type { Block } from "../orca.d.ts"

function blockWithStatus(value: unknown): Block {
  return {
    id: 1,
    refs: [
      {
        id: 10,
        type: 2,
        alias: "card",
        data: [{ name: "status", value }]
      }
    ]
  } as unknown as Block
}

describe("extractCardStatus pending", () => {
  it("recognises pending as its own status", () => {
    expect(extractCardStatus(blockWithStatus("pending"))).toBe("pending")
    expect(extractCardStatus(blockWithStatus("  PENDING  "))).toBe("pending")
    expect(extractCardStatus(blockWithStatus(["pending"]))).toBe("pending")
  })

  it("still recognises suspend and normal", () => {
    expect(extractCardStatus(blockWithStatus("suspend"))).toBe("suspend")
    expect(extractCardStatus(blockWithStatus(""))).toBe("normal")
  })

  it("falls back to normal for unknown values", () => {
    // 宁可多复习一张，也不要因为一个笔误静默吞掉卡片
    expect(extractCardStatus(blockWithStatus("pendign"))).toBe("normal")
    expect(extractCardStatus(blockWithStatus(42))).toBe("normal")
  })
})
