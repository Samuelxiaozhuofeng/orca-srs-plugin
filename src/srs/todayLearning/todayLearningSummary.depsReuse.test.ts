/**
 * 回归：Flash Home 一次刷新只做一遍 SRS 全量收集（中危#3）。
 *
 * 模拟主页刷新链路：loadFlashHomeData（真实 collectReviewCards）→
 * loadTodayLearningSummaryCached 经 deps 注入复用刚拿到的 cards——
 * 断言 collectReviewCards 全程只被调用一次；未注入 deps 时为两次（旧行为）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard, SrsState } from "../types"

const collectReviewCards = vi.fn()

vi.mock("../cardCollector", () => ({
  collectReviewCards: (...args: unknown[]) => collectReviewCards(...args)
}))

vi.mock("../deckUtils", () => ({
  calculateDeckStats: () => ({
    decks: [],
    totalCards: 1,
    totalNew: 0,
    totalOverdue: 0
  }),
  calculateHomeStats: () => ({
    pendingCount: 0,
    todayCount: 0,
    newCount: 0,
    totalCount: 1
  })
}))

import {
  invalidateFlashHomeDataCache,
  loadFlashHomeData
} from "../flashHomeDataLoader"
import {
  invalidateTodayLearningSummaryCache,
  loadTodayLearningSummaryCached,
  type LoadTodayLearningSummaryDeps
} from "./todayLearningSummary"
import { createEmptyIRDailyStatsRecord } from "../incremental-reading/irDailyStatsStorage"

const NOW = new Date(2026, 6, 26, 12, 0, 0)

function srsState(due: Date): SrsState {
  return {
    due,
    stability: 1,
    difficulty: 5,
    interval: 1,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReviewed: null
  }
}

function reviewCard(id: number): ReviewCard {
  return {
    id,
    deck: "default",
    isNew: false,
    front: `f${id}`,
    back: `b${id}`,
    srs: srsState(new Date(2026, 6, 26, 8, 0, 0)),
    type: "basic"
  } as unknown as ReviewCard
}

/** 除 collectReviewCards 外全部注入，隔离 IR/日志/设置真实实现 */
function otherDeps(): Omit<
  Partial<LoadTodayLearningSummaryDeps>,
  "collectReviewCards"
> {
  const record = createEmptyIRDailyStatsRecord(
    "test-repo",
    "orca-srs",
    "2026-07-26"
  )
  return {
    getReviewLogs: async () => [],
    getReviewSettings: () => ({ newCardsPerDay: 20, reviewCardsPerDay: 200 }),
    getIncrementalReadingSettings: () => ({ dailyLimit: 0 }),
    collectIRCardsDetailed: async () => ({ cards: [], failedCount: 0 }),
    loadIRDailyStats: () => ({ ok: true, record, fromStorage: true }),
    resolveRepo: () => "test-repo"
  }
}

beforeEach(() => {
  collectReviewCards.mockReset()
  collectReviewCards.mockResolvedValue([reviewCard(1)])
  invalidateFlashHomeDataCache()
  invalidateTodayLearningSummaryCache()
})

describe("Flash Home 刷新链路的 SRS 收集次数", () => {
  it("deps 注入复用 cards：一次刷新 collectReviewCards 只被调用一次", async () => {
    const data = await loadFlashHomeData({ pluginName: "orca-srs", force: true })
    expect(collectReviewCards).toHaveBeenCalledTimes(1)

    invalidateTodayLearningSummaryCache()
    const summary = await loadTodayLearningSummaryCached("orca-srs", {
      force: true,
      now: NOW,
      deps: {
        collectReviewCards: async () => data.cards,
        ...otherDeps()
      }
    })

    // 全程仍只有 loadFlashHomeData 那一次全量收集
    expect(collectReviewCards).toHaveBeenCalledTimes(1)
    // 注入的 cards 真实参与了 SRS 剩余计算（1 张到期卡）
    expect(summary.srsRemaining).toBe(1)
    expect(summary.loadStatus).toBe("ok")
  })

  it("对照：不注入 collectReviewCards 时同一链路会收集两遍（旧行为）", async () => {
    await loadFlashHomeData({ pluginName: "orca-srs", force: true })
    invalidateTodayLearningSummaryCache()
    await loadTodayLearningSummaryCached("orca-srs", {
      force: true,
      now: NOW,
      deps: otherDeps()
    })
    expect(collectReviewCards).toHaveBeenCalledTimes(2)
  })
})
