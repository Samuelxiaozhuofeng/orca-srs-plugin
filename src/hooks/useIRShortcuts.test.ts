import { describe, expect, it } from "vitest"
import { shouldHandleEnter } from "./irShortcutRules"

describe("IR shortcut conflict rules", () => {
  it("does not steal Enter in editor without selection", () => {
    expect(shouldHandleEnter({
      hasSelection: false,
      focusInShell: false,
      isEditable: true,
      isInteractive: false,
      isComposing: false,
      eventInSessionRoot: true
    })).toBe(false)
  })

  it("handles Enter when text selection exists", () => {
    expect(shouldHandleEnter({
      hasSelection: true,
      focusInShell: false,
      isEditable: true,
      isInteractive: false,
      isComposing: false,
      eventInSessionRoot: true
    })).toBe(true)
  })

  it("disables during IME composition", () => {
    expect(shouldHandleEnter({
      hasSelection: true,
      focusInShell: true,
      isEditable: false,
      isInteractive: false,
      isComposing: true,
      eventInSessionRoot: true
    })).toBe(false)
  })

  it("ignores events outside session root without selection", () => {
    expect(shouldHandleEnter({
      hasSelection: false,
      focusInShell: false,
      isEditable: false,
      isInteractive: false,
      isComposing: false,
      eventInSessionRoot: false
    })).toBe(false)
  })

  it("handles Enter when focus is in session shell", () => {
    expect(shouldHandleEnter({
      hasSelection: false,
      focusInShell: true,
      isEditable: false,
      isInteractive: false,
      isComposing: false,
      eventInSessionRoot: true
    })).toBe(true)
  })

  it("does not steal Enter from an interactive control", () => {
    expect(shouldHandleEnter({
      hasSelection: false,
      focusInShell: false,
      isEditable: false,
      isInteractive: true,
      isComposing: false,
      eventInSessionRoot: true
    })).toBe(false)
  })
})
