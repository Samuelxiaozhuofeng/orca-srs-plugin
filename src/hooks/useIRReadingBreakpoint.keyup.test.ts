/**
 * @vitest-environment jsdom
 *
 * 回归：IR 阅读断点 keyup 捕获 debounce 的切卡竞态。
 * keydown「下一篇」flush 正确断点后，keyup 会重新 scheduleCapture 武装 180ms
 * 定时器（闭包携带旧 cardId）；定时器到期时 DOM 已切到新卡，若无守卫会把
 * 新卡可见块持久化为旧卡 resumeBlockId，覆盖 flush 刚写入的正确断点。
 * 修复为双层防线：cardId 变化时清 debounce + captureNow 入口卡片一致性守卫。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  INTERACTIVE_CAPTURE_DEBOUNCE_MS,
  shouldAllowInteractiveCapture
} from "./irBreakpointInteractiveCapture"

/**
 * 镜像 useIRReadingBreakpoint 的交互捕获接线（scheduleCapture / flush /
 * captureNow 守卫 / cardId 变化 cleanup），可单测、不挂 React。
 */
function wireInteractiveCapture(options: {
  closureCardId: number
  activeCardIdRef: { current: number | null }
  debounceRef: { current: number | null }
  /** 模拟当前 DOM 可见块（切卡后指向新卡内容） */
  getVisibleBlockId: () => number | null
  /** cardId -> resumeBlockId，模拟 persist 落库 */
  persisted: Map<number, number>
}) {
  const captureNow = () => {
    // 与 hook captureNow / captureFromVisibleBlock 相同的入口守卫
    if (!shouldAllowInteractiveCapture({
      closureCardId: options.closureCardId,
      activeCardId: options.activeCardIdRef.current
    })) {
      return
    }
    const blockId = options.getVisibleBlockId()
    if (blockId == null) return
    options.persisted.set(options.closureCardId, blockId)
  }

  const scheduleCapture = () => {
    if (options.debounceRef.current != null) {
      window.clearTimeout(options.debounceRef.current)
    }
    options.debounceRef.current = window.setTimeout(() => {
      options.debounceRef.current = null
      captureNow()
    }, INTERACTIVE_CAPTURE_DEBOUNCE_MS)
  }

  const flush = () => {
    if (options.debounceRef.current != null) {
      window.clearTimeout(options.debounceRef.current)
      options.debounceRef.current = null
    }
    captureNow()
  }

  /** 镜像 hook 内 cardId 变化 effect 的 cleanup：切卡时清掉旧卡交互 debounce */
  const clearDebounceOnCardExit = () => {
    if (options.debounceRef.current != null) {
      window.clearTimeout(options.debounceRef.current)
      options.debounceRef.current = null
    }
  }

  return { captureNow, scheduleCapture, flush, clearDebounceOnCardExit }
}

describe("shouldAllowInteractiveCapture", () => {
  it("allows capture only when closure card matches the active card", () => {
    expect(shouldAllowInteractiveCapture({ closureCardId: 100, activeCardId: 100 })).toBe(true)
    expect(shouldAllowInteractiveCapture({ closureCardId: 100, activeCardId: 200 })).toBe(false)
  })

  it("rejects when either side is null (session ended or no card)", () => {
    expect(shouldAllowInteractiveCapture({ closureCardId: null, activeCardId: 100 })).toBe(false)
    expect(shouldAllowInteractiveCapture({ closureCardId: 100, activeCardId: null })).toBe(false)
    expect(shouldAllowInteractiveCapture({ closureCardId: null, activeCardId: null })).toBe(false)
  })
})

