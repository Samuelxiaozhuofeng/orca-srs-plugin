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
