/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  IR_STB_CARD_ATTR,
  IR_STB_CURRENT_BODY_ATTR,
  IR_STB_DISMISSING_CLASS,
  IR_STB_SCOPE_CLASS,
  IR_STB_STYLE_ELEMENT_ID,
  getIRSelectionToolbarControllerPluginName,
  isIRSelectionToolbarControllerStarted,
  isSelectionNodeInCurrentCardBody,
  notifyIRSelectionToolbarSettingsChanged,
  resolveIRSelectionToolbarScope,
  startIRSelectionToolbarController,
  stopIRSelectionToolbarController
} from "./irSelectionToolbarController"
import {
  IR_TOOLBAR_ACTION_MARKER_CLASS,
  clearIRSelectionToolbarPrefsCache,
  saveIRSelectionToolbarSettings,
  getDefaultIRSelectionToolbarSettings
} from "../settings/irSelectionToolbarSettings"

function selectContents(id: string): Selection {
  const el = document.getElementById(id)!
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  return sel
}

describe("irSelectionToolbarController", () => {
  beforeEach(() => {
    document.documentElement.className = ""
    document.documentElement.removeAttribute(IR_STB_CARD_ATTR)
    document.documentElement.removeAttribute(IR_STB_CURRENT_BODY_ATTR)
    document.documentElement.classList.remove(IR_STB_DISMISSING_CLASS)
    document.getElementById(IR_STB_STYLE_ELEMENT_ID)?.remove()
    document.body.innerHTML = ""
    clearIRSelectionToolbarPrefsCache()
    stopIRSelectionToolbarController()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      plugins: {
        setData: vi.fn(async () => {}),
        getData: vi.fn(async () => null)
      }
    }
  })

  afterEach(() => {
    stopIRSelectionToolbarController()
    clearIRSelectionToolbarPrefsCache()
    delete (globalThis as unknown as { orca?: unknown }).orca
    vi.restoreAllMocks()
  })

  it("resolveIRSelectionToolbarScope: outside IR / collapsed → no scope", () => {
    document.body.innerHTML = `<div class="page"><p id="t">hello world</p></div>`
    const sel = selectContents("t")
    expect(resolveIRSelectionToolbarScope(sel).inIRScope).toBe(false)

    const p = document.getElementById("t")!
    sel.collapse(p, 0)
    expect(resolveIRSelectionToolbarScope(sel).inIRScope).toBe(false)
    expect(resolveIRSelectionToolbarScope(null).inIRScope).toBe(false)
  })

  it("fail-closed: mixed-review without data-ir-card-type → no scope", () => {
    document.body.innerHTML = `
      <div class="ir-reading ir-reading--mixed-review">
        <div class="ir-reading__scroll">
          <p id="mixed">review card text selection</p>
        </div>
      </div>
    `
    const scope = resolveIRSelectionToolbarScope(selectContents("mixed"))
    expect(scope.inIRScope).toBe(false)
    expect(scope.cardType).toBeNull()
    expect(scope.inCurrentCardBody).toBe(false)
  })

  it("fail-closed: .ir-reading with invalid card type → no scope", () => {
    document.body.innerHTML = `
      <div class="ir-reading" data-ir-card-type="review">
        <div class="ir-reading__body" data-ir-body-block="1"><p id="x">text</p></div>
      </div>
    `
    expect(resolveIRSelectionToolbarScope(selectContents("x")).inIRScope).toBe(
      false
    )
  })

  it("resolveIRSelectionToolbarScope: current body with matching card id", () => {
    document.body.innerHTML = `
      <div class="ir-reading" data-ir-card-type="extract" data-ir-card-id="42">
        <div class="ir-reading__body" data-ir-body-block="42">
          <div class="orca-block" data-id="42"><p id="body">extract body text</p></div>
        </div>
      </div>
    `
    const scope = resolveIRSelectionToolbarScope(selectContents("body"))
    expect(scope.inIRScope).toBe(true)
    expect(scope.cardType).toBe("extract")
    expect(scope.inCurrentCardBody).toBe(true)
  })

  it("resolveIRSelectionToolbarScope: near context is not current card body", () => {
    document.body.innerHTML = `
      <div class="ir-reading" data-ir-card-type="extract" data-ir-card-id="42">
        <div class="ir-reading__context">
          <div class="orca-block" data-id="10"><p id="ctx">parent context text</p></div>
        </div>
        <div class="ir-reading__body" data-ir-body-block="42">
          <p id="body">extract body text</p>
        </div>
      </div>
    `
    const scope = resolveIRSelectionToolbarScope(selectContents("ctx"))
    expect(scope.inIRScope).toBe(true)
    expect(scope.cardType).toBe("extract")
    expect(scope.inCurrentCardBody).toBe(false)
  })

  it("resolveIRSelectionToolbarScope: chapter browse body block ≠ card id", () => {
    document.body.innerHTML = `
      <div class="ir-reading" data-ir-card-type="extract" data-ir-card-id="42">
        <div class="ir-reading__body" data-ir-body-block="7">
          <p id="browse">ancestor chapter body for browse</p>
        </div>
      </div>
    `
    const scope = resolveIRSelectionToolbarScope(selectContents("browse"))
    expect(scope.inIRScope).toBe(true)
    expect(scope.cardType).toBe("extract")
    expect(scope.inCurrentCardBody).toBe(false)
  })

  it("isSelectionNodeInCurrentCardBody allows nested descendants in body", () => {
    document.body.innerHTML = `
      <div class="ir-reading" data-ir-card-type="topic" data-ir-card-id="9" id="root">
        <div class="ir-reading__body" data-ir-body-block="9">
          <div class="orca-block"><span id="deep">nested</span></div>
        </div>
      </div>
    `
    const root = document.getElementById("root")!
    const deep = document.getElementById("deep")!
    expect(isSelectionNodeInCurrentCardBody(root, deep)).toBe(true)
    expect(isSelectionNodeInCurrentCardBody(root, deep.firstChild)).toBe(true)
  })

  it("start injects style; stop removes style and scope attrs", async () => {
    startIRSelectionToolbarController("orca-srs")
    expect(isIRSelectionToolbarControllerStarted()).toBe(true)
    expect(getIRSelectionToolbarControllerPluginName()).toBe("orca-srs")

    const style = document.getElementById(IR_STB_STYLE_ELEMENT_ID)
    expect(style).toBeTruthy()
    expect(style?.textContent).toContain("html.ir-stb-scope")
    expect(style?.textContent).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu)

    document.documentElement.classList.add(IR_STB_SCOPE_CLASS)
    document.documentElement.setAttribute(IR_STB_CARD_ATTR, "topic")
    document.documentElement.setAttribute(IR_STB_CURRENT_BODY_ATTR, "1")

    stopIRSelectionToolbarController()
    expect(isIRSelectionToolbarControllerStarted()).toBe(false)
    expect(document.getElementById(IR_STB_STYLE_ELEMENT_ID)).toBeNull()
    expect(document.documentElement.classList.contains(IR_STB_SCOPE_CLASS)).toBe(
      false
    )
    expect(document.documentElement.hasAttribute(IR_STB_CARD_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(IR_STB_CURRENT_BODY_ATTR)).toBe(
      false
    )
    expect(
      document.documentElement.classList.contains(IR_STB_DISMISSING_CLASS)
    ).toBe(false)
  })

  it("pointerdown outside toolbar hides the complete popup immediately", () => {
    document.body.innerHTML = `
      <div class="orca-popup orca-editor-toolbar">
        <div class="orca-editor-toolbar-bar"><button id="tool">tool</button></div>
      </div>
      <div id="outside">outside</div>
    `
    startIRSelectionToolbarController("orca-srs")
    document.documentElement.classList.add(IR_STB_SCOPE_CLASS)

    document.getElementById("outside")!.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true })
    )

    expect(
      document.documentElement.classList.contains(IR_STB_DISMISSING_CLASS)
    ).toBe(true)
  })

  it("pointerdown inside toolbar does not dismiss before its command click", () => {
    document.body.innerHTML = `
      <div class="orca-popup orca-editor-toolbar">
        <div class="orca-editor-toolbar-bar"><button id="tool">tool</button></div>
      </div>
    `
    startIRSelectionToolbarController("orca-srs")
    document.documentElement.classList.add(IR_STB_SCOPE_CLASS)

    document.getElementById("tool")!.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true })
    )

    expect(
      document.documentElement.classList.contains(IR_STB_DISMISSING_CLASS)
    ).toBe(false)
  })

  it("notify after save refreshes CSS content with markers", async () => {
    startIRSelectionToolbarController("orca-srs")
    const before = document.getElementById(IR_STB_STYLE_ELEMENT_ID)?.textContent ?? ""
    expect(before).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu)

    const next = getDefaultIRSelectionToolbarSettings()
    next.actions.aiMenu = true
    await saveIRSelectionToolbarSettings("orca-srs", next)
    notifyIRSelectionToolbarSettingsChanged("orca-srs")

    const after = document.getElementById(IR_STB_STYLE_ELEMENT_ID)?.textContent ?? ""
    const globalAiHide = new RegExp(
      `html\\.ir-stb-scope(?!\\[)[^{]*${IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu}[^{]*\\{display:none`
    )
    expect(globalAiHide.test(before)).toBe(true)
    expect(globalAiHide.test(after)).toBe(false)
  })
})
