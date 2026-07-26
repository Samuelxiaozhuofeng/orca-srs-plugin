import { describe, expect, it } from "vitest"
import {
  CARD_BATCH_PROPERTY,
  createCardBatchId,
  readCardBatchId
} from "./cardBatch"

describe("createCardBatchId", () => {
  it("encodes the prefix and is stable for a fixed clock and rng", () => {
    const id = createCardBatchId("ai", new Date(1_700_000_000_000), () => 0.5)
    expect(id.startsWith("ai-")).toBe(true)
    expect(createCardBatchId("ai", new Date(1_700_000_000_000), () => 0.5)).toBe(id)
  })

  it("differs when the clock moves", () => {
    const a = createCardBatchId("ai", new Date(1_700_000_000_000), () => 0.5)
    const b = createCardBatchId("ai", new Date(1_700_000_001_000), () => 0.5)
    expect(a).not.toBe(b)
  })
})

describe("readCardBatchId", () => {
  const withProps = (props: unknown) =>
    ({ id: 1, properties: props } as never)

  it("reads a stored batch id", () => {
    expect(
      readCardBatchId(withProps([{ name: CARD_BATCH_PROPERTY, value: "ai-x" }]))
    ).toBe("ai-x")
  })

  it("returns undefined for missing, blank or non-string values", () => {
    expect(readCardBatchId(null)).toBeUndefined()
    expect(readCardBatchId(withProps(undefined))).toBeUndefined()
    expect(readCardBatchId(withProps([]))).toBeUndefined()
    expect(
      readCardBatchId(withProps([{ name: CARD_BATCH_PROPERTY, value: "   " }]))
    ).toBeUndefined()
    expect(
      readCardBatchId(withProps([{ name: CARD_BATCH_PROPERTY, value: 42 }]))
    ).toBeUndefined()
    expect(
      readCardBatchId(withProps([{ name: "srs.due", value: "ai-x" }]))
    ).toBeUndefined()
  })
})

describe("batch stamping coverage", () => {
  it("every AI card insert path stamps the batch id", async () => {
    // 回归：basic 曾漏掉 stampCard，导致最常用的卡型完全不参与聚簇
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/srs/ai/aiCardWriter.ts", "utf8")
    )
    const stampCalls = source.match(/await stampCard\(/g) ?? []
    expect(stampCalls.length).toBe(3)
    for (const fn of ["insertBasicCard", "insertChoiceCard", "insertClozeCard"]) {
      const start = source.indexOf(`async function ${fn}(`)
      expect(start).toBeGreaterThan(-1)
      const nextFn = source.indexOf("\nasync function ", start + 1)
      const body = source.slice(start, nextFn === -1 ? undefined : nextFn)
      expect(body).toContain("await stampCard(")
    }
  })
})
