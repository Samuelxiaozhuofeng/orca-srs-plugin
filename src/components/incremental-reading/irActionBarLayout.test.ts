import { describe, expect, it } from "vitest"
import {
  computeIRActionBarLayout,
  resolveIRActionBarContentSafePadding,
  resolveIRActionBarInset,
  resolveIRActionBarTier
} from "./irActionBarLayout"

describe("resolveIRActionBarTier", () => {
  it("classifies wide / medium / narrow by panel width", () => {
    expect(resolveIRActionBarTier(1040)).toBe("wide")
    expect(resolveIRActionBarTier(2000)).toBe("wide")
    expect(resolveIRActionBarTier(1039)).toBe("medium")
    expect(resolveIRActionBarTier(700)).toBe("medium")
    expect(resolveIRActionBarTier(699)).toBe("narrow")
    expect(resolveIRActionBarTier(320)).toBe("narrow")
  })
})

describe("resolveIRActionBarInset / contentSafePadding", () => {
  it("returns tier-specific inset and body safe padding", () => {
    expect(resolveIRActionBarInset("wide")).toBe(16)
    expect(resolveIRActionBarInset("medium")).toBe(8)
    expect(resolveIRActionBarInset("narrow")).toBe(4)

    expect(resolveIRActionBarContentSafePadding("wide")).toBe(0)
    expect(resolveIRActionBarContentSafePadding("medium")).toBe(82)
    expect(resolveIRActionBarContentSafePadding("narrow")).toBe(58)
  })
})

describe("computeIRActionBarLayout", () => {
  const viewport = { width: 1400, height: 900 }

  it("centers top in the visible intersection of panel and window", () => {
    // Panel partially above the fold: visible band is 0..400
    const layout = computeIRActionBarLayout(
      { top: -200, bottom: 400, right: 1200, width: 1100 },
      viewport
    )
    expect(layout.top).toBe(200) // (0 + 400) / 2
    expect(layout.tier).toBe("wide")
  })

  it("falls back to window vertical center when panel is fully off-screen", () => {
    const layout = computeIRActionBarLayout(
      { top: 1000, bottom: 1400, right: 1200, width: 1100 },
      viewport
    )
    expect(layout.top).toBe(450) // 900 / 2
  })

  it("anchors right to the panel edge with tier inset (not 50vw)", () => {
    // Panel right edge at 1000 in a 1400-wide window → gap 400 + inset
    const wide = computeIRActionBarLayout(
      { top: 0, bottom: 800, right: 1000, width: 1100 },
      viewport
    )
    expect(wide.right).toBe(400 + 16)
    expect(wide.inset).toBe(16)

    const medium = computeIRActionBarLayout(
      { top: 0, bottom: 800, right: 1000, width: 900 },
      viewport
    )
    expect(medium.tier).toBe("medium")
    expect(medium.right).toBe(400 + 8)
    expect(medium.contentSafePadding).toBe(82)

    const narrow = computeIRActionBarLayout(
      { top: 0, bottom: 800, right: 1000, width: 500 },
      viewport
    )
    expect(narrow.tier).toBe("narrow")
    expect(narrow.right).toBe(400 + 4)
    expect(narrow.contentSafePadding).toBe(58)
  })

  it("clamps right to at least inset when panel exceeds the window right edge", () => {
    const layout = computeIRActionBarLayout(
      { top: 0, bottom: 800, right: 1500, width: 1100 },
      viewport
    )
    // window.innerWidth - rect.right + inset = 1400 - 1500 + 16 = -84 → max(16, -84) = 16
    expect(layout.right).toBe(16)
  })

  it("uses full panel band when fully inside the viewport", () => {
    const layout = computeIRActionBarLayout(
      { top: 100, bottom: 700, right: 1200, width: 1100 },
      viewport
    )
    expect(layout.top).toBe(400) // (100 + 700) / 2
  })
})
