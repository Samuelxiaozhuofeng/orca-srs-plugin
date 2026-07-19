import { describe, expect, it } from "vitest"

/**
 * Pure state model for busy vs finish-and-close (WP-11 regression).
 * Mirrors WebImportDialogMount: handleClose blocks while working;
 * success uses finishAndClose which clears busy then closes.
 */
function createCloseState() {
  let isWorking = false
  let isOpen = true
  return {
    setWorking(v: boolean) {
      isWorking = v
    },
    handleClose() {
      if (isWorking) return false
      isOpen = false
      return true
    },
    finishAndClose() {
      isWorking = false
      isOpen = false
      return true
    },
    get open() {
      return isOpen
    },
    get working() {
      return isWorking
    }
  }
}

describe("web import dialog close policy", () => {
  it("does not close while working via handleClose", () => {
    const s = createCloseState()
    s.setWorking(true)
    expect(s.handleClose()).toBe(false)
    expect(s.open).toBe(true)
  })

  it("finishAndClose succeeds after import even if still marked working", () => {
    const s = createCloseState()
    s.setWorking(true)
    expect(s.finishAndClose()).toBe(true)
    expect(s.open).toBe(false)
    expect(s.working).toBe(false)
  })
})
