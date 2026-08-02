import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const collectReviewCards = vi.fn()
const calculateDeckStats = vi.fn()
const calculateHomeStats = vi.fn()

vi.mock("./cardCollector", () => ({
  collectReviewCards: (...args: unknown[]) => collectReviewCards(...args)
}))

vi.mock("./deckUtils", () => ({
  calculateDeckStats: (...args: unknown[]) => calculateDeckStats(...args),
  calculateHomeStats: (...args: unknown[]) => calculateHomeStats(...args)
}))

import {
  FLASH_HOME_DATA_TTL_MS,
  getFlashHomeDataCacheSnapshot,
  invalidateFlashHomeDataCache,
  loadFlashHomeData
} from "./flashHomeDataLoader"

const deckStats = {
  decks: [],
  totalCards: 1,
  totalNew: 0,
  totalOverdue: 0
}

const todayStats = {
  pendingCount: 0,
  todayCount: 0,
  newCount: 0,
  totalCount: 1
}

describe("flashHomeDataLoader", () => {
  beforeEach(() => {
    invalidateFlashHomeDataCache()
    collectReviewCards.mockReset()
    calculateDeckStats.mockReset()
    calculateHomeStats.mockReset()
    collectReviewCards.mockResolvedValue([{ id: 1 }])
    calculateDeckStats.mockReturnValue(deckStats)
    calculateHomeStats.mockReturnValue(todayStats)
  })

  afterEach(() => {
    invalidateFlashHomeDataCache()
  })

  it("collects once and serves TTL cache", async () => {
    const a = await loadFlashHomeData({ pluginName: "t" })
    const b = await loadFlashHomeData({ pluginName: "t" })
    expect(a.fromCache).toBe(false)
    expect(b.fromCache).toBe(true)
    expect(collectReviewCards).toHaveBeenCalledTimes(1)
    expect(b.todayStats).toEqual(todayStats)
  })

  it("force bypasses TTL", async () => {
    await loadFlashHomeData({ pluginName: "t" })
    const forced = await loadFlashHomeData({ pluginName: "t", force: true })
    expect(forced.fromCache).toBe(false)
    expect(collectReviewCards).toHaveBeenCalledTimes(2)
  })

  it("dedupes concurrent loads", async () => {
    let resolveCollect!: (v: unknown) => void
    collectReviewCards.mockReturnValue(
      new Promise((resolve) => {
        resolveCollect = resolve
      })
    )

    const p1 = loadFlashHomeData({ pluginName: "t", force: true })
    const p2 = loadFlashHomeData({ pluginName: "t", force: true })
    resolveCollect([{ id: 2 }])
    const [r1, r2] = await Promise.all([p1, p2])
    expect(collectReviewCards).toHaveBeenCalledTimes(1)
    expect(r1.cards).toEqual(r2.cards)
  })

  it("invalidate clears cache", async () => {
    await loadFlashHomeData({ pluginName: "t" })
    expect(getFlashHomeDataCacheSnapshot()).not.toBeNull()
    invalidateFlashHomeDataCache()
    expect(getFlashHomeDataCacheSnapshot()).toBeNull()
    await loadFlashHomeData({ pluginName: "t" })
    expect(collectReviewCards).toHaveBeenCalledTimes(2)
  })

  it("exposes TTL constant", () => {
    expect(FLASH_HOME_DATA_TTL_MS).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// includeSuspended：一轮收集分出 active / suspended，统计不含暂停
// ---------------------------------------------------------------------------

describe("flashHomeDataLoader includeSuspended", () => {
  beforeEach(() => {
    invalidateFlashHomeDataCache()
    collectReviewCards.mockReset()
    calculateDeckStats.mockReset()
    calculateHomeStats.mockReset()
  })

  afterEach(() => {
    invalidateFlashHomeDataCache()
  })

  it("includeSuspended=true 时按 isSuspended 分组，统计只基于 active 卡", async () => {
    const active = { id: 1, deck: "d", isNew: true }
    const suspended = { id: 2, deck: "d", isSuspended: true }
    collectReviewCards.mockResolvedValue([active, suspended, { id: 3, deck: "d", isSuspended: true }])
    calculateDeckStats.mockReturnValue(deckStats)
    calculateHomeStats.mockReturnValue(todayStats)

    const data = await loadFlashHomeData({ pluginName: "t", includeSuspended: true })

    expect(collectReviewCards).toHaveBeenCalledWith("t", { includeSuspended: true })
    expect(data.cards).toEqual([active])
    expect(data.suspendedCards).toEqual([suspended, { id: 3, deck: "d", isSuspended: true }])
    expect(calculateDeckStats).toHaveBeenCalledWith([active])
    expect(calculateHomeStats).toHaveBeenCalledWith([active])
  })

  it("includeSuspended=false 时不传 includeSuspended 给收集器（历史行为）", async () => {
    collectReviewCards.mockResolvedValue([{ id: 1 }])
    calculateDeckStats.mockReturnValue(deckStats)
    calculateHomeStats.mockReturnValue(todayStats)

    const data = await loadFlashHomeData({ pluginName: "t" })
    expect(collectReviewCards).toHaveBeenCalledWith("t", { includeSuspended: false })
    expect(data.suspendedCards).toEqual([])
    expect(data.cards).toEqual([{ id: 1 }])
  })

  it("includeSuspended 缓存条目只对同 key 命中", async () => {
    collectReviewCards.mockResolvedValue([{ id: 1 }])
    calculateDeckStats.mockReturnValue(deckStats)
    calculateHomeStats.mockReturnValue(todayStats)

    await loadFlashHomeData({ pluginName: "t", includeSuspended: true })
    const cached = await loadFlashHomeData({ pluginName: "t", includeSuspended: true })
    expect(cached.fromCache).toBe(true)
    expect(collectReviewCards).toHaveBeenCalledTimes(1)

    // 不同 key 不命中该缓存条目
    await loadFlashHomeData({ pluginName: "t" })
    expect(collectReviewCards).toHaveBeenCalledTimes(2)
  })

  it("同 key 并发去重：共享同一 inflight", async () => {
    let resolveCollect!: (v: unknown) => void
    collectReviewCards.mockReturnValue(
      new Promise((resolve) => {
        resolveCollect = resolve
      })
    )
    calculateDeckStats.mockReturnValue(deckStats)
    calculateHomeStats.mockReturnValue(todayStats)

    const p1 = loadFlashHomeData({ pluginName: "t", force: true, includeSuspended: true })
    const p2 = loadFlashHomeData({ pluginName: "t", force: true, includeSuspended: true })
    resolveCollect([{ id: 2, isSuspended: true }])
    const [r1, r2] = await Promise.all([p1, p2])
    expect(collectReviewCards).toHaveBeenCalledTimes(1)
    expect(r1.suspendedCards).toEqual([{ id: 2, isSuspended: true }])
    expect(r2.suspendedCards).toEqual(r1.suspendedCards)
  })

  it("不同 key 并发无竞态：各自独立 inflight，先完成者不清空另一个", async () => {
    let resolveWith!: (v: unknown) => void
    let resolveWithout!: (v: unknown) => void
    collectReviewCards.mockImplementation((_plugin: string, opts: { includeSuspended?: boolean }) => {
      if (opts.includeSuspended) {
        return new Promise((resolve) => {
          resolveWith = resolve
        })
      }
      return new Promise((resolve) => {
        resolveWithout = resolve
      })
    })
    calculateDeckStats.mockReturnValue(deckStats)
    calculateHomeStats.mockReturnValue(todayStats)

    const withP = loadFlashHomeData({ pluginName: "t", force: true, includeSuspended: true })
    const withoutP = loadFlashHomeData({ pluginName: "t", force: true })
    expect(collectReviewCards).toHaveBeenCalledTimes(2)

    // 先完成 without 侧：它的 finally 绝不能清掉 still-running 的 with 侧 inflight
    resolveWithout([{ id: 1 }])
    const withoutR = await withoutP
    expect(withoutR.fromCache).toBe(false)

    // with 侧仍在运行：同 key 新请求必须命中同一 inflight，而不是重复扫描
    const withP2 = loadFlashHomeData({ pluginName: "t", force: true, includeSuspended: true })
    expect(collectReviewCards).toHaveBeenCalledTimes(2)

    resolveWith([{ id: 2, isSuspended: true }])
    const [withR, withR2] = await Promise.all([withP, withP2])
    expect(collectReviewCards).toHaveBeenCalledTimes(2)
    expect(withR.suspendedCards).toEqual([{ id: 2, isSuspended: true }])
    expect(withR2.suspendedCards).toEqual(withR.suspendedCards)
  })
})
