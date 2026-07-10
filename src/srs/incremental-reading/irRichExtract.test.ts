import { describe, expect, it } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import {
  buildCrossBlockSegments,
  extractTextFromCrossBlockSegments,
  extractTextFromFragments,
  planExtractSelection,
  planRemoveReadRange,
  resolveSiblingBlockChain
} from "./irRichExtract"

const baseCursor = (overrides: Partial<CursorData> & { anchor: any; focus: any }): CursorData => ({
  panelId: "p",
  rootBlockId: 1,
  isForward: true,
  ...overrides
})

describe("irRichExtract", () => {
  it("plans single fragment selection", () => {
    const plan = planExtractSelection(baseCursor({
      anchor: { blockId: 1, isInline: true, index: 0, offset: 1 },
      focus: { blockId: 1, isInline: true, index: 0, offset: 4 }
    }))
    expect(plan?.mode).toBe("single_fragment")
  })

  it("plans cross fragment selection and extracts joined text", () => {
    const plan = planExtractSelection(baseCursor({
      anchor: { blockId: 1, isInline: true, index: 0, offset: 2 },
      focus: { blockId: 1, isInline: true, index: 2, offset: 3 }
    }))
    expect(plan?.mode).toBe("cross_fragment")
    if (plan?.mode !== "cross_fragment") return
    const text = extractTextFromFragments(
      [
        { t: "t", v: "Hello" } as any,
        { t: "t", v: " " } as any,
        { t: "t", v: "World" } as any
      ],
      plan
    )
    expect(text).toBe("llo Wor")
  })

  it("extracts cross-block selection with offsets and middle blocks", () => {
    const plan = planExtractSelection(baseCursor({
      isForward: true,
      anchor: { blockId: 1, isInline: true, index: 0, offset: 2 },
      focus: { blockId: 3, isInline: true, index: 0, offset: 3 }
    }))
    expect(plan?.mode).toBe("cross_block")
    if (plan?.mode !== "cross_block") return

    const chain = resolveSiblingBlockChain(1, 3, [1, 2, 3, 4])
    expect(chain).toEqual([1, 2, 3])

    const segments = buildCrossBlockSegments(plan, [
      { id: 1, content: [{ t: "t", v: "Hello" } as any] },
      { id: 2, content: [{ t: "t", v: "MIDDLE" } as any] },
      { id: 3, content: [{ t: "t", v: "World" } as any] }
    ])
    const text = extractTextFromCrossBlockSegments(segments)
    // first: from offset 2 → "llo"; middle full; last to offset 3 → "Wor"
    expect(text).toBe("llo\nMIDDLE\nWor")
  })

  it("plans remove-read range keep windows", () => {
    expect(planRemoveReadRange(10, 2, 5)).toEqual({ keepBefore: 2, keepAfter: 4 })
  })
})
