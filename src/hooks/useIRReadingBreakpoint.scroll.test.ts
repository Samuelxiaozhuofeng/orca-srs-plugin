/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  resolveRestoreTarget,
  resetScrollContainerTop,
  scheduleBreakpointRestore,
  ScrollCaptureSuppression,
  shouldAllowScrollVisibleCapture,
  SCROLL_DEBOUNCE_MS
} from "./irBreakpointRestore"
import {
  resolveVerticalScrollOwner,
  subscribeToBreakpointScroll
} from "./irBreakpointViewport"

/**
 * 镜像 useIRReadingBreakpoint 的 scroll 门闩逻辑（可单测，不挂 React）。
 */
function wireScrollCapture(options: {
  scrollContainer: HTMLElement
  suppress: ScrollCaptureSuppression
  listeningForCardId: number
  getActiveCardId: () => number
  captureFromVisibleBlock: () => void
  scrollDebounceRef: { current: number | null }
}) {
  const clearDebounce = () => {
    if (options.scrollDebounceRef.current != null) {
      window.clearTimeout(options.scrollDebounceRef.current)
      options.scrollDebounceRef.current = null
    }
  }

  const onScroll = () => {
    if (options.suppress.isActive()) {
      clearDebounce()
      return
    }
    if (options.scrollDebounceRef.current != null) {
      window.clearTimeout(options.scrollDebounceRef.current)
    }
    options.scrollDebounceRef.current = window.setTimeout(() => {
      options.scrollDebounceRef.current = null
      if (!shouldAllowScrollVisibleCapture({
        suppressActive: options.suppress.isActive(),
        listeningForCardId: options.listeningForCardId,
        activeCardId: options.getActiveCardId()
      })) {
        return
      }
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().trim()) return
      options.captureFromVisibleBlock()
    }, SCROLL_DEBOUNCE_MS)
  }

  const unsubscribe = subscribeToBreakpointScroll(options.scrollContainer, onScroll)
  return {
    unsubscribe: () => {
      unsubscribe()
      clearDebounce()
    },
    clearDebounce
  }
}

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
    const suppress = new ScrollCaptureSuppression()
    const scrollDebounceRef = { current: null as number | null }

    const { unsubscribe } = wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: 1,
      getActiveCardId: () => 1,
      captureFromVisibleBlock,
      scrollDebounceRef
    })

    scrollContainer.dispatchEvent(new Event("scroll"))

    expect(captureFromVisibleBlock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)

    unsubscribe()
    scrollContainer.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)
  })

  it("does not let an old card scroll debounce capture after card switch cleanup", async () => {
    const captures: number[] = []
    const scrollContainer = document.createElement("div")
    const suppress = new ScrollCaptureSuppression()
    const scrollDebounceRef = { current: null as number | null }
    let activeCardId = 100

    const first = wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: 100,
      getActiveCardId: () => activeCardId,
      captureFromVisibleBlock: () => {
        captures.push(100)
      },
      scrollDebounceRef
    })

    scrollContainer.dispatchEvent(new Event("scroll"))

    // 切卡：卸监听 + 清 debounce + 切换 active
    first.unsubscribe()
    activeCardId = 200

    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captures).toEqual([])

    const second = wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: 200,
      getActiveCardId: () => activeCardId,
      captureFromVisibleBlock: () => {
        captures.push(200)
      },
      scrollDebounceRef
    })
    scrollContainer.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captures).toEqual([200])
    second.unsubscribe()
  })

  it("ignores stale debounce when active card id already changed", async () => {
    const captures: number[] = []
    const scrollContainer = document.createElement("div")
    const suppress = new ScrollCaptureSuppression()
    const scrollDebounceRef = { current: null as number | null }
    let activeCardId = 100

    wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: 100,
      getActiveCardId: () => activeCardId,
      captureFromVisibleBlock: () => {
        captures.push(100)
      },
      scrollDebounceRef
    })

    scrollContainer.dispatchEvent(new Event("scroll"))
    activeCardId = 200
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captures).toEqual([])
  })

  it("suppresses capture from programmatic reset while breakpoint target is delayed past SCROLL_DEBOUNCE_MS", async () => {
    const captureFromVisibleBlock = vi.fn()
    const scrollContainer = document.createElement("div") as HTMLElement & { scrollTop: number }
    scrollContainer.scrollTop = 900
    const content = document.createElement("div")
    const suppress = new ScrollCaptureSuppression()
    const scrollDebounceRef = { current: null as number | null }
    const cardId = 100
    const resumeId = 200

    const { clearDebounce } = wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: cardId,
      getActiveCardId: () => cardId,
      captureFromVisibleBlock,
      scrollDebounceRef
    })

    // 与 hook startRestore 一致：先 suppress，再 schedule restore（内部 reset）
    const token = suppress.begin()
    clearDebounce()
    let released = false
    const release = () => {
      if (released) return
      released = true
      suppress.end(token)
      clearDebounce()
    }

    const target = resolveRestoreTarget(cardId, null, resumeId)
    const scrollIntoView = vi.fn((el: HTMLElement) => {
      // 模拟恢复滚动
      scrollContainer.scrollTop = 120
      el.dispatchEvent?.(new Event("scroll"))
      scrollContainer.dispatchEvent(new Event("scroll"))
    })

    scheduleBreakpointRestore(target, {
      getContentContainer: () => content,
      getScrollContainer: () => scrollContainer,
      restoreSelection: vi.fn(async () => undefined),
      scrollIntoView,
      onSuccess: release,
      onFailure: release,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id),
      maxAttempts: 8
    })

    // 程序化归零会触发 scroll（jsdom 不自动触发，显式派发以模拟浏览器）
    expect(scrollContainer.scrollTop).toBe(0)
    scrollContainer.dispatchEvent(new Event("scroll"))

    // 目标块延迟 > SCROLL_DEBOUNCE_MS 才挂载
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS + 50)
    expect(captureFromVisibleBlock).not.toHaveBeenCalled()
    expect(suppress.isActive()).toBe(true)

    // 再等一轮 restore retry 仍未渲染
    await vi.advanceTimersByTimeAsync(250)
    expect(captureFromVisibleBlock).not.toHaveBeenCalled()

    // 目标出现，下次 tick 恢复
    const block = document.createElement("div")
    block.id = `block-${resumeId}`
    content.appendChild(block)

    await vi.advanceTimersByTimeAsync(260)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(suppress.isActive()).toBe(false)
    expect(captureFromVisibleBlock).not.toHaveBeenCalled()

    // 恢复完成后用户滚动可以捕获
    scrollContainer.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)
  })

  it("top-only enter releases suppression so later user scroll can capture", async () => {
    const captureFromVisibleBlock = vi.fn()
    const scrollContainer = document.createElement("div") as HTMLElement & { scrollTop: number }
    scrollContainer.scrollTop = 400
    const suppress = new ScrollCaptureSuppression()
    const scrollDebounceRef = { current: null as number | null }

    wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: 50,
      getActiveCardId: () => 50,
      captureFromVisibleBlock,
      scrollDebounceRef
    })

    const token = suppress.begin()
    let released = false
    const release = () => {
      if (released) return
      released = true
      suppress.end(token)
      if (scrollDebounceRef.current != null) {
        window.clearTimeout(scrollDebounceRef.current)
        scrollDebounceRef.current = null
      }
    }

    const target = resolveRestoreTarget(50, null, null)
    scheduleBreakpointRestore(target, {
      getContentContainer: () => document.createElement("div"),
      getScrollContainer: () => scrollContainer,
      restoreSelection: vi.fn(async () => undefined),
      scrollIntoView: vi.fn(),
      onSuccess: release,
      onFailure: release
    })

    expect(scrollContainer.scrollTop).toBe(0)
    expect(suppress.isActive()).toBe(false)

    scrollContainer.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)
  })

  it("failure releases suppression so capture is not stuck", async () => {
    const captureFromVisibleBlock = vi.fn()
    const scrollContainer = document.createElement("div")
    const suppress = new ScrollCaptureSuppression()
    const scrollDebounceRef = { current: null as number | null }

    wireScrollCapture({
      scrollContainer,
      suppress,
      listeningForCardId: 1,
      getActiveCardId: () => 1,
      captureFromVisibleBlock,
      scrollDebounceRef
    })

    const token = suppress.begin()
    const release = () => {
      suppress.end(token)
      if (scrollDebounceRef.current != null) {
        window.clearTimeout(scrollDebounceRef.current)
        scrollDebounceRef.current = null
      }
    }

    scheduleBreakpointRestore(resolveRestoreTarget(1, null, 99), {
      getContentContainer: () => document.createElement("div"),
      getScrollContainer: () => ({ scrollTop: 10 }),
      restoreSelection: vi.fn(async () => undefined),
      scrollIntoView: vi.fn(),
      onSuccess: release,
      onFailure: release,
      maxAttempts: 1,
      schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearSchedule: (id) => window.clearTimeout(id)
    })

    await vi.advanceTimersByTimeAsync(60)
    expect(suppress.isActive()).toBe(false)

    scrollContainer.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
    expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)
  })

  /**
   * Runtime: internal `.ir-reading__scroll` has overflow:auto but no range;
   * host editor ancestor is the real vertical scroll owner. Card-enter must
   * reset that ancestor and subscribe capture there — not only the internal node.
   */
  describe("host scroll owner resolution (card switch)", () => {
    function mockScrollMetrics(
      el: HTMLElement,
      metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number }
    ) {
      Object.defineProperty(el, "scrollHeight", {
        configurable: true,
        get: () => metrics.scrollHeight
      })
      Object.defineProperty(el, "clientHeight", {
        configurable: true,
        get: () => metrics.clientHeight
      })
      if (metrics.scrollTop != null) el.scrollTop = metrics.scrollTop
    }

    function buildConfirmedHostScrollShape() {
      const host = document.createElement("div")
      host.className = "orca-block-editor orca-hideable-editor srs-ir-host-panel-chrome-managed"
      host.style.overflowY = "scroll"

      const internal = document.createElement("div")
      internal.className = "ir-reading__scroll"
      internal.style.overflow = "auto"

      host.appendChild(internal)
      document.body.appendChild(host)

      mockScrollMetrics(internal, { scrollHeight: 6140, clientHeight: 6140, scrollTop: 0 })
      mockScrollMetrics(host, { scrollHeight: 6958, clientHeight: 768, scrollTop: 3961 })

      return { host, internal }
    }

    afterEach(() => {
      document.body.replaceChildren()
    })

    it("card-enter top-only resets the host ancestor, not merely the internal scroll node", () => {
      const { host, internal } = buildConfirmedHostScrollShape()
      expect(host.scrollTop).toBe(3961)
      expect(internal.scrollTop).toBe(0)

      const owner = resolveVerticalScrollOwner(internal)
      expect(owner).toBe(host)

      // Mirror startRestore + scheduleBreakpointRestore top-only path
      scheduleBreakpointRestore(resolveRestoreTarget(50, null, null), {
        getContentContainer: () => document.createElement("div"),
        getScrollContainer: () => resolveVerticalScrollOwner(internal),
        restoreSelection: vi.fn(async () => undefined),
        scrollIntoView: vi.fn()
      })

      expect(host.scrollTop).toBe(0)
      // Internal was already 0; wrong-target reset would leave host scrolled
      expect(internal.scrollTop).toBe(0)
    })

    it("card-enter with breakpoint resets host then restores target", async () => {
      const { host, internal } = buildConfirmedHostScrollShape()
      const content = document.createElement("div")
      const block = document.createElement("div")
      block.id = "block-200"
      content.appendChild(block)
      const order: string[] = []
      const scrollIntoView = vi.fn()

      scheduleBreakpointRestore(resolveRestoreTarget(100, null, 200), {
        getContentContainer: () => content,
        getScrollContainer: () => {
          const owner = resolveVerticalScrollOwner(internal)
          order.push(`reset@${owner?.scrollTop ?? "null"}`)
          return owner
        },
        restoreSelection: vi.fn(async () => undefined),
        scrollIntoView: (el) => {
          order.push("restore")
          scrollIntoView(el)
          if (host) host.scrollTop = 120
        },
        schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
        clearSchedule: (id) => window.clearTimeout(id)
      })

      expect(host.scrollTop).toBe(0)
      expect(order[0]).toBe("reset@3961")

      await vi.advanceTimersByTimeAsync(60)
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(order.indexOf("reset@3961")).toBeLessThan(order.indexOf("restore"))
    })

    it("subscribes capture to the resolved host owner, not the non-scrollable internal", async () => {
      const { host, internal } = buildConfirmedHostScrollShape()
      const captureFromVisibleBlock = vi.fn()
      const suppress = new ScrollCaptureSuppression()
      const scrollDebounceRef = { current: null as number | null }

      const owner = resolveVerticalScrollOwner(internal)
      expect(owner).toBe(host)

      const { unsubscribe } = wireScrollCapture({
        scrollContainer: owner!,
        suppress,
        listeningForCardId: 1,
        getActiveCardId: () => 1,
        captureFromVisibleBlock,
        scrollDebounceRef
      })

      // Scrolling the non-owner internal must not capture
      internal.dispatchEvent(new Event("scroll"))
      await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
      expect(captureFromVisibleBlock).not.toHaveBeenCalled()

      // Host scroll does capture
      host.dispatchEvent(new Event("scroll"))
      await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
      expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)

      unsubscribe()
    })

    it("programmatic host reset under suppression does not overwrite breakpoint via capture", async () => {
      const { host, internal } = buildConfirmedHostScrollShape()
      const captureFromVisibleBlock = vi.fn()
      const suppress = new ScrollCaptureSuppression()
      const scrollDebounceRef = { current: null as number | null }
      const cardId = 100
      const resumeId = 200

      const owner = resolveVerticalScrollOwner(internal)!
      const { clearDebounce } = wireScrollCapture({
        scrollContainer: owner,
        suppress,
        listeningForCardId: cardId,
        getActiveCardId: () => cardId,
        captureFromVisibleBlock,
        scrollDebounceRef
      })

      const token = suppress.begin()
      clearDebounce()
      let released = false
      const release = () => {
        if (released) return
        released = true
        suppress.end(token)
        clearDebounce()
      }

      const content = document.createElement("div")
      const block = document.createElement("div")
      block.id = `block-${resumeId}`
      content.appendChild(block)

      scheduleBreakpointRestore(resolveRestoreTarget(cardId, null, resumeId), {
        getContentContainer: () => content,
        getScrollContainer: () => resolveVerticalScrollOwner(internal),
        restoreSelection: vi.fn(async () => undefined),
        scrollIntoView: (el) => {
          host.scrollTop = 200
          host.dispatchEvent(new Event("scroll"))
          el.dispatchEvent?.(new Event("scroll"))
        },
        onSuccess: release,
        onFailure: release,
        schedule: (fn, delayMs) => window.setTimeout(fn, delayMs),
        clearSchedule: (id) => window.clearTimeout(id)
      })

      expect(host.scrollTop).toBe(0)
      host.dispatchEvent(new Event("scroll"))

      await vi.advanceTimersByTimeAsync(60)
      expect(suppress.isActive()).toBe(false)
      expect(captureFromVisibleBlock).not.toHaveBeenCalled()

      host.dispatchEvent(new Event("scroll"))
      await vi.advanceTimersByTimeAsync(SCROLL_DEBOUNCE_MS)
      expect(captureFromVisibleBlock).toHaveBeenCalledTimes(1)
    })

    it("still resets an actually scrollable internal element (no host owner needed)", () => {
      const internal = document.createElement("div")
      internal.className = "ir-reading__scroll"
      internal.style.overflow = "auto"
      mockScrollMetrics(internal, { scrollHeight: 2000, clientHeight: 500, scrollTop: 880 })
      document.body.appendChild(internal)

      expect(resolveVerticalScrollOwner(internal)).toBe(internal)
      resetScrollContainerTop(resolveVerticalScrollOwner(internal))
      expect(internal.scrollTop).toBe(0)
    })
  })
})
