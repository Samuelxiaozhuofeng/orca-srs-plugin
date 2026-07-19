/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from "vitest"
import {
  collectVisibleBlockTops,
  computeVisibleResumeBaseline,
  resolveVerticalScrollOwner
} from "./irBreakpointViewport"

/** jsdom does not compute layout; set explicit scroll metrics for overflow checks. */
function mockScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number }
) {
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight
  })
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight
  })
  if (metrics.scrollTop != null) {
    el.scrollTop = metrics.scrollTop
  }
}

/**
 * Confirmed runtime shape: internal `.ir-reading__scroll` expands with content
 * (no local scroll range) while a host editor ancestor owns vertical scroll.
 */
function buildHostOwnedScrollTree() {
  const host = document.createElement("div")
  host.className = "orca-block-editor orca-hideable-editor srs-ir-host-panel-chrome-managed"
  host.style.overflowY = "scroll"

  const internal = document.createElement("div")
  internal.className = "ir-reading__scroll"
  internal.style.overflow = "auto"

  const inner = document.createElement("div")
  inner.className = "ir-reading__inner"
  inner.style.overflow = "visible"

  internal.appendChild(inner)
  host.appendChild(internal)
  document.body.appendChild(host)

  // Internal expands to content → no scroll range despite overflow:auto
  mockScrollMetrics(internal, { scrollHeight: 6140, clientHeight: 6140, scrollTop: 0 })
  mockScrollMetrics(inner, { scrollHeight: 6099, clientHeight: 6099, scrollTop: 0 })
  // Host editor is the real owner
  mockScrollMetrics(host, { scrollHeight: 6958, clientHeight: 768, scrollTop: 3961 })

  return { host, internal, inner }
}

