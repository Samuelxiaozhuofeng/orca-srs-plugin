/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  IR_LOCATE_HIGHLIGHT_CLASS,
  clearLocateHighlight,
  locateBlockInContainer,
  scheduleLocateBlock
} from "./irReadingContextLocate"

function makeBlock(id: string | number, className = "orca-block"): HTMLElement {
  const el = document.createElement("div")
  el.className = className
  el.setAttribute("data-id", String(id))
  el.scrollIntoView = vi.fn()
  return el
}

describe("irReadingContextLocate", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("finds .orca-block by data-id and adds highlight class", () => {
    const root = document.createElement("div")
    const block = makeBlock(39)
    root.appendChild(block)
    document.body.appendChild(root)

    const found = locateBlockInContainer(root, 39)

    expect(found).toBe(true)
    expect(block.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
    expect(block.scrollIntoView).toHaveBeenCalled()
  })

  it("accepts string block ids matching data-id", () => {
    const root = document.createElement("div")
    const block = makeBlock("42")
    root.appendChild(block)

    expect(locateBlockInContainer(root, "42")).toBe(true)
    expect(block.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
  })

  it("falls back to [data-id] when .orca-block class is absent", () => {
    const root = document.createElement("div")
    const block = makeBlock(7, "other")
    root.appendChild(block)

    expect(locateBlockInContainer(root, 7)).toBe(true)
    expect(block.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
  })

  it("returns false when the block is missing and does not throw", () => {
    const root = document.createElement("div")
    expect(locateBlockInContainer(root, 999)).toBe(false)
    expect(locateBlockInContainer(null, 999)).toBe(false)
    expect(locateBlockInContainer(undefined, 999)).toBe(false)
  })

  it("clearLocateHighlight removes the class", () => {
    const root = document.createElement("div")
    const a = makeBlock(1)
    const b = makeBlock(2)
    a.classList.add(IR_LOCATE_HIGHLIGHT_CLASS)
    b.classList.add(IR_LOCATE_HIGHLIGHT_CLASS)
    root.append(a, b)

    clearLocateHighlight(root)

    expect(a.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(false)
    expect(b.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(false)
  })

  it("clearLocateHighlight is a no-op for null/undefined root", () => {
    expect(() => clearLocateHighlight(null)).not.toThrow()
    expect(() => clearLocateHighlight(undefined)).not.toThrow()
  })

  it("clears other highlights by default before locating", () => {
    const root = document.createElement("div")
    const previous = makeBlock(1)
    previous.classList.add(IR_LOCATE_HIGHLIGHT_CLASS)
    const next = makeBlock(2)
    root.append(previous, next)

    locateBlockInContainer(root, 2)

    expect(previous.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(false)
    expect(next.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
  })

  it("can skip clearing other highlights when clearOthers is false", () => {
    const root = document.createElement("div")
    const previous = makeBlock(1)
    previous.classList.add(IR_LOCATE_HIGHLIGHT_CLASS)
    const next = makeBlock(2)
    root.append(previous, next)

    locateBlockInContainer(root, 2, { clearOthers: false })

    expect(previous.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
    expect(next.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
  })

  /** Manual rAF queue so scheduleLocateBlock retries are fully synchronous in tests. */
  function installManualRaf(): { flush: () => void } {
    const pending = new Map<number, FrameRequestCallback>()
    let nextId = 1

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      const id = nextId++
      pending.set(id, cb)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
      pending.delete(id)
    })

    return {
      flush: () => {
        const callbacks = [...pending.entries()]
        pending.clear()
        for (const [, cb] of callbacks) {
          cb(0)
        }
      }
    }
  }

  it("scheduleLocateBlock eventually finds when the node appears later", () => {
    const { flush } = installManualRaf()
    const root = document.createElement("div")
    const onFound = vi.fn()
    const onMiss = vi.fn()

    scheduleLocateBlock(root, 55, {
      maxAttempts: 10,
      onFound,
      onMiss
    })

    // First frame: still missing.
    flush()
    expect(onFound).not.toHaveBeenCalled()

    const late = makeBlock(55)
    root.appendChild(late)

    // Second frame: node is present.
    flush()

    expect(onFound).toHaveBeenCalledTimes(1)
    expect(onMiss).not.toHaveBeenCalled()
    expect(late.classList.contains(IR_LOCATE_HIGHLIGHT_CLASS)).toBe(true)
  })

  it("scheduleLocateBlock calls onMiss after maxAttempts", () => {
    const { flush } = installManualRaf()
    const root = document.createElement("div")
    const onFound = vi.fn()
    const onMiss = vi.fn()

    scheduleLocateBlock(root, 77, {
      maxAttempts: 3,
      onFound,
      onMiss
    })

    flush() // attempt 1
    flush() // attempt 2
    flush() // attempt 3 → onMiss

    expect(onFound).not.toHaveBeenCalled()
    expect(onMiss).toHaveBeenCalledTimes(1)
  })

  it("scheduleLocateBlock cancel stops further attempts", () => {
    const { flush } = installManualRaf()
    const root = document.createElement("div")
    const onFound = vi.fn()
    const onMiss = vi.fn()

    const cancel = scheduleLocateBlock(root, 88, {
      maxAttempts: 20,
      onFound,
      onMiss
    })

    cancel()
    root.appendChild(makeBlock(88))
    flush()
    flush()

    expect(onFound).not.toHaveBeenCalled()
    expect(onMiss).not.toHaveBeenCalled()
  })
})
