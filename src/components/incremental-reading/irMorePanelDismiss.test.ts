/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import {
  resolveEventElement,
  shouldDismissIRImportancePanel,
  shouldDismissIRMorePanel
} from "./irMorePanelDismiss"

function el(tag: string, attrs: Record<string, string> = {}, parent?: HTMLElement): HTMLElement {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v
    else if (k === "text") node.textContent = v
    else node.setAttribute(k, v)
  }
  parent?.appendChild(node)
  return node
}

describe("shouldDismissIRMorePanel", () => {
  it("keeps open for clicks inside .ir-reading__more", () => {
    const panel = el("div", { class: "ir-reading__more" })
    const button = el("button", { text: "推后…" }, panel)
    expect(shouldDismissIRMorePanel(button)).toBe(false)
    expect(shouldDismissIRMorePanel(panel)).toBe(false)
  })

  it("keeps open for the more toggle control (data-ir-more-toggle)", () => {
    const footer = el("div", { class: "ir-reading__footer" })
    const toggle = el(
      "button",
      {
        "data-ir-more-toggle": "",
        "aria-expanded": "true",
        "aria-label": "收起更多操作"
      },
      footer
    )
    expect(shouldDismissIRMorePanel(toggle)).toBe(false)
  })

  it("dismisses when only aria-expanded is set (importance also uses aria-expanded)", () => {
    const footer = el("div", { class: "ir-reading__footer" })
    const importanceToggle = el(
      "button",
      {
        "data-ir-importance-toggle": "",
        "aria-expanded": "false",
        "aria-label": "重要性"
      },
      footer
    )
    expect(shouldDismissIRMorePanel(importanceToggle)).toBe(true)
  })

  it("dismisses for clicks on reading content outside the panel", () => {
    const body = el("div", { class: "ir-reading__body" })
    const p = el("p", { text: "正文" }, body)
    expect(shouldDismissIRMorePanel(p)).toBe(true)
  })

  it("dismisses for other footer action buttons", () => {
    const footer = el("div", { class: "ir-reading__footer" })
    const next = el("button", { "aria-label": "下一篇" }, footer)
    expect(shouldDismissIRMorePanel(next)).toBe(true)
  })

  it("keeps open for Orca floating UI roles (ConfirmBox / modal portals)", () => {
    const dialog = el("div", { role: "dialog" })
    const confirm = el("button", { text: "确认" }, dialog)
    expect(shouldDismissIRMorePanel(confirm)).toBe(false)

    const menu = el("div", { role: "menu" })
    expect(shouldDismissIRMorePanel(el("button", { text: "项" }, menu))).toBe(false)
  })

  it("dismisses when target is null", () => {
    expect(shouldDismissIRMorePanel(null)).toBe(true)
  })
})

describe("shouldDismissIRImportancePanel", () => {
  it("keeps open for clicks inside .ir-reading__importance", () => {
    const panel = el("div", { class: "ir-reading__importance" })
    const button = el("button", { text: "更重要了" }, panel)
    expect(shouldDismissIRImportancePanel(button)).toBe(false)
    expect(shouldDismissIRImportancePanel(panel)).toBe(false)
  })

  it("keeps open for the importance toggle", () => {
    const footer = el("div", { class: "ir-reading__footer" })
    const toggle = el(
      "button",
      {
        "data-ir-importance-toggle": "",
        "aria-expanded": "true",
        "aria-label": "重要性"
      },
      footer
    )
    expect(shouldDismissIRImportancePanel(toggle)).toBe(false)
  })

  it("dismisses for more toggle and content clicks", () => {
    const footer = el("div", { class: "ir-reading__footer" })
    const more = el("button", { "data-ir-more-toggle": "", "aria-label": "更多操作" }, footer)
    expect(shouldDismissIRImportancePanel(more)).toBe(true)

    const body = el("div", { class: "ir-reading__body" })
    expect(shouldDismissIRImportancePanel(el("p", { text: "正文" }, body))).toBe(true)
  })

  it("dismisses when target is null", () => {
    expect(shouldDismissIRImportancePanel(null)).toBe(true)
  })
})

describe("resolveEventElement", () => {
  it("resolves text nodes to their parent element", () => {
    const span = el("span", { text: "hello" })
    const text = span.firstChild
    expect(text).toBeTruthy()
    expect(resolveEventElement(text)).toBe(span)
  })
})
