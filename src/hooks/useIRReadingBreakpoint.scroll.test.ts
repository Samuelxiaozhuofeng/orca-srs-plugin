/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { subscribeToBreakpointScroll } from "./irBreakpointViewport"

const SCROLL_DEBOUNCE_MS = 280

describe("useIRReadingBreakpoint scroll capture wiring", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("debounces visible-block capture when the scroll container scrolls", async () => {
    const captureFromVisibleBlock = vi.fn()
    const scrollContainer = document.createElement("div")
    let scrollDebounceRef: number | null = null

    const onScroll = () => {
      if (scrollDebounceRef != null) window.clearTimeout(scrollDebounceRef)
      scrollDebounceRef = window.setTimeout(() => {
        scrollDebounceRef = null
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed && sel.toString().trim()) return
        captureFromVisibleBlock()
      }, SCROLL_DEBOUNCE_MS)
    }

    const unsubscribe = subscribeToBreakpointScroll(scrollContainer, onScroll)
    scrollContainer.dispatchEvent(new Event("scroll"))

    expect(captureFromVisibleBlock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)

    unsubscribe()
    scrollContainer.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)
  })
})
