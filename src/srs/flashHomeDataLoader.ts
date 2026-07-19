/**
 * Flash Home 数据加载：短 TTL 缓存 + 同请求去重，降低首屏/连点全量 collect 成本。
 * 不做跨会话持久索引（删除/卡型变化失效事件不足）。
 */

import type { DeckStats, ReviewCard, TodayStats } from "./types"
import { collectReviewCards } from "./cardCollector"
import { calculateDeckStats, calculateHomeStats } from "./deckUtils"

/** 与 120s 兜底刷新同量级偏短，保证手动刷新与事件后能较快看到新数据 */
export const FLASH_HOME_DATA_TTL_MS = 45_000

export type FlashHomeLoadedData = {
  cards: ReviewCard[]
  deckStats: DeckStats
  todayStats: TodayStats
  fromCache: boolean
  fetchedAt: number
}

type CacheEntry = {
  cards: ReviewCard[]
  deckStats: DeckStats
  todayStats: TodayStats
  fetchedAt: number
}

let cache: CacheEntry | null = null
let inflight: Promise<FlashHomeLoadedData> | null = null

export type LoadFlashHomeDataOptions = {
  /** 忽略 TTL，强制全量 collect（用户点刷新 / 评分后等） */
  force?: boolean
  pluginName?: string
}

/**
 * 加载 Flash Home 所需卡片与摘要统计。
 * - 缓存命中且未 force：同步路径返回缓存（fromCache=true）
 * - 并发调用共享同一 inflight Promise
 */
export async function loadFlashHomeData(
  options: LoadFlashHomeDataOptions = {}
): Promise<FlashHomeLoadedData> {
  const pluginName = options.pluginName ?? "srs-plugin"
  const force = options.force === true
  const now = Date.now()

  if (!force && cache && now - cache.fetchedAt < FLASH_HOME_DATA_TTL_MS) {
    return {
      cards: cache.cards,
      deckStats: cache.deckStats,
      todayStats: cache.todayStats,
      fromCache: true,
      fetchedAt: cache.fetchedAt
    }
  }

  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    const cards = await collectReviewCards(pluginName)
    const deckStats = calculateDeckStats(cards)
    const todayStats = calculateHomeStats(cards)
    const fetchedAt = Date.now()
    cache = { cards, deckStats, todayStats, fetchedAt }
    return {
      cards,
      deckStats,
      todayStats,
      fromCache: false,
      fetchedAt
    }
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function invalidateFlashHomeDataCache(): void {
  cache = null
}

/** 测试 / 调试用 */
export function getFlashHomeDataCacheSnapshot(): CacheEntry | null {
  return cache
}
