/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"
import { collectVisibleBlockTops, computeVisibleResumeBaseline } from "./irBreakpointViewport"

describe("irBreakpointViewport", () => {
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
})