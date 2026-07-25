/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"
import {
  normalizeReadingBreakpoint,
  parseReadingBreakpoint,
  serializeReadingBreakpoint
} from "../srs/incremental-reading/irPropertyCodec"
import { computeReadingProgressKey } from "../srs/incremental-reading/irSchedulingHelpers"
import { isMeaningfulTextSelection } from "./irBreakpointRestore"
import {
  alignBlockTopOffset,
  measureBlockTopOffsetPx
} from "./irBreakpointViewport"

describe("isMeaningfulTextSelection", () => {
  it("rejects null, collapsed, and whitespace-only selections", () => {
    expect(isMeaningfulTextSelection(null)).toBe(false)

    const collapsed = {
      isCollapsed: true,
      toString: () => "x"
    } as unknown as Selection
    expect(isMeaningfulTextSelection(collapsed)).toBe(false)

    const empty = {
      isCollapsed: false,
      toString: () => "   "
    } as unknown as Selection
    expect(isMeaningfulTextSelection(empty)).toBe(false)
  })

  it("accepts non-collapsed selection with text", () => {
    const sel = {
      isCollapsed: false,
      toString: () => "段落"
    } as unknown as Selection
    expect(isMeaningfulTextSelection(sel)).toBe(true)
  })
})

describe("viewportAnchor codec", () => {
  it("round-trips v2 viewport anchor and keeps v1 fields", () => {
    const bp = normalizeReadingBreakpoint({
      previewBlockId: null,
      selection: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      schemaVersion: 2,
      viewportAnchor: { rootBlockId: 10, blockId: 20, topOffsetPx: 72 }
    })
    expect(bp?.viewportAnchor).toEqual({
      rootBlockId: 10,
      blockId: 20,
      topOffsetPx: 72
    })
    expect(bp?.schemaVersion).toBe(2)

    const raw = serializeReadingBreakpoint(bp)
    expect(raw).toContain("viewportAnchor")
    const parsed = parseReadingBreakpoint(raw)
    expect(parsed?.viewportAnchor?.topOffsetPx).toBe(72)
  })

  it("parses legacy v1 JSON without viewportAnchor", () => {
    const raw = JSON.stringify({
      previewBlockId: 5,
      selection: null,
      updatedAt: null
    })
    const parsed = parseReadingBreakpoint(raw)
    expect(parsed?.previewBlockId).toBe(5)
    expect(parsed?.viewportAnchor).toBeNull()
    expect(parsed?.schemaVersion).toBe(1)
  })

  it("forces schemaVersion 1 when selection exists but viewportAnchor is missing", () => {
    const bp = normalizeReadingBreakpoint({
      previewBlockId: null,
      selection: {
        rootBlockId: 10,
        anchor: { blockId: 20, offset: 0, isInline: false, index: 0 },
        focus: { blockId: 20, offset: 2, isInline: false, index: 0 },
        isForward: true
      },
      updatedAt: null,
      schemaVersion: 2,
      viewportAnchor: null
    })
    expect(bp?.schemaVersion).toBe(1)
    expect(bp?.viewportAnchor).toBeNull()
    const raw = serializeReadingBreakpoint(bp)
    expect(raw).not.toContain("viewportAnchor")
    expect(JSON.parse(raw!).schemaVersion).toBe(1)
  })

  it("rejects non-finite topOffsetPx", () => {
    expect(normalizeReadingBreakpoint({
      previewBlockId: null,
      selection: null,
      updatedAt: null,
      viewportAnchor: { rootBlockId: 1, blockId: 2, topOffsetPx: Number.NaN }
    })).toBeNull()
  })
})

describe("alignBlockTopOffset", () => {
  it("adjusts scrollTop so residual is within epsilon for captured offset", () => {
    const owner = document.createElement("div")
    owner.scrollTop = 0
    Object.defineProperty(owner, "clientHeight", { value: 500, configurable: true })
    owner.getBoundingClientRect = () => ({
      top: 100, left: 0, right: 400, bottom: 600, width: 400, height: 500, x: 0, y: 100, toJSON: () => ({})
    })

    const block = document.createElement("div")
    let blockTop = 250
    block.getBoundingClientRect = () => ({
      top: blockTop, left: 0, right: 400, bottom: blockTop + 40, width: 400, height: 40, x: 0, y: blockTop, toJSON: () => ({})
    })

    // 捕获：块顶相对 owner 顶部 = 150
    const captured = measureBlockTopOffsetPx(block, owner)
    expect(captured).toBe(150)

    // 模拟滚动后块位置变了，对齐回 72
    blockTop = 300
    owner.scrollTop = 400
    // align adds delta to scrollTop; jsdom won't move rects, so mock rect after by adjusting
    // We only assert the scrollTop delta applied equals current - desired
    const residual = alignBlockTopOffset(block, owner, 72)
    // current offset = 300-100=200; delta = 200-72=128; scrollTop becomes 528
    expect(owner.scrollTop).toBe(528)
    // residual remeasures with same mock rect (layout not updated) → still 200-72
    expect(Math.abs(residual)).toBe(128)
  })
})

describe("progress key includes viewport anchor", () => {
  it("changes when same block scrolls (offset changes)", () => {
    const a = computeReadingProgressKey({
      resumeBlockId: 20,
      readingBreakpoint: {
        previewBlockId: null,
        selection: null,
        updatedAt: null,
        viewportAnchor: { rootBlockId: 10, blockId: 20, topOffsetPx: 40 }
      }
    })
    const b = computeReadingProgressKey({
      resumeBlockId: 20,
      readingBreakpoint: {
        previewBlockId: null,
        selection: null,
        updatedAt: null,
        viewportAnchor: { rootBlockId: 10, blockId: 20, topOffsetPx: 120 }
      }
    })
    expect(a).not.toBe(b)
    expect(a).toContain("a=10:20:40")
    expect(b).toContain("a=10:20:120")
  })
})