describe("useIRReadingBreakpoint keyup capture race (card switch)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stale keyup debounce firing after card switch does not write the new card's block into the old card", async () => {
    const persisted = new Map<number, number>()
    const activeCardIdRef = { current: 100 as number | null }
    const debounceRef = { current: null as number | null }
    let domVisibleBlockId = 1001 // 旧卡可见块

    const oldCard = wireInteractiveCapture({
      closureCardId: 100,
      activeCardIdRef,
      debounceRef,
      getVisibleBlockId: () => domVisibleBlockId,
      persisted
    })

    // keydown「下一篇」：flush 写入旧卡正确断点
    oldCard.flush()
    expect(persisted.get(100)).toBe(1001)

    // keyup 冒泡到会话根：重新武装 debounce（闭包仍是旧 cardId）
    oldCard.scheduleCapture()

    // 本地后端 < 180ms 完成切卡：活动卡与 DOM 都已是新卡。
    // 故意不跑 cardId 变化 cleanup —— 单测入口守卫这道兜底防线。
    activeCardIdRef.current = 200
    domVisibleBlockId = 2001

    await vi.advanceTimersByTimeAsync(INTERACTIVE_CAPTURE_DEBOUNCE_MS)

    // 守卫丢弃过期捕获：旧卡断点保持 flush 写入的正确值，新卡块未被写入旧卡
    expect(persisted.get(100)).toBe(1001)
    expect(persisted.has(200)).toBe(false)
    expect(debounceRef.current).toBeNull()
  })

  it("card-switch cleanup clears the stale debounce before it can fire", async () => {
    const persisted = new Map<number, number>()
    const activeCardIdRef = { current: 100 as number | null }
    const debounceRef = { current: null as number | null }
    let captureAttempts = 0

    const oldCard = wireInteractiveCapture({
      closureCardId: 100,
      activeCardIdRef,
      debounceRef,
      getVisibleBlockId: () => {
        captureAttempts += 1
        return 2001
      },
      persisted
    })

    oldCard.scheduleCapture()
    expect(debounceRef.current).not.toBeNull()

    // 切卡：cardId 变化 effect cleanup 清掉旧卡 debounce
    oldCard.clearDebounceOnCardExit()
    activeCardIdRef.current = 200

    await vi.advanceTimersByTimeAsync(INTERACTIVE_CAPTURE_DEBOUNCE_MS)
    expect(captureAttempts).toBe(0)
    expect(persisted.size).toBe(0)
  })

  it("session end (active card null) also discards a stale debounce capture", async () => {
    const persisted = new Map<number, number>()
    const activeCardIdRef = { current: 100 as number | null }
    const debounceRef = { current: null as number | null }

    const card = wireInteractiveCapture({
      closureCardId: 100,
      activeCardIdRef,
      debounceRef,
      getVisibleBlockId: () => 3001,
      persisted
    })

    card.scheduleCapture()
    activeCardIdRef.current = null

    await vi.advanceTimersByTimeAsync(INTERACTIVE_CAPTURE_DEBOUNCE_MS)
    expect(persisted.size).toBe(0)
  })

  it("mouse path stays intact: mouseup schedules, click-flush clears the timer and captures once for the same card", async () => {
    const persisted = new Map<number, number>()
    const activeCardIdRef = { current: 100 as number | null }
    const debounceRef = { current: null as number | null }
    let captureCount = 0

    const card = wireInteractiveCapture({
      closureCardId: 100,
      activeCardIdRef,
      debounceRef,
      getVisibleBlockId: () => {
        captureCount += 1
        return 1005
      },
      persisted
    })

    // mouseup 先 scheduleCapture，click handler 随后 flush（清定时器 + 立即捕获）
    card.scheduleCapture()
    card.flush()
    expect(persisted.get(100)).toBe(1005)
    expect(captureCount).toBe(1)
    expect(debounceRef.current).toBeNull()

    // 定时器已被 flush 清掉，不会二次捕获
    await vi.advanceTimersByTimeAsync(INTERACTIVE_CAPTURE_DEBOUNCE_MS)
    expect(captureCount).toBe(1)
  })

  it("keyup without a card switch still captures after the debounce", async () => {
    const persisted = new Map<number, number>()
    const activeCardIdRef = { current: 100 as number | null }
    const debounceRef = { current: null as number | null }

    const card = wireInteractiveCapture({
      closureCardId: 100,
      activeCardIdRef,
      debounceRef,
      getVisibleBlockId: () => 1002,
      persisted
    })

    card.scheduleCapture()
    expect(persisted.size).toBe(0)

    await vi.advanceTimersByTimeAsync(INTERACTIVE_CAPTURE_DEBOUNCE_MS)
    expect(persisted.get(100)).toBe(1002)
  })
})
