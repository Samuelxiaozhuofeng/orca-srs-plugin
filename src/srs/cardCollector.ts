/**
 * 卡片收集模块
 * 
 * 提供 SRS 卡片的收集、过滤和复习队列构建功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard, TagInfo } from "./types"
import { BlockWithRepr, isSrsCardBlock, resolveFrontBack } from "./blockUtils"
import {
  clearDeckNameCache,
  extractDeckName,
  extractCardType,
  prefetchDeckNamesForBlocks,
  type PrefetchDeckNamesResult
} from "./deckUtils"
import { extractCardStatus } from "./cardStatusUtils"
import {
  clearBlockCache,
  ensureCardSrsState,
  ensureCardSrsStateWithInitialDue,
  ensureClozeSrsState,
  ensureDirectionSrsState,
  preheatBlockCache,
  prefetchBlocksByIds,
  type PrefetchBlocksByIdsResult
} from "./storage"
import { getAllClozeNumbers } from "./clozeUtils"
import { extractDirectionInfo, getDirectionList } from "./directionUtils"
import { isCardTag } from "./tagUtils"
import type { ReviewQueueLimits } from "./reviewSessionBudget"
import { compareReviewCardIdentity } from "./cardIdentity"

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

function getTodayMidnight(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function getTomorrowMidnight(): Date {
  const tomorrow = getTodayMidnight()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

/**
 * 从块的 refs 中提取非 card 标签
 * @param block - 块数据
 * @returns TagInfo 数组
 */
