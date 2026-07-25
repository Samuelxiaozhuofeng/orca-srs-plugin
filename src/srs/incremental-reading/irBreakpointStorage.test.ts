import { describe, expect, it } from "vitest"
import {
  mergeBreakpointSave,
  nextBreakpointVersion,
  pickVisibleResumeBlockId
} from "./irBreakpointStorage"

describe("irBreakpointStorage", () => {
  it("rejects stale versions so old responses cannot overwrite new breakpoints", () => {
    const currentVersion = 3
    const result = mergeBreakpointSave(
      currentVersion,
      10,
      { previewBlockId: null, selection: null, updatedAt: null, version: 3 },
      {
        version: 2,
        resumeBlockId: 99,
        selection: null
      }
    )
    expect(result.accepted).toBe(false)
    if (!result.accepted) {
      expect(result.reason).toBe("stale_version")
      expect(result.currentVersion).toBe(3)
    }
  })

  it("accepts equal or newer versions", () => {
    const result = mergeBreakpointSave(
      2,
      10,
      { previewBlockId: 1, selection: null, updatedAt: null, version: 2 },
      {
        version: 3,
        resumeBlockId: 42,
        previewBlockId: null
      }
    )
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect(result.resumeBlockId).toBe(42)
      expect(result.nextVersion).toBe(3)
      expect(result.breakpoint.version).toBe(3)
    }
  })

  it("increments version monotically", () => {
    expect(nextBreakpointVersion(undefined)).toBe(1)
    expect(nextBreakpointVersion(0)).toBe(1)
    expect(nextBreakpointVersion(5)).toBe(6)
  })

  it("picks the visible block closest to the reading baseline", () => {
    const chosen = pickVisibleResumeBlockId(
      [
        { blockId: 1, top: 100 },
        { blockId: 2, top: 220 },
        { blockId: 3, top: 400 }
      ],
      200
    )
    expect(chosen).toBe(2)
  })

  it("clears stale viewportAnchor when selection/resume changes without new geometry", () => {
    const result = mergeBreakpointSave(
      1,
      20,
      {
        previewBlockId: null,
        selection: null,
        updatedAt: null,
        version: 1,
        schemaVersion: 2,
        viewportAnchor: { rootBlockId: 10, blockId: 20, topOffsetPx: 80 }
      },
      {
        version: 2,
        resumeBlockId: 30,
        selection: {
          rootBlockId: 10,
          anchor: { blockId: 30, offset: 0, isInline: false, index: 0 },
          focus: { blockId: 30, offset: 1, isInline: false, index: 0 },
          isForward: true
        }
      }
    )
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect(result.breakpoint.viewportAnchor).toBeNull()
      expect(result.breakpoint.schemaVersion).toBe(1)
      expect(result.resumeBlockId).toBe(30)
    }
  })

  it("keeps viewportAnchor when only preview changes", () => {
    const result = mergeBreakpointSave(
      1,
      20,
      {
        previewBlockId: null,
        selection: null,
        updatedAt: null,
        version: 1,
        schemaVersion: 2,
        viewportAnchor: { rootBlockId: 10, blockId: 20, topOffsetPx: 80 }
      },
      {
        version: 2,
        previewBlockId: 99
      }
    )
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect(result.breakpoint.viewportAnchor?.topOffsetPx).toBe(80)
      expect(result.breakpoint.schemaVersion).toBe(2)
    }
  })
})
