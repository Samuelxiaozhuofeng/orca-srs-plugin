/**
 * 卡片收集模块
 * 
 * 提供 SRS 卡片的收集、过滤和复习队列构建功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"
import { BlockWithRepr, isSrsCardBlock } from "./blockUtils"
import {
  clearDeckNameCache,
  extractCardType,
  prefetchDeckNamesForBlocks,
  type PrefetchDeckNamesResult
} from "./deckUtils"
import {
  clearBlockCache,
  preheatBlockCache,
  prefetchBlocksByIds,
  type PrefetchBlocksByIdsResult
} from "./storage"
import { isCardTag } from "./tagUtils"
import { convertBlockToReviewCards } from "./reviewCardFactory"

// ============================================================================
// FC-13：收集过程 metrics（开发/测试可注入；生产默认不刷屏）
// ============================================================================

/** 单阶段耗时（毫秒，performance.now 差） */
export type CollectStageTimings = {
  collectSrsBlocksMs: number
  preheatBlockCacheMs: number
  prefetchListItemsMs: number
  prefetchDeckNamesMs: number
  processCardsMs: number
}

export type CollectReviewCardsMetrics = {
  inputBlocks: number
  outputCards: number
  /** 端到端总耗时（ms） */
  totalMs: number
  /** 各阶段耗时 */
  stageMs: CollectStageTimings
  /** 最慢阶段名 */
  slowestStage: keyof CollectStageTimings | null
  /** 块缓存预热写入数 */
  preheatCount: number
  /** 列表子块批量预取摘要 */
  listItemPrefetch: PrefetchBlocksByIdsResult | null
  /** 牌组名批量预取摘要 */
  deckPrefetch: PrefetchDeckNamesResult | null
  /** 本轮观察到的后端批并发峰值（list + deck 预取） */
  concurrencyPeak: number
  /** 是否启用了收集优化 */
  optimizationsEnabled: boolean
}

export type CollectReviewCardsOptions = {
  /**
   * 若提供，收集结束后写入 metrics（测试与开发态测量用）。
   * 生产默认不传，不产生额外日志。
   */
  metricsOut?: { current?: CollectReviewCardsMetrics }
  /**
   * 测试用：关闭预热/批量牌组预取，复现优化前路径以便 A/B 与行为等价对比。
   * 生产不得关闭。
   */
  disableOptimizations?: boolean
  /** 开发态：为 true 时 console.info 输出一行 metrics 摘要 */
  logMetrics?: boolean
}

function emptyStageTimings(): CollectStageTimings {
  return {
    collectSrsBlocksMs: 0,
    preheatBlockCacheMs: 0,
    prefetchListItemsMs: 0,
    prefetchDeckNamesMs: 0,
    processCardsMs: 0
  }
}

function findSlowestStage(
  stageMs: CollectStageTimings
): keyof CollectStageTimings | null {
  let slowest: keyof CollectStageTimings | null = null
  let max = -1
  for (const key of Object.keys(stageMs) as (keyof CollectStageTimings)[]) {
    if (stageMs[key] > max) {
      max = stageMs[key]
      slowest = key
    }
  }
  return slowest
}

/**
 * 收集 list 卡直接子块 id（去重），供批量 get-blocks 预热。
 */