describe("irBreakpointViewport", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("uses the scroll viewport for visibility while querying blocks in the content container", () => {
    const scroll = document.createElement("div")
    const body = document.createElement("div")

    scroll.style.height = "200px"
    scroll.style.overflow = "auto"
    body.style.height = "800px"

    const visible = document.createElement("div")
    visible.dataset.blockId = "101"
    visible.style.height = "40px"

    const hidden = document.createElement("div")
    hidden.dataset.blockId = "202"
    hidden.style.height = "40px"
    hidden.style.marginTop = "500px"

    body.append(visible, hidden)
    scroll.appendChild(body)
    document.body.appendChild(scroll)

    Object.defineProperty(scroll, "clientHeight", { value: 200, configurable: true })
    scroll.getBoundingClientRect = () => ({
      top: 100,
      left: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => ({})
    })

    visible.getBoundingClientRect = () => ({
      top: 120,
      left: 0,
      right: 400,
      bottom: 160,
      width: 400,
      height: 40,
      x: 0,
      y: 120,
      toJSON: () => ({})
    })

    hidden.getBoundingClientRect = () => ({
      top: 700,
      left: 0,
      right: 400,
      bottom: 740,
      width: 400,
      height: 40,
      x: 0,
      y: 700,
      toJSON: () => ({})
    })

    const visibleBlocks = collectVisibleBlockTops(body, scroll)
    expect(visibleBlocks.map(item => item.blockId)).toEqual([101])
    expect(computeVisibleResumeBaseline(scroll)).toBe(130)
  })

  it("does not require the content container itself to be scrollable", () => {
    const body = document.createElement("div")
    const scroll = document.createElement("div")
    scroll.style.overflow = "auto"
    body.appendChild(document.createElement("div"))
    scroll.appendChild(body)

    expect(getComputedStyle(body).overflow).not.toBe("auto")
    expect(getComputedStyle(scroll).overflow).toBe("auto")
  })

  describe("resolveVerticalScrollOwner", () => {
    it("returns null for null/undefined start", () => {
      expect(resolveVerticalScrollOwner(null)).toBeNull()
      expect(resolveVerticalScrollOwner(undefined)).toBeNull()
    })

    it("selects the host ancestor when internal .ir-reading__scroll has no scroll range", () => {
      const { host, internal } = buildHostOwnedScrollTree()

      expect(internal.scrollHeight).toBe(internal.clientHeight)
      expect(host.scrollHeight).toBeGreaterThan(host.clientHeight)
      expect(getComputedStyle(host).overflowY).toBe("scroll")

      const owner = resolveVerticalScrollOwner(internal)
      expect(owner).toBe(host)
      expect(owner).not.toBe(internal)
    })

    it("prefers a scrollable internal element over an ancestor (fallback when internal owns scroll)", () => {
      const host = document.createElement("div")
      host.style.overflowY = "scroll"
      mockScrollMetrics(host, { scrollHeight: 2000, clientHeight: 400 })

      const internal = document.createElement("div")
      internal.className = "ir-reading__scroll"
      // Use overflowY (not only overflow shorthand) so jsdom getComputedStyle is reliable
      internal.style.overflowY = "auto"
      mockScrollMetrics(internal, { scrollHeight: 1800, clientHeight: 500, scrollTop: 120 })

      host.appendChild(internal)
      document.body.appendChild(host)

      expect(getComputedStyle(internal).overflowY).toBe("auto")
      expect(resolveVerticalScrollOwner(internal)).toBe(internal)
    })

    it("falls back to the start node when no ancestor has a vertical scroll range", () => {
      const internal = document.createElement("div")
      internal.className = "ir-reading__scroll"
      internal.style.overflow = "auto"
      mockScrollMetrics(internal, { scrollHeight: 400, clientHeight: 400 })
      document.body.appendChild(internal)

      expect(resolveVerticalScrollOwner(internal)).toBe(internal)
    })

    it("accepts overflow-y auto and overlay as scrollable owners", () => {
      for (const overflowY of ["auto", "overlay"] as const) {
        document.body.replaceChildren()
        const host = document.createElement("div")
        host.style.overflowY = overflowY
        mockScrollMetrics(host, { scrollHeight: 900, clientHeight: 200 })

        const start = document.createElement("div")
        start.style.overflow = "visible"
        mockScrollMetrics(start, { scrollHeight: 800, clientHeight: 800 })
        host.appendChild(start)
        document.body.appendChild(host)

        expect(resolveVerticalScrollOwner(start)).toBe(host)
      }
    })

    it("does not hard-code host class names — any scrollable ancestor qualifies", () => {
      const host = document.createElement("div")
      host.className = "custom-panel-scroll-root"
      host.style.overflowY = "auto"
      mockScrollMetrics(host, { scrollHeight: 3000, clientHeight: 600 })

      const mid = document.createElement("div")
      mid.style.overflow = "visible"
      mockScrollMetrics(mid, { scrollHeight: 2900, clientHeight: 2900 })

      const start = document.createElement("div")
      start.className = "ir-reading__scroll"
      start.style.overflow = "auto"
      mockScrollMetrics(start, { scrollHeight: 2800, clientHeight: 2800 })

      mid.appendChild(start)
      host.appendChild(mid)
      document.body.appendChild(host)

      expect(resolveVerticalScrollOwner(start)).toBe(host)
    })

    it("stays on the start chain when multiple panels exist (does not pick a sibling panel)", () => {
      const panelA = document.createElement("div")
      panelA.style.overflowY = "scroll"
      mockScrollMetrics(panelA, { scrollHeight: 5000, clientHeight: 700, scrollTop: 100 })

      const panelB = document.createElement("div")
      panelB.style.overflowY = "scroll"
      mockScrollMetrics(panelB, { scrollHeight: 5000, clientHeight: 700, scrollTop: 999 })

      const startA = document.createElement("div")
      startA.className = "ir-reading__scroll"
      startA.style.overflow = "auto"
      mockScrollMetrics(startA, { scrollHeight: 4000, clientHeight: 4000 })

      panelA.appendChild(startA)
      document.body.append(panelA, panelB)

      expect(resolveVerticalScrollOwner(startA)).toBe(panelA)
      expect(resolveVerticalScrollOwner(startA)).not.toBe(panelB)
    })
  })
})