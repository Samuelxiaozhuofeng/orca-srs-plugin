/**
 * Flash Home 数据加载：短 TTL 缓存 + 同请求去重，降低首屏/连点全量 collect 成本。
 * 不做跨会话持久索引（删除/卡型变化失效事件不足）。
 *
 * includeSuspended=true 时一轮 collect 同时分出 active 与 suspended 两组
 * （collectReviewCards 返回全部行并标记 isSuspended），避免为「已暂停」视图重复扫库；
 * 统计（deckStats / todayStats）始终只基于 active 卡片。
 */

import type { DeckStats, ReviewCard, TodayStats } from "./types"
import { collectReviewCards } from "./cardCollector"
import { calculateDeckStats, calculateHomeStats } from "./deckUtils"

/** 与 120s 兜底刷新同量级偏短，保证手动刷新与事件后能较快看到新数据 */
export const FLASH_HOME_DATA_TTL_MS = 45_000

export type FlashHomeLoadedData = {
  /** 正常（未暂停）卡片；统计只基于这批卡片 */
  cards: ReviewCard[]
  /** 已暂停卡片（仅 includeSuspended=true 时有内容） */
  suspendedCards: ReviewCard[]
  deckStats: DeckStats
  todayStats: TodayStats
  fromCache: boolean
  fetchedAt: number
}

type CacheEntry = {
  cards: ReviewCard[]
  suspendedCards: ReviewCard[]
  deckStats: DeckStats
  todayStats: TodayStats
  fetchedAt: number
  includeSuspended: boolean
}

let cache: CacheEntry | null = null
// 按 includeSuspended 键控的两个独立 inflight 槽位：
// 不同 key 并发时互不覆盖，各自 finally 只清自己的槽位，避免竞态清空/重复扫描。
let inflightWithoutSuspended: Promise<FlashHomeLoadedData> | null = null
let inflightWithSuspended: Promise<FlashHomeLoadedData> | null = null

export type LoadFlashHomeDataOptions = {
  /** 忽略 TTL，强制全量 collect（用户点刷新 / 评分后等） */
  force?: boolean
  pluginName?: string
  /**
   * 是否包含已暂停卡（Flash Home「已暂停」视图）。
   * 同一轮收集分出 active/suspended 两组；不传时行为与历史一致。
   */
  includeSuspended?: boolean
}

/**
 * 加载 Flash Home 所需卡片与摘要统计。
 * - 缓存命中且未 force：同步路径返回缓存（fromCache=true）
 * - 并发调用共享同一 inflight Promise（仅当 includeSuspended 一致时）
 */
export async function loadFlashHomeData(
  options: LoadFlashHomeDataOptions = {}
): Promise<FlashHomeLoadedData> {
  const pluginName = options.pluginName ?? "srs-plugin"
  const force = options.force === true
  const includeSuspended = options.includeSuspended === true
  const now = Date.now()

  if (
    !force &&
    cache &&
    cache.includeSuspended === includeSuspended &&
    now - cache.fetchedAt < FLASH_HOME_DATA_TTL_MS
  ) {
    return {
      cards: cache.cards,
      suspendedCards: cache.suspendedCards,
      deckStats: cache.deckStats,
      todayStats: cache.todayStats,
      fromCache: true,
      fetchedAt: cache.fetchedAt
    }
  }

  if (includeSuspended) {
    if (inflightWithSuspended) return inflightWithSuspended
  } else if (inflightWithoutSuspended) {
    return inflightWithoutSuspended
  }

  const promise = (async () => {
    const allCards = await collectReviewCards(pluginName, { includeSuspended })
    // include-suspended 收集返回全部行：按标记分出两组；统计只用 active
    const cards = allCards.filter((card) => card.isSuspended !== true)
    const suspendedCards = allCards.filter((card) => card.isSuspended === true)
    const deckStats = calculateDeckStats(cards)
    const todayStats = calculateHomeStats(cards)
    const fetchedAt = Date.now()
    cache = { cards, suspendedCards, deckStats, todayStats, fetchedAt, includeSuspended }
    return {
      cards,
      suspendedCards,
      deckStats,
      todayStats,
      fromCache: false,
      fetchedAt
    }
  })()
  if (includeSuspended) {
    inflightWithSuspended = promise
  } else {
    inflightWithoutSuspended = promise
  }

  try {
    return await promise
  } finally {
    // 只清自己的槽位：另一个 key 的 inflight 不受影响
    if (includeSuspended) {
      if (inflightWithSuspended === promise) inflightWithSuspended = null
    } else if (inflightWithoutSuspended === promise) {
      inflightWithoutSuspended = null
    }
  }
}

export function invalidateFlashHomeDataCache(): void {
  cache = null
  // 今日学习剩余与 Flash Home 同源事件失效，避免 45s TTL 展示旧剩余
  void import("./todayLearning/todayLearningSummary")
    .then((m) => m.invalidateTodayLearningSummaryCache())
    .catch((error) => {
      console.error("[srs] 失效今日学习摘要缓存失败:", error)
    })
}

/** 测试 / 调试用 */
export function getFlashHomeDataCacheSnapshot(): CacheEntry | null {
  return cache
}