function collectListItemBlockIds(blocks: ReadonlyArray<BlockWithRepr>): DbId[] {
  const ids: DbId[] = []
  const seen = new Set<DbId>()
  for (const block of blocks) {
    if (!isSrsCardBlock(block)) continue
    if (extractCardType(block) !== "list") continue
    const children = (block.children ?? []) as DbId[]
    for (const id of children) {
      if (id == null || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}


/**
 * 收集所有 SRS 块（带 #card 标签或 _repr.type="srs.card" 的块）
 * @param pluginName - 插件名称（用于日志），可选
 * @returns SRS 块数组
 */
export async function collectSrsBlocks(pluginName: string = "srs-plugin"): Promise<BlockWithRepr[]> {
  // 尝试直接查询 #card 标签（同时查询多种大小写变体）
  const possibleTags = ["card", "Card"] // 支持 #card 和 #Card
  let tagged: BlockWithRepr[] = []
  
  for (const tag of possibleTags) {
    try {
      const result = await orca.invokeBackend("get-blocks-with-tags", [tag]) as BlockWithRepr[] | undefined
      if (result && result.length > 0) {
        tagged = [...tagged, ...result]
      }
    } catch (e) {
      console.log(`[${pluginName}] collectSrsBlocks: 查询标签 "${tag}" 失败:`, e)
    }
  }
  
  // 去重（同一个块可能被多次查询到）
  const uniqueTagged = new Map<number, BlockWithRepr>()
  for (const block of tagged) {
    uniqueTagged.set(block.id, block)
  }
  tagged = Array.from(uniqueTagged.values())
  
  // 如果直接查询无结果，使用备用方案获取所有块并过滤
  if (tagged.length === 0) {
    console.log(`[${pluginName}] collectSrsBlocks: 直接查询无结果，使用备用方案`)
    try {
      // 备用方案：尝试获取所有块并手动过滤
      const allBlocks = await orca.invokeBackend("get-all-blocks") as Block[] || []
      console.log(`[${pluginName}] collectSrsBlocks: get-all-blocks 返回了 ${allBlocks.length} 个块`)
      
      // 手动过滤所有块，使用大小写不敏感的 isCardTag 函数
      tagged = allBlocks.filter(block => {
        if (!block.refs || block.refs.length === 0) {
          return false
        }
        
        const hasCardTag = block.refs.some(ref => {
          if (ref.type !== 2) {
            return false
          }
          return isCardTag(ref.alias) // 大小写不敏感匹配
        })
        
        return hasCardTag
      }) as BlockWithRepr[]
      console.log(`[${pluginName}] collectSrsBlocks: 手动过滤找到 ${tagged.length} 个带 #card 标签的块`)
      
    } catch (error) {
      console.error(`[${pluginName}] collectSrsBlocks 备用方案失败:`, error)
      tagged = []
    }
  }
  
  const stateBlocks = Object.values(orca.state.blocks || {})
    .filter((b): b is BlockWithRepr => {
      if (!b) return false
      const reprType = (b as BlockWithRepr)._repr?.type
      // 支持三种卡片类型：basic、cloze 和 direction
      return reprType === "srs.card" || reprType === "srs.cloze-card" || reprType === "srs.direction-card"
    })

  const merged = new Map<DbId, BlockWithRepr>()
  for (const block of [...(tagged || []), ...stateBlocks]) {
    if (!block) continue
    merged.set(block.id, block as BlockWithRepr)
  }
  return Array.from(merged.values())
}

/**
 * 收集所有待复习的卡片
 *
 * 对于 Cloze 卡片，为每个填空编号生成独立的 ReviewCard
 * 对于 Direction 卡片，根据方向类型生成一张或两张 ReviewCard
 *
 * FC-13 优化（默认开启，行为与关闭时等价）：
 * 1. 用 collectSrsBlocks 已返回的完整块 preheat 块缓存，避免 ensure* 再 get-block
 * 2. list 子块 / 牌组目标块：正式 get-blocks 分批预取（批次与并发有上限）
 * 3. 可选 metricsOut 供测试与开发测量；生产默认不刷屏
 *
 * 不做长期索引缓存（删除/卡型/牌组变化失效事件不足）。
 *
 * @param pluginName - 插件名称（用于日志），可选
 * @param options - 可选 metrics / 关闭优化（仅测试）
 * @returns ReviewCard 数组
 */
export async function collectReviewCards(
  pluginName: string = "srs-plugin",
  options: CollectReviewCardsOptions = {}
): Promise<ReviewCard[]> {
  const optimizationsEnabled = options.disableOptimizations !== true
  const stageMs = emptyStageTimings()
  const totalStart = performance.now()

  let t0 = performance.now()
  const blocks = await collectSrsBlocks(pluginName)
  stageMs.collectSrsBlocksMs = performance.now() - t0

  let preheatCount = 0
  let listItemPrefetch: PrefetchBlocksByIdsResult | null = null
  let deckPrefetch: PrefetchDeckNamesResult | null = null
  let concurrencyPeak = 0

  if (optimizationsEnabled) {
    t0 = performance.now()
    preheatCount = preheatBlockCache(blocks)
    stageMs.preheatBlockCacheMs = performance.now() - t0

    t0 = performance.now()
    const listItemIds = collectListItemBlockIds(blocks)
    if (listItemIds.length > 0) {
      listItemPrefetch = await prefetchBlocksByIds(listItemIds)
      concurrencyPeak = Math.max(concurrencyPeak, listItemPrefetch.concurrencyPeak)
    }
    stageMs.prefetchListItemsMs = performance.now() - t0

    // 牌组名缓存仅本轮有效，避免长期错误缓存
    clearDeckNameCache()
    t0 = performance.now()
    deckPrefetch = await prefetchDeckNamesForBlocks(blocks)
    concurrencyPeak = Math.max(concurrencyPeak, deckPrefetch.concurrencyPeak)
    stageMs.prefetchDeckNamesMs = performance.now() - t0
  }


  const cards: ReviewCard[] = []
  // 同一收集轮次冻结时间，保持所有新状态与 list due 判断的一致性。
  const collectionNow = new Date()

  t0 = performance.now()
  try {
    for (const block of blocks) {
      cards.push(...await convertBlockToReviewCards(block, pluginName, collectionNow))
    }
  } finally {
    stageMs.processCardsMs = performance.now() - t0
    // 结束本轮牌组缓存，防止跨收集轮次的错误长期缓存
    if (optimizationsEnabled) {
      clearDeckNameCache()
    }
  }

  const metrics: CollectReviewCardsMetrics = {
    inputBlocks: blocks.length,
    outputCards: cards.length,
    totalMs: performance.now() - totalStart,
    stageMs,
    slowestStage: findSlowestStage(stageMs),
    preheatCount,
    listItemPrefetch,
    deckPrefetch,
    concurrencyPeak,
    optimizationsEnabled
  }

  if (options.metricsOut) {
    options.metricsOut.current = metrics
  }
  if (options.logMetrics) {
    console.info(
      `[${pluginName}] collectReviewCards metrics:`,
      JSON.stringify({
        inputBlocks: metrics.inputBlocks,
        outputCards: metrics.outputCards,
        totalMs: Math.round(metrics.totalMs * 100) / 100,
        slowestStage: metrics.slowestStage,
        preheatCount: metrics.preheatCount,
        concurrencyPeak: metrics.concurrencyPeak,
        optimizationsEnabled: metrics.optimizationsEnabled,
        deckGetBlocksCalls: metrics.deckPrefetch?.getBlocksCalls ?? 0,
        listGetBlocksCalls: metrics.listItemPrefetch?.getBlocksCalls ?? 0
      })
    )
  }

  return cards
}

/**
 * 测试辅助：清空收集相关的短期缓存（块缓存 + 牌组名缓存）。
 * 不改变评分后的 invalidate 语义；仅用于基准隔离。
 */
export function resetCollectCachesForTests(): void {
  clearBlockCache()
  clearDeckNameCache()
}

/** 兼容出口：现有调用方可继续从 cardCollector 导入拆分后的领域能力。 */
export {
  applyDailyRootLimits,
  buildReviewQueue,
  compareReviewCardsForQueue,
  interleaveDueAndNew,
  partitionDueAndNewCards,
  sortCardsForReviewQueue
} from "./reviewQueueBuilder"
export {
  DEFAULT_MAX_AUX_CHILD_CARDS,
  DEFAULT_MAX_CHILD_DEPTH,
  MAX_AUX_CHILD_CARDS_CAP,
  MAX_CHILD_DEPTH_CAP,
  formatChildExpandWarning,
  isValidChildExpandLimit,
  resolveChildExpandLimits,
  type ChildExpandDiagnostic,
  type ChildExpandLimits,
  type ChildExpandTruncationReason,
  type ResolveChildExpandLimitsOptions,
  type ResolvedChildExpandLimits
} from "./childExpansionLimits"
export {
  expandChildCardsForRoots,
  type ExpandChildCardsResult
} from "./childCardExpansion"
export {
  buildReviewQueueWithChildren,
  buildSessionReviewQueue,
  type SessionReviewQueueBuildResult
} from "./reviewSessionQueueBuilder"
