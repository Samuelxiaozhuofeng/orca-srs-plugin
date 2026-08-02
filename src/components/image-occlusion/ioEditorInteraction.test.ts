import { describe, expect, it } from "vitest"
import type { IoRectRegion } from "../../srs/imageOcclusion"
import {
  beginDrawInteraction,
  beginMarqueeInteraction,
  beginMoveInteraction,
  beginResizeInteraction,
  cancelIoEditorInteraction,
  commitIoEditorInteraction,
  getIoInteractionDraftRect,
  moveIoEditorInteraction,
  type IoInteractionSession
} from "./ioEditorInteraction"

function rect(
  id: string,
  n: number,
  x = 0.1,
  y = 0.1,
  w = 0.2,
  h = 0.2
): IoRectRegion {
  return { id, n, shape: "rect", x, y, w, h }
}

function baseSession(
  regions: IoRectRegion[],
  selectedIds: string[] = []
): IoInteractionSession {
  return {
    interaction: null,
    regions,
    selectedIds,
    focusRegionId: selectedIds[0] ?? null,
    activeNumber: 1
  }
}

describe("ioEditorInteraction commit / cancel", () => {
  it("move commit keeps translated geometry; cancel restores originRegions", () => {
    const regions = [rect("a", 1, 0.1, 0.1), rect("b", 1, 0.4, 0.1)]
    let s = beginMoveInteraction(baseSession(regions, ["a", "b"]), 1, 0.1, 0.1, [
      "a",
      "b"
    ])
    s = moveIoEditorInteraction(s, 1, 0.2, 0.15)
    expect(s.regions.find(r => r.id === "a")!.x).toBeCloseTo(0.2, 8)
    expect(s.regions.find(r => r.id === "b")!.x).toBeCloseTo(0.5, 8)

    const committed = commitIoEditorInteraction(s, 1)
    expect(committed.interaction).toBeNull()
    expect(committed.regions.find(r => r.id === "a")!.x).toBeCloseTo(0.2, 8)

    // 重新从同一起点拖动后取消
    s = beginMoveInteraction(baseSession(regions, ["a"]), 2, 0.1, 0.1, ["a"])
    s = moveIoEditorInteraction(s, 2, 0.3, 0.1)
    expect(s.regions.find(r => r.id === "a")!.x).toBeCloseTo(0.3, 8)
    const cancelled = cancelIoEditorInteraction(s)
    expect(cancelled.interaction).toBeNull()
    expect(cancelled.regions).toEqual(regions)
  })

  it("resize commit keeps size; cancel restores full originRegions", () => {
    const regions = [rect("a", 1, 0.1, 0.1, 0.2, 0.2), rect("b", 2, 0.5, 0.5)]
    let s = beginResizeInteraction(
      baseSession(regions, ["a"]),
      1,
      0.3,
      0.3,
      regions[0]!,
      "se"
    )
    s = moveIoEditorInteraction(s, 1, 0.4, 0.4)
    expect(s.regions.find(r => r.id === "a")!.w).toBeGreaterThan(0.2)
    expect(s.regions.find(r => r.id === "b")).toEqual(regions[1])

    const committed = commitIoEditorInteraction(s, 1)
    expect(committed.interaction).toBeNull()
    expect(committed.regions.find(r => r.id === "a")!.w).toBeGreaterThan(0.2)

    s = beginResizeInteraction(
      baseSession(regions, ["a"]),
      3,
      0.3,
      0.3,
      regions[0]!,
      "se"
    )
    s = moveIoEditorInteraction(s, 3, 0.45, 0.45)
    const cancelled = cancelIoEditorInteraction(s)
    expect(cancelled.regions).toEqual(regions)
    expect(cancelled.interaction).toBeNull()
  })

  it("draw cancel restores previous selection and adds no region", () => {
    const regions = [rect("a", 1)]
    let s = beginDrawInteraction(
      baseSession(regions, ["a"]),
      1,
      0.1,
      0.1
    )
    expect(s.selectedIds).toEqual([])
    s = moveIoEditorInteraction(s, 1, 0.4, 0.4)
    expect(getIoInteractionDraftRect(s.interaction)).not.toBeNull()
    const cancelled = cancelIoEditorInteraction(s)
    expect(cancelled.regions).toEqual(regions)
    expect(cancelled.selectedIds).toEqual(["a"])
    expect(cancelled.focusRegionId).toBe("a")
    expect(cancelled.interaction).toBeNull()
  })

  it("draw commit adds region with activeNumber", () => {
    let s = beginDrawInteraction(baseSession([], []), 1, 0.1, 0.1)
    s = { ...s, activeNumber: 2 }
    // activeNumber is on session; begin already set; re-set before commit
    s = moveIoEditorInteraction(
      { ...s, activeNumber: 2 },
      1,
      0.4,
      0.5
    )
    const committed = commitIoEditorInteraction(
      { ...s, activeNumber: 2 },
      1
    )
    expect(committed.regions).toHaveLength(1)
    expect(committed.regions[0]!.n).toBe(2)
    expect(committed.selectedIds).toEqual([committed.regions[0]!.id])
    expect(committed.interaction).toBeNull()
  })

  it("marquee cancel restores prev selection without applying hit", () => {
    const regions = [
      rect("a", 1, 0.1, 0.1, 0.2, 0.2),
      rect("b", 2, 0.5, 0.5, 0.2, 0.2)
    ]
    let s = beginMarqueeInteraction(
      baseSession(regions, ["a"]),
      1,
      0.0,
      0.0,
      false
    )
    expect(s.selectedIds).toEqual([])
    s = moveIoEditorInteraction(s, 1, 0.9, 0.9)
    const cancelled = cancelIoEditorInteraction(s)
    expect(cancelled.selectedIds).toEqual(["a"])
    expect(cancelled.focusRegionId).toBe("a")
  })

  it("marquee commit selects intersecting regions", () => {
    const regions = [
      rect("a", 1, 0.1, 0.1, 0.2, 0.2),
      rect("b", 2, 0.6, 0.6, 0.2, 0.2)
    ]
    let s = beginMarqueeInteraction(baseSession(regions, []), 1, 0.0, 0.0, false)
    s = moveIoEditorInteraction(s, 1, 0.35, 0.35)
    const committed = commitIoEditorInteraction(s, 1)
    expect(committed.selectedIds).toEqual(["a"])
    expect(committed.focusRegionId).toBe("a")
  })
})