function extractNonCardTags(block: BlockWithRepr): TagInfo[] {
  const refs = block.refs || []
  if (refs.length === 0) return []

  const tags: TagInfo[] = []
  const seenBlockIds = new Set<DbId>()

  for (const ref of refs) {
    // type=2 表示标签引用
    if (ref.type !== 2) continue

    const name = (ref.alias || "").trim()
    if (!name) continue

    // 排除 #card 标签（大小写不敏感）以及 card/* 的子标签
    const aliasLower = name.toLowerCase()
    if (aliasLower === "card" || aliasLower.startsWith("card/")) continue

    if (seenBlockIds.has(ref.to)) continue
    seenBlockIds.add(ref.to)

    tags.push({
      name,
      blockId: ref.to
    })
  }

  return tags
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

  const now = new Date()
  const nowTime = now.getTime()
  const todayMidnight = getTodayMidnight()
  const tomorrowMidnight = getTomorrowMidnight()
  const cards: ReviewCard[] = []

  t0 = performance.now()
  try {
  for (const block of blocks) {
    if (!isSrsCardBlock(block)) continue

    // 过滤已暂停的卡片
    const status = extractCardStatus(block)
    if (status === "suspend") {
      console.log(`[${pluginName}] collectReviewCards: 跳过已暂停的卡片 #${block.id}`)
      continue
    }

    // 识别卡片类型
    const cardType = extractCardType(block)

    // 渐进阅读主题/摘录卡片不进入 SRS 复习队列
    if (cardType === "extracts" || cardType === "topic") {
      continue
    }
    const deckName = await extractDeckName(block)

    if (cardType === "cloze") {
      // Cloze 卡片：为每个填空编号生成独立的 ReviewCard
      const clozeNumbers = getAllClozeNumbers(block.content, pluginName)

      // 调试日志
      console.log(`[${pluginName}] collectReviewCards: 发现 cloze 卡片 #${block.id}`)
      console.log(`  - block.content 长度: ${block.content?.length || 0}`)
      console.log(`  - 找到 cloze 编号: ${JSON.stringify(clozeNumbers)}`)
      if (block.content && block.content.length > 0) {
        // 输出所有 fragment 的类型以便调试
        const fragmentTypes = block.content.map((f: any) => f.t)
        console.log(`  - fragment 类型: ${JSON.stringify(fragmentTypes)}`)
      }

      if (clozeNumbers.length === 0) {
        console.log(`  - 跳过：没有找到 cloze 编号`)
        continue
      }

      for (const clozeNumber of clozeNumbers) {
        const srsState = await ensureClozeSrsState(block.id, clozeNumber, clozeNumber - 1)

        // front 使用块文本（将在渲染时隐藏对应填空）
        const front = block.text || ""

        cards.push({
          id: block.id,
          front,
          back: `（填空 c${clozeNumber}）`, // 填空卡不需要独立的 back
          srs: srsState,
          isNew: !srsState.lastReviewed || srsState.reps === 0,
          deck: deckName,
          cardType: "cloze",
          tags: extractNonCardTags(block),
          clozeNumber, // 关键：标记当前复习的填空编号
          content: block.content  // 保存块内容用于渲染填空
        })
      }
    } else if (cardType === "direction") {
      // Direction 卡片：根据方向类型生成一张或两张卡片
      const dirInfo = extractDirectionInfo(block.content, pluginName)
      
      if (!dirInfo) {
        console.log(`[${pluginName}] collectReviewCards: 块 ${block.id} 无法解析方向卡内容`)
        continue
      }

      // 允许用户先插入方向符号再补全右侧文本：未完成的方向卡不进入复习队列
      if (!dirInfo.leftText || !dirInfo.rightText) {
        console.log(
          `[${pluginName}] collectReviewCards: 跳过未完成的方向卡 #${block.id}（left/right 为空）`
        )
        continue
      }

      // 获取需要生成卡片的方向列表
      const directions = getDirectionList(dirInfo.direction)

      for (let i = 0; i < directions.length; i++) {
        const dir = directions[i]

        const srsState = await ensureDirectionSrsState(block.id, dir, i) // 分天推送

        // 根据方向决定问题和答案
        const front = dir === "forward" ? dirInfo.leftText : dirInfo.rightText
        const back = dir === "forward" ? dirInfo.rightText : dirInfo.leftText

        cards.push({
          id: block.id,
          front,
          back,
          srs: srsState,
          isNew: !srsState.lastReviewed || srsState.reps === 0,
          deck: deckName,
          cardType: "direction",
          tags: extractNonCardTags(block),
          directionType: dir // 关键：标记当前复习的方向类型
        })
      }
    } else if (cardType === "excerpt") {
      // Excerpt 卡片：只显示内容，无正反面
      const content = block.text || ""
      const srsState = await ensureCardSrsState(block.id, now)

      cards.push({
        id: block.id,
        front: content,  // 摘录内容作为 front
        back: "",        // 无 back
        srs: srsState,
        isNew: !srsState.lastReviewed || srsState.reps === 0,
        deck: deckName,
        cardType: "excerpt",
        tags: extractNonCardTags(block)
      })
    } else if (cardType === "choice") {
      // Choice 卡片：选择题卡片
      // 选择题卡片使用父块文本作为问题，子块作为选项
      // 选项的提取和乱序在渲染时处理
      const question = block.text || ""
      const srsState = await ensureCardSrsState(block.id, now)

      // 检查是否有子块（选项）
      const hasChildren = block.children && block.children.length > 0
      
      if (!hasChildren) {
        // 无子块：跳过，选择题必须有选项
        console.log(`[${pluginName}] collectReviewCards: 跳过无选项的选择题卡片 #${block.id}`)
        continue
      }

      cards.push({
        id: block.id,
        front: question,  // 问题作为 front
        back: "",         // 选择题不需要传统的 back，答案在选项中
        srs: srsState,
        isNew: !srsState.lastReviewed || srsState.reps === 0,
        deck: deckName,
        cardType: "choice",
        tags: extractNonCardTags(block),
        content: block.content  // 保存块内容用于渲染
      })
    } else if (cardType === "list") {
      // List 卡片：只取直接子块作为条目，逐次推送
      const itemIds = (block.children ?? []) as DbId[]

      if (itemIds.length === 0) {
        console.log(`[${pluginName}] collectReviewCards: 跳过无条目的列表卡 #${block.id}`)
        continue
      }

      // 在当前顺序下，从前到后找到第一个 due<=now 的条目作为“正式可复习条目”
      let dueIndex = -1
      let dueItemId: DbId | null = null
      let dueItemSrs: ReviewCard["srs"] | null = null

      for (let i = 0; i < itemIds.length; i++) {
        const itemId = itemIds[i]
        const initialDue = i === 0 ? todayMidnight : tomorrowMidnight
        const srsState = await ensureCardSrsStateWithInitialDue(itemId, initialDue)
        if (srsState.due.getTime() <= nowTime) {
          dueIndex = i + 1 // 1-based
          dueItemId = itemId
          dueItemSrs = srsState
          break
        }
      }

      if (!dueItemId || !dueItemSrs || dueIndex === -1) {
        continue
      }

      cards.push({
        id: block.id,
        front: block.text || "",
        back: "",
        srs: dueItemSrs,
        isNew: !dueItemSrs.lastReviewed || dueItemSrs.reps === 0,
        deck: deckName,
        cardType: "list",
        tags: extractNonCardTags(block),
        listItemId: dueItemId,
        listItemIndex: dueIndex,
        listItemIds: itemIds
      })
    } else {
      // Basic 卡片：传统的正面/反面模式
      // 检查是否有子块 - 如果没有子块，当作摘录卡处理
      const hasChildren = block.children && block.children.length > 0
      
      if (!hasChildren) {
        // 无子块：当作摘录卡处理（只显示内容，无正反面）
        const content = block.text || ""
        const srsState = await ensureCardSrsState(block.id, now)

        cards.push({
          id: block.id,
          front: content,  // 摘录内容作为 front
          back: "",        // 无 back
          srs: srsState,
          isNew: !srsState.lastReviewed || srsState.reps === 0,
          deck: deckName,
          cardType: "basic",
          tags: extractNonCardTags(block)
        })
      } else {
        // 有子块：正常的正面/反面模式
        const { front, back } = resolveFrontBack(block)
        const srsState = await ensureCardSrsState(block.id, now)

        cards.push({
          id: block.id,
          front,
          back,
          srs: srsState,
          isNew: !srsState.lastReviewed || srsState.reps === 0,
          deck: deckName,
          cardType: "basic",
          tags: extractNonCardTags(block)
          // clozeNumber 和 directionType 都为 undefined（非特殊卡片）
        })
      }
    }
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

/**
 * 筛选当前已到期的旧卡 / 新卡（精确到时分秒），保持输入相对顺序。
 * 纯数据：不读全局设置。正式队列排序见 sortCardsForReviewQueue / buildReviewQueue。
 */
export function partitionDueAndNewCards(
  cards: readonly ReviewCard[],
  now: Date = new Date()
): { dueCards: ReviewCard[]; newCards: ReviewCard[] } {
  const nowTime = now.getTime()

  const dueCards = cards.filter((card) => {
    if (card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

  const newCards = cards.filter((card) => {
    if (!card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

  return { dueCards, newCards }
}

/**
 * FC-11 队列稳定比较：先 due 升序（逾期最久优先），相同 due 用结构化身份比较。
 * 不用 cardKey 字符串字典序（避免 cloze c10 < c2）。
 */
export function compareReviewCardsForQueue(a: ReviewCard, b: ReviewCard): number {
  const dueA = a.srs.due.getTime()
  const dueB = b.srs.due.getTime()
  if (dueA !== dueB) {
    return dueA - dueB
  }
  return compareReviewCardIdentity(a, b)
}

/**
 * 对到期旧卡/新卡做稳定排序（due → 结构化身份）。不改变 isNew 分区。
 */
export function sortCardsForReviewQueue(
  cards: readonly ReviewCard[]
): ReviewCard[] {
  return [...cards].sort(compareReviewCardsForQueue)
}

/**
 * 在已稳定排序的旧/新序列上截断正式根卡每日上限（排序 → 限额 → 交织）。
 * limits 为 null/undefined 时不截断（fixed / 动态扫描候选构建）。
 */
export function applyDailyRootLimits(
  dueCards: readonly ReviewCard[],
  newCards: readonly ReviewCard[],
  limits?: ReviewQueueLimits | null
): { dueCards: ReviewCard[]; newCards: ReviewCard[] } {
  if (limits == null) {
    return { dueCards: [...dueCards], newCards: [...newCards] }
  }
  return {
    dueCards: dueCards.slice(0, limits.reviewCardsPerDay),
    newCards: newCards.slice(0, limits.newCardsPerDay)
  }
}

/**
 * 2 旧 : 1 新交织（保持各类内部已稳定排序后的相对顺序）。
 */
export function interleaveDueAndNew(
  dueCards: readonly ReviewCard[],
  newCards: readonly ReviewCard[]
): ReviewCard[] {
  const queue: ReviewCard[] = []
  let dueIndex = 0
  let newIndex = 0

  while (dueIndex < dueCards.length || newIndex < newCards.length) {
    for (let i = 0; i < 2 && dueIndex < dueCards.length; i++) {
      queue.push(dueCards[dueIndex++])
    }
    if (newIndex < newCards.length) {
      queue.push(newCards[newIndex++])
    }
  }

  return queue
}

/**
 * 构建复习队列
 *
 * 流水线（FC-11 + FC-01）：
 * 1. 筛选到期旧卡 / 新卡
 * 2. 各自稳定排序（due 升序 → 结构化 card identity）
 * 3. 可选每日正式根卡限额（limits）
 * 4. 2 旧 : 1 新交织
 *
 * FC-01：可选显式 limits。不得在本函数内隐式读取 Orca/plugin settings。
 * - limits 传入：旧卡最多 reviewCardsPerDay，新卡最多 newCardsPerDay
 * - limits 省略/null：不限额（fixed 会话、动态扫描候选列表等）仍做稳定排序
 *
 * 到期判断（精确时间）：due.getTime() <= now；新卡同样检查。
 * 子卡展开见 buildReviewQueueWithChildren / expandChildCardsForRoots（FC-12：深度与辅助数量上限）。
 *
 * @param cards - ReviewCard 数组
 * @param limits - 显式每日正式根卡上限；null/undefined = 不限额
 * @returns 稳定排序后的复习队列（仅正式根卡）
 */
export function buildReviewQueue(
  cards: ReviewCard[],
  limits?: ReviewQueueLimits | null
): ReviewCard[] {
  const { dueCards, newCards } = partitionDueAndNewCards(cards)
  const sortedDue = sortCardsForReviewQueue(dueCards)
  const sortedNew = sortCardsForReviewQueue(newCards)
  const limited = applyDailyRootLimits(sortedDue, sortedNew, limits)
  return interleaveDueAndNew(limited.dueCards, limited.newCards)
}

// ============================================================================
// FC-12：子卡片递归展开规模限制
// ============================================================================

/** 默认最大辅助子卡深度（正式根卡深度 = 0，直接子卡 = 1） */
export const DEFAULT_MAX_CHILD_DEPTH = 10
/** 默认每会话辅助子卡数量上限（不含正式根卡） */
export const DEFAULT_MAX_AUX_CHILD_CARDS = 200
/** 深度安全上限：超过视为无效并回退默认 */
export const MAX_CHILD_DEPTH_CAP = 100
/** 辅助子卡数量安全上限：超过视为无效并回退默认 */
export const MAX_AUX_CHILD_CARDS_CAP = 10_000

/** 显式子卡展开限制（已校验的有限非负整数） */
export type ChildExpandLimits = {
  readonly maxDepth: number
  readonly maxAuxChildCards: number
}

/** 截断/安全终止原因 */
export type ChildExpandTruncationReason = "max_depth" | "max_count" | "cycle"

/**
 * 单次截断诊断：不得静默。
 * truncated=true 表示因限制或循环而未继续展开。
 */
export type ChildExpandDiagnostic = {
  readonly truncated: true
  readonly reason: ChildExpandTruncationReason
  readonly rootKey: string
  readonly depth?: number
  readonly count?: number
  readonly message: string
}

export type ResolveChildExpandLimitsOptions = {
  warn?: (message: string) => void
  defaultMaxDepth?: number
  defaultMaxAuxChildCards?: number
  maxDepthCap?: number
  maxAuxCap?: number
}

export type ResolvedChildExpandLimits = ChildExpandLimits & {
  readonly warnings: readonly string[]
  readonly usedDefaults: boolean
}

/** expandChildCardsForRoots 完整结果 */
export type ExpandChildCardsResult = {
  readonly queue: ReviewCard[]
  readonly diagnostics: readonly ChildExpandDiagnostic[]
  readonly auxChildCount: number
  readonly resolvedLimits: ChildExpandLimits
}

/** 会话初始队列构建结果：含正式根卡（计额度）与展开后队列（含子卡） */
export type SessionReviewQueueBuildResult = {
  /** 展开子卡后的完整队列 */
  queue: ReviewCard[]
  /** 计额度的正式根卡（限额截断 + 2:1 交织后的 base，不含辅助子卡） */
  formalRootCards: ReviewCard[]
  /** FC-12 子卡展开诊断（截断/循环）；空数组表示未截断 */
  childExpandDiagnostics: readonly ChildExpandDiagnostic[]
  /** 实际生效的展开限制 */
  childExpandLimits: ChildExpandLimits
  /** 计入全局辅助上限的子卡张数（不含正式根） */
  auxChildCount: number
}

/**
 * 校验子卡展开限制单字段：有限非负整数且 ≤ cap。
 */
export function isValidChildExpandLimit(
  value: unknown,
  maxCap: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maxCap
  )
}

/**
 * 从原始输入解析子卡展开限制。
 * 不读全局 settings；无效值 warn 并回退默认。
 * raw 省略/null → 使用默认 10 / 200。
 */
export function resolveChildExpandLimits(
  raw: Partial<ChildExpandLimits> | ChildExpandLimits | null | undefined = undefined,
  options: ResolveChildExpandLimitsOptions = {}
): ResolvedChildExpandLimits {
  const warn = options.warn ?? ((msg: string) => console.warn(msg))
  const defaultMaxDepth = options.defaultMaxDepth ?? DEFAULT_MAX_CHILD_DEPTH
  const defaultMaxAux =
    options.defaultMaxAuxChildCards ?? DEFAULT_MAX_AUX_CHILD_CARDS
  const maxDepthCap = options.maxDepthCap ?? MAX_CHILD_DEPTH_CAP
  const maxAuxCap = options.maxAuxCap ?? MAX_AUX_CHILD_CARDS_CAP
  const warnings: string[] = []
  let usedDefaults = false

  const rawDepth = raw == null ? undefined : (raw as Partial<ChildExpandLimits>).maxDepth
  const rawCount =
    raw == null ? undefined : (raw as Partial<ChildExpandLimits>).maxAuxChildCards

  let maxDepth = defaultMaxDepth
  let maxAuxChildCards = defaultMaxAux

  // 完全省略 raw → 默认，不记 usedDefaults 警告（合法默认路径）
  if (raw == null) {
    return Object.freeze({
      maxDepth,
      maxAuxChildCards,
      warnings: Object.freeze(warnings),
      usedDefaults: false
    })
  }

  if (rawDepth === undefined) {
    maxDepth = defaultMaxDepth
  } else if (!isValidChildExpandLimit(rawDepth, maxDepthCap)) {
    const msg =
      `[SRS] 无效的 childExpand.maxDepth=${String(rawDepth)}，` +
      `仅接受 0..${maxDepthCap} 的有限非负整数；已回退默认值 ${defaultMaxDepth}`
    warnings.push(msg)
    warn(msg)
    maxDepth = defaultMaxDepth
    usedDefaults = true
  } else {
    maxDepth = rawDepth
  }

  if (rawCount === undefined) {
    maxAuxChildCards = defaultMaxAux
  } else if (!isValidChildExpandLimit(rawCount, maxAuxCap)) {
    const msg =
      `[SRS] 无效的 childExpand.maxAuxChildCards=${String(rawCount)}，` +
      `仅接受 0..${maxAuxCap} 的有限非负整数；已回退默认值 ${defaultMaxAux}`
    warnings.push(msg)
    warn(msg)
    maxAuxChildCards = defaultMaxAux
    usedDefaults = true
  } else {
    maxAuxChildCards = rawCount
  }

  return Object.freeze({
    maxDepth,
    maxAuxChildCards,
    warnings: Object.freeze(warnings),
    usedDefaults
  })
}

/**
 * 将诊断列表压缩为会话顶部简短 warning；无截断返回 null。
 */
export function formatChildExpandWarning(
  diagnostics: readonly ChildExpandDiagnostic[]
): string | null {
  if (diagnostics.length === 0) return null

  const reasons = new Set(diagnostics.map((d) => d.reason))
  const limitParts: string[] = []
  if (reasons.has("max_depth")) limitParts.push("深度")
  if (reasons.has("max_count")) limitParts.push("数量")
  const hasCycle = reasons.has("cycle")

  if (limitParts.length === 0 && hasCycle) {
    return `子卡展开遇循环引用，已安全截断（${diagnostics.length} 处）`
  }
  if (limitParts.length > 0 && hasCycle) {
    return `子卡展开已达${limitParts.join("/")}上限或遇循环，部分链路已截断（${diagnostics.length} 处）`
  }
  if (limitParts.length > 0) {
    return `子卡展开已达${limitParts.join("/")}上限，部分链路已截断（${diagnostics.length} 处）`
  }
  return `子卡展开已截断（${diagnostics.length} 处）`
}

/**
 * 对已选正式根卡做确定性前序展开子卡片链（FC-12）。
 *
 * - 正式根深度 = 0，始终保留；限制只计辅助子卡
 * - 深度：单链 maxDepth；数量：会话全局 maxAuxChildCards
 * - 达深度或数量上限：截断该扩展，继续后续正式根卡
 * - 链内循环安全终止并写入诊断；不得静默截断
 * - 不读全局 settings；limits 经 resolveChildExpandLimits 校验
 *
 * 例如：初始队列 [A1, A2, B, C, D]，关系 A1,A2 ← B ← C ← D
 * 最终结果：[A1, B, C, D, A2, B, C, D]（8张，未触限时）
 */
export async function expandChildCardsForRoots(
  formalRootCards: readonly ReviewCard[],
  pluginName: string = "srs-plugin",
  childExpandLimits?: Partial<ChildExpandLimits> | ChildExpandLimits | null,
  options: ResolveChildExpandLimitsOptions = {}
): Promise<ExpandChildCardsResult> {
  const resolved = resolveChildExpandLimits(childExpandLimits, options)
  const limits: ChildExpandLimits = Object.freeze({
    maxDepth: resolved.maxDepth,
    maxAuxChildCards: resolved.maxAuxChildCards
  })

  const { collectChildCards, getCardKey } = await import("./childCardCollector")

  const expandedQueue: ReviewCard[] = []
  const appearedInQueue = new Set<string>()
  const diagnostics: ChildExpandDiagnostic[] = []
  let auxChildCount = 0
  /** 每个 rootKey+reason 只记一条，避免同根兄弟重复刷屏 */
  const seenDiagKeys = new Set<string>()

  const pushDiagnostic = (diag: ChildExpandDiagnostic): void => {
    const key = `${diag.rootKey}|${diag.reason}|${diag.depth ?? ""}|${diag.count ?? ""}`
    if (seenDiagKeys.has(key)) return
    seenDiagKeys.add(key)
    diagnostics.push(diag)
    console.warn(`[${pluginName}] ${diag.message}`)
  }

  /**
   * 确定性前序：先入队当前卡，再按 collectChildCards 返回顺序递归子卡。
   * depth：当前卡深度（根=0）。
   */
  async function expandCardChain(
    card: ReviewCard,
    depth: number,
    visitedInChain: Set<string>,
    rootKey: string
  ): Promise<void> {
    const cardKey = getCardKey(card)

    if (visitedInChain.has(cardKey)) {
      pushDiagnostic({
        truncated: true,
        reason: "cycle",
        rootKey,
        depth,
        message:
          `[SRS] 子卡展开遇循环：root=${rootKey} depth=${depth} card=${cardKey}，已安全终止该链路`
      })
      return
    }
    visitedInChain.add(cardKey)

    if (depth === 0) {
      // 正式根：始终保留，不计入辅助数量
      expandedQueue.push(card)
      appearedInQueue.add(cardKey)
    } else {
      if (depth > limits.maxDepth) {
        pushDiagnostic({
          truncated: true,
          reason: "max_depth",
          rootKey,
          depth,
          message:
            `[SRS] 子卡展开达最大深度：root=${rootKey} depth=${depth} > maxDepth=${limits.maxDepth}，已截断`
        })
        return
      }
      if (auxChildCount >= limits.maxAuxChildCards) {
        pushDiagnostic({
          truncated: true,
          reason: "max_count",
          rootKey,
          count: auxChildCount,
          message:
            `[SRS] 子卡展开达会话辅助数量上限：root=${rootKey} count=${auxChildCount} >= maxAuxChildCards=${limits.maxAuxChildCards}，已截断`
        })
        return
      }
      expandedQueue.push(card)
      appearedInQueue.add(cardKey)
      auxChildCount++
    }

    // 已在最大深度：本卡已入队，不再向下
    if (depth >= limits.maxDepth) {
      if (depth > 0 || limits.maxDepth === 0) {
        // 仅当可能还有子节点时再探测，避免无意义 await
        const maybeChildren = await collectChildCards(card.id, pluginName)
        if (maybeChildren.length > 0) {
          pushDiagnostic({
            truncated: true,
            reason: "max_depth",
            rootKey,
            depth: depth + 1,
            message:
              `[SRS] 子卡展开达最大深度：root=${rootKey} 停止于 depth=${depth}（maxDepth=${limits.maxDepth}），未展开 ${maybeChildren.length} 张直接子卡`
          })
        }
      }
      return
    }

    // 数量已满：根卡自身刚入队后若 aux 已满，也不再向下
    if (auxChildCount >= limits.maxAuxChildCards) {
      const maybeChildren = await collectChildCards(card.id, pluginName)
      if (maybeChildren.length > 0) {
        pushDiagnostic({
          truncated: true,
          reason: "max_count",
          rootKey,
          count: auxChildCount,
          message:
            `[SRS] 子卡展开达会话辅助数量上限：root=${rootKey} count=${auxChildCount}，未展开后续子卡`
        })
      }
      return
    }

    const childCards = await collectChildCards(card.id, pluginName)
    for (const childCard of childCards) {
      // 全局数量已满：截断本根剩余兄弟，外层仍继续后续正式根
      if (auxChildCount >= limits.maxAuxChildCards) {
        pushDiagnostic({
          truncated: true,
          reason: "max_count",
          rootKey,
          count: auxChildCount,
          message:
            `[SRS] 子卡展开达会话辅助数量上限：root=${rootKey} count=${auxChildCount}，截断剩余兄弟并保留后续正式根卡`
        })
        break
      }
      await expandCardChain(childCard, depth + 1, visitedInChain, rootKey)
    }
  }

  for (const card of formalRootCards) {
    const cardKey = getCardKey(card)

    if (appearedInQueue.has(cardKey)) {
      console.log(`[${pluginName}] 跳过根卡片 #${card.id}，已作为子卡片出现`)
      continue
    }

    const visitedInChain = new Set<string>()
    await expandCardChain(card, 0, visitedInChain, cardKey)
  }

  console.log(
    `[${pluginName}] expandChildCardsForRoots: 正式根卡 ${formalRootCards.length} 张，` +
      `辅助子卡 ${auxChildCount} 张，展开后 ${expandedQueue.length} 张` +
      `（maxDepth=${limits.maxDepth}, maxAux=${limits.maxAuxChildCards}` +
      `${diagnostics.length > 0 ? `, 截断 ${diagnostics.length} 处` : ""}）`
  )

  return {
    queue: expandedQueue,
    diagnostics,
    auxChildCount,
    resolvedLimits: limits
  }
}

/**
 * 构建带子卡片展开的复习队列（异步版本）
 *
 * FC-01：limits 只作用于正式根卡（baseQueue）；随根卡展开的辅助子卡不消耗额度。
 * FC-12：childExpandLimits 控制深度/辅助数量；默认 10 / 200。
 *
 * @param cards - ReviewCard 数组
 * @param pluginName - 插件名称
 * @param limits - 正式根卡每日上限；null/undefined = 不限额
 * @param childExpandLimits - 子卡展开限制；省略则用默认
 * @returns 展开子卡片后的复习队列（不含诊断；完整结果用 buildSessionReviewQueue）
 */
export async function buildReviewQueueWithChildren(
  cards: ReviewCard[],
  pluginName: string = "srs-plugin",
  limits?: ReviewQueueLimits | null,
  childExpandLimits?: Partial<ChildExpandLimits> | ChildExpandLimits | null
): Promise<ReviewCard[]> {
  const result = await buildSessionReviewQueue(
    cards,
    pluginName,
    limits,
    childExpandLimits
  )
  return result.queue
}

/**
 * 构建会话初始队列并返回正式根卡列表（供额度 seed 使用）与 FC-12 诊断。
 */
export async function buildSessionReviewQueue(
  cards: ReviewCard[],
  pluginName: string = "srs-plugin",
  limits?: ReviewQueueLimits | null,
  childExpandLimits?: Partial<ChildExpandLimits> | ChildExpandLimits | null
): Promise<SessionReviewQueueBuildResult> {
  const formalRootCards = buildReviewQueue(cards, limits)
  const expanded = await expandChildCardsForRoots(
    formalRootCards,
    pluginName,
    childExpandLimits
  )
  console.log(
    `[${pluginName}] buildSessionReviewQueue: 正式根卡 ${formalRootCards.length} 张，` +
      `展开后 ${expanded.queue.length} 张（辅助 ${expanded.auxChildCount}）`
  )
  return {
    queue: expanded.queue,
    formalRootCards,
    childExpandDiagnostics: expanded.diagnostics,
    childExpandLimits: expanded.resolvedLimits,
    auxChildCount: expanded.auxChildCount
  }
}
