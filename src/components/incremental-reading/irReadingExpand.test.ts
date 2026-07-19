/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest"
import {
  expandReadingModeBlocks,
  isFoldingHandleExpanded,
  IR_READING_EXPANDED_CARET_CLASS
} from "./irReadingExpand"

describe("irReadingExpand", () => {
  it("treats caret-down folding handle as already expanded", () => {
    const handle = document.createElement("div")
    handle.className = `orca-block-folding-handle ${IR_READING_EXPANDED_CARET_CLASS}`
    expect(isFoldingHandleExpanded(handle)).toBe(true)
  })

  it("treats non-caret-down folding handle as collapsed", () => {
    const handle = document.createElement("div")
    handle.className = "orca-block-folding-handle ti-caret-right-filled"
    expect(isFoldingHandleExpanded(handle)).toBe(false)
  })

  it("forces hidden children containers visible without clicking expanded handles", () => {
    const root = document.createElement("div")
    const children = document.createElement("div")
    children.className = "orca-block-children"
    children.style.display = "none"
    children.hidden = true
    root.appendChild(children)

    const expanded = document.createElement("div")
    expanded.className = `orca-block-folding-handle ${IR_READING_EXPANDED_CARET_CLASS}`
    expanded.click = vi.fn()
    root.appendChild(expanded)

    const result = expandReadingModeBlocks(root)
    expect(result.forcedVisible).toBe(1)
    expect(result.clickedCollapsed).toBe(0)
    expect(expanded.click).not.toHaveBeenCalled()
    expect(children.style.display).toBe("")
    expect(children.hidden).toBe(false)
  })

  it("clicks only collapsed folding handles", () => {
    const root = document.createElement("div")
    const collapsed = document.createElement("div")
    collapsed.className = "orca-block-folding-handle ti-caret-right-filled"
    collapsed.click = vi.fn()
    root.appendChild(collapsed)

    const expanded = document.createElement("div")
    expanded.className = `orca-block-folding-handle ${IR_READING_EXPANDED_CARET_CLASS}`
    expanded.click = vi.fn()
    root.appendChild(expanded)

    const result = expandReadingModeBlocks(root)
    expect(result.clickedCollapsed).toBe(1)
    expect(collapsed.click).toHaveBeenCalledTimes(1)
    expect(expanded.click).not.toHaveBeenCalled()
  })

  it("handles async nested nodes by re-running expand on new collapsed handles", () => {
    const root = document.createElement("div")
    const first = expandReadingModeBlocks(root)
    expect(first.clickedCollapsed).toBe(0)

    const late = document.createElement("div")
    late.className = "orca-block-folding-handle ti-caret-right-filled"
    late.click = vi.fn()
    root.appendChild(late)

    const second = expandReadingModeBlocks(root)
    expect(second.clickedCollapsed).toBe(1)
    expect(late.click).toHaveBeenCalledTimes(1)
  })
})
