/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
  IR_CONTEXT_HIDE_CLASS,
  applyContextHideSelf
} from "./irReadingContextSuppress"

function makeBlock(id: string | number, className = "orca-block"): HTMLElement {
  const el = document.createElement("div")
  el.className = className
  el.setAttribute("data-id", String(id))
  return el
}

describe("applyContextHideSelf", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("returns 0 for null root without throwing", () => {
    expect(applyContextHideSelf(null, 1)).toBe(0)
  })

  it("marks matching .orca-block[data-id] and returns count", () => {
    const root = document.createElement("div")
    const extract = makeBlock(10)
    const sibling = makeBlock(11)
    root.append(extract, sibling)

    const count = applyContextHideSelf(root, 10)

    expect(count).toBe(1)
    expect(extract.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
    expect(sibling.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(false)
  })

  it("accepts string hideBlockId matching data-id", () => {
    const root = document.createElement("div")
    const extract = makeBlock("42")
    root.appendChild(extract)

    expect(applyContextHideSelf(root, "42")).toBe(1)
    expect(extract.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
  })

  it("does not mark non-orca-block nodes with matching data-id", () => {
    const root = document.createElement("div")
    const other = makeBlock(5, "other-node")
    root.appendChild(other)

    expect(applyContextHideSelf(root, 5)).toBe(0)
    expect(other.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(false)
  })

  it("clears hide class from nodes that had it for a different id", () => {
    const root = document.createElement("div")
    const previous = makeBlock(1)
    const current = makeBlock(2)
    previous.classList.add(IR_CONTEXT_HIDE_CLASS)
    root.append(previous, current)

    const count = applyContextHideSelf(root, 2)

    expect(count).toBe(1)
    expect(previous.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(false)
    expect(current.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
  })

  it("clears hide class from non-matching or non-orca-block leftovers", () => {
    const root = document.createElement("div")
    const leftover = document.createElement("div")
    leftover.className = "wrapper"
    leftover.classList.add(IR_CONTEXT_HIDE_CLASS)
    leftover.setAttribute("data-id", "99")
    const target = makeBlock(99)
    root.append(leftover, target)

    const count = applyContextHideSelf(root, 99)

    expect(count).toBe(1)
    expect(leftover.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(false)
    expect(target.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
  })

  it("marks all matching descendants under root", () => {
    const root = document.createElement("div")
    const nested = document.createElement("div")
    const a = makeBlock(3)
    const b = makeBlock(3)
    nested.appendChild(a)
    root.append(nested, b)

    expect(applyContextHideSelf(root, 3)).toBe(2)
    expect(a.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
    expect(b.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
  })

  it("is idempotent when already marked", () => {
    const root = document.createElement("div")
    const extract = makeBlock(8)
    extract.classList.add(IR_CONTEXT_HIDE_CLASS)
    root.appendChild(extract)

    expect(applyContextHideSelf(root, 8)).toBe(1)
    expect(extract.classList.contains(IR_CONTEXT_HIDE_CLASS)).toBe(true)
  })
})
