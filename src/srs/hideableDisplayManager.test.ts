/**
 * @vitest-environment jsdom
 *
 * Regression: Orca `.orca-hideable-hidden` can keep inline display:flex and still paint
 * under content-visibility. attachHideableDisplayManager must force display:none while
 * hidden and restore the prior inline display on show / cleanup.
 */

import { afterEach, describe, expect, it } from "vitest"
import { attachHideableDisplayManager } from "./hideableDisplayManager"

const MANAGED_ATTR = "data-srs-hideable-display-managed"

/** MutationObserver delivers async; yield a turn so attribute/childList handlers run. */
async function flushObserver(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function buildPanelWithHideable(options?: {
  hidden?: boolean
  display?: string
}): { panel: HTMLElement; hideable: HTMLElement; root: HTMLElement } {
  const panel = document.createElement("div")
  panel.className = "orca-panel"
  const hideable = document.createElement("div")
  hideable.className = options?.hidden
    ? "orca-hideable orca-hideable-hidden"
    : "orca-hideable"
  if (options?.display !== undefined) {
    hideable.style.display = options.display
  }
  const root = document.createElement("div")
  root.className = "ir-workspace"
  hideable.appendChild(root)
  panel.appendChild(hideable)
  document.body.appendChild(panel)
  return { panel, hideable, root }
}

describe("attachHideableDisplayManager", () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop()
      cleanup?.()
    }
    document.body.replaceChildren()
  })

  it("on attach, already-hidden hideable with inline flex becomes display none", () => {
    const { hideable, root } = buildPanelWithHideable({
      hidden: true,
      display: "flex"
    })

    const cleanup = attachHideableDisplayManager(root)
    cleanups.push(cleanup)

    expect(hideable.style.display).toBe("none")
    expect(hideable.getAttribute(MANAGED_ATTR)).toBe("1")
  })

  it("when visible flex hideable becomes hidden, display becomes none", async () => {
    const { hideable, root } = buildPanelWithHideable({
      hidden: false,
      display: "flex"
    })

    const cleanup = attachHideableDisplayManager(root)
    cleanups.push(cleanup)

    expect(hideable.style.display).toBe("flex")
    expect(hideable.hasAttribute(MANAGED_ATTR)).toBe(false)

    hideable.classList.add("orca-hideable-hidden")
    await flushObserver()

    expect(hideable.style.display).toBe("none")
    expect(hideable.getAttribute(MANAGED_ATTR)).toBe("1")
  })

  it("when managed hideable becomes visible again, restores prior inline flex", async () => {
    const { hideable, root } = buildPanelWithHideable({
      hidden: false,
      display: "flex"
    })

    const cleanup = attachHideableDisplayManager(root)
    cleanups.push(cleanup)

    hideable.classList.add("orca-hideable-hidden")
    await flushObserver()
    expect(hideable.style.display).toBe("none")
    expect(hideable.getAttribute(MANAGED_ATTR)).toBe("1")

    hideable.classList.remove("orca-hideable-hidden")
    await flushObserver()

    expect(hideable.style.display).toBe("flex")
    expect(hideable.hasAttribute(MANAGED_ATTR)).toBe(false)
  })

  it("cleanup restores display and stops managing further class toggles", async () => {
    const { hideable, root } = buildPanelWithHideable({
      hidden: false,
      display: "flex"
    })

    const cleanup = attachHideableDisplayManager(root)

    hideable.classList.add("orca-hideable-hidden")
    await flushObserver()
    expect(hideable.style.display).toBe("none")
    expect(hideable.getAttribute(MANAGED_ATTR)).toBe("1")

    cleanup()

    expect(hideable.style.display).toBe("flex")
    expect(hideable.hasAttribute(MANAGED_ATTR)).toBe(false)

    hideable.classList.remove("orca-hideable-hidden")
    hideable.classList.add("orca-hideable-hidden")
    await flushObserver()

    // No longer managed: display stays whatever Orca left (still flex here).
    expect(hideable.style.display).toBe("flex")
    expect(hideable.hasAttribute(MANAGED_ATTR)).toBe(false)
  })

  it("returns no-op cleanup when root is outside .orca-panel", () => {
    const root = document.createElement("div")
    document.body.appendChild(root)
    const cleanup = attachHideableDisplayManager(root)
    expect(() => cleanup()).not.toThrow()
  })
})
