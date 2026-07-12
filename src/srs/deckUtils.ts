/**
 * Deck 管理工具函数
 * 
 * 提供从块中提取 deck 名称和计算 deck 统计信息的功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats, CardType } from "./types"
import { isCardTag, isChoiceTag } from "./tagUtils"

const DEFAULT_DECK_NAME = "Default"
const DECK_PROPERTY_NAME = "牌组"

/** 牌组目标块 get-blocks 批次大小，同时作为硬上限（与 storage 同量级，独立常量避免 mock 耦合） */
export const DECK_PREFETCH_BATCH_SIZE = 50
/** 牌组目标块 get-blocks 最大并发批次数，同时作为硬上限 */
export const DECK_PREFETCH_CONCURRENCY = 4

/**
 * 归一化受控正整数（与 storage.normalizeBoundedPositiveInt 同规则，本地副本避免 mock 耦合）。
 */
function normalizeBoundedPositiveIntLocal(
  value: unknown,
  defaultValue: number,
  maxValue: number
): number {
  const max = Number.isFinite(maxValue) && maxValue >= 1
    ? Math.floor(maxValue)
    : 1
  const fallbackRaw = Number.isFinite(defaultValue) && defaultValue >= 1
    ? Math.floor(defaultValue)
    : 1
  const fallback = Math.min(Math.max(1, fallbackRaw), max)

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback
  }
  const floored = Math.floor(value)
  if (floored < 1) {
    return fallback
  }
  return Math.min(floored, max)
}

/**
 * 固定上限并发（本文件自包含，避免 deckUtils → storage 循环/ mock 依赖）。
 * concurrency 经归一化：NaN/Infinity/小数/过大均不会创建无界 runner。
 */
async function runBoundedConcurrencyLocal<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const limit = normalizeBoundedPositiveIntLocal(
    concurrency,
    DECK_PREFETCH_CONCURRENCY,
    DECK_PREFETCH_CONCURRENCY
  )
  if (items.length === 0) return
  let next = 0
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++
        await worker(items[index], index)
      }
    }
  )
  await Promise.all(runners)
}

// 牌组名缓存：仅限单轮收集生命周期；collect 结束应 clearDeckNameCache
const deckNameCache = new Map<DbId, string>()

// Re-export CardType from types.ts for backward compatibility
export type { CardType } from "./types"

/**
 * 清空牌组名称缓存（单轮收集结束 / 测试隔离）。
 * 不得作为长期跨会话索引：牌组块重命名等无可靠失效事件。
 */
export function clearDeckNameCache(): void {
  deckNameCache.clear()
}

/** 测试/诊断：缓存条目数 */
export function getDeckNameCacheSize(): number {
  return deckNameCache.size
}

/**
 * 从块的标签属性系统中提取卡片类型
 *
 * 工作原理：
 * 1. 首先检查是否有 #choice 标签（选择题卡片）
 * 2. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 3. 从引用的 data 数组中找到 name="type" 的属性
 * 4. 返回该属性的 value，如果不存在返回 "basic"
 *
 * 用户操作流程：
 * 1. 在 Orca 标签页面为 #card 标签定义属性 "type"（类型：单选/多选文本）
 * 2. 添加可选值（如 "basic", "cloze", "direction"）
 * 3. 给块打 #card 标签后，从下拉菜单选择 type 值
 * 4. 或者使用 cloze/direction 按钮时自动设置对应类型
 * 5. 或者添加 #choice 标签创建选择题卡片
 *
 * @param block - 块对象
 * @returns 卡片类型，"basic"、"cloze"、"direction"、"excerpt"、"choice"、"topic" 或 "extracts"，默认为 "basic"
 */
export function extractCardType(block: Block): CardType {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return "basic"
  }

  // 1. 首先检查是否有 #choice 标签（选择题卡片优先）
  const hasChoiceTag = block.refs.some(ref =>
    ref.type === 2 &&        // RefType.Property（标签引用）
    isChoiceTag(ref.alias)   // 标签名称为 "choice"（大小写不敏感）
  )
  
  if (hasChoiceTag) {
    return "choice"
  }

  // 2. 找到 #card 标签引用
  const cardRef = block.refs.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    isCardTag(ref.alias)   // 标签名称为 "card"（大小写不敏感）
  )

  // 边界情况：没有找到 #card 标签引用
  if (!cardRef) {
    return "basic"
  }

  // 边界情况：标签引用没有关联数据
  if (!cardRef.data || cardRef.data.length === 0) {
    return "basic"
  }

  // 3. 从标签关联数据中读取 type 属性
  const typeProperty = cardRef.data.find(d => d.name === "type")

  // 边界情况：没有设置 type 属性
  if (!typeProperty) {
    return "basic"
  }

  // 4. 返回 type 值
  const typeValue = typeProperty.value

  // 处理多选类型（数组）和单选类型（字符串）
  if (Array.isArray(typeValue)) {
    // 多选类型：取数组的第一个值
    if (typeValue.length === 0 || !typeValue[0] || typeof typeValue[0] !== "string") {
      return "basic"
    }
    const rawValue = typeValue[0].trim()
    const firstValue = rawValue.toLowerCase()
    if (firstValue === "topic") return "topic"
    if (firstValue === "extracts") return "extracts"
    if (firstValue === "cloze") return "cloze"
    if (firstValue === "direction") return "direction"
    if (firstValue === "list") return "list"
    if (firstValue === "excerpt") return "excerpt"
    if (firstValue === "choice") return "choice"
    return "basic"
  } else if (typeof typeValue === "string") {
    // 单选类型：直接使用字符串
    const rawValue = typeValue.trim()
    const trimmedValue = rawValue.toLowerCase()
    if (trimmedValue === "topic") return "topic"
    if (trimmedValue === "extracts") return "extracts"
    if (trimmedValue === "cloze") return "cloze"
    if (trimmedValue === "direction") return "direction"
    if (trimmedValue === "list") return "list"
    if (trimmedValue === "excerpt") return "excerpt"
    if (trimmedValue === "choice") return "choice"
    return "basic"
  }

  // 其他类型：默认为 basic
  return "basic"
}

/**
 * 从卡片块解析「牌组」属性指向的目标块 ID（未配置则 null）。
 * 同步、无后端调用；用于批量预取前的去重收集。
 */
export function getDeckTargetBlockId(block: Block): DbId | null {
  if (!block.refs || block.refs.length === 0) return null

  const cardRef = block.refs.find(
    (ref) => ref.type === 2 && isCardTag(ref.alias)
  )
  if (!cardRef?.data || cardRef.data.length === 0) return null

  const deckProperty = cardRef.data.find((d) => d.name === DECK_PROPERTY_NAME)
  if (!deckProperty) return null

  const refIds = deckProperty.value
  if (!Array.isArray(refIds) || refIds.length === 0) return null

  const firstRefId = normalizeDbId(refIds[0])
  if (!firstRefId) return null

  const deckRef = block.refs.find((r) => r.id === firstRefId)
  if (!deckRef) return null

  return deckRef.to as DbId
}

/**
 * 从多个卡片块收集去重后的牌组目标块 ID。
 */
export function collectDeckTargetBlockIds(
  blocks: ReadonlyArray<Block>
): DbId[] {
  const ids: DbId[] = []
  const seen = new Set<DbId>()
  for (const block of blocks) {
    const id = getDeckTargetBlockId(block)
    if (id == null || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export type PrefetchDeckNamesOptions = {
  batchSize?: number
  concurrency?: number
}

export type PrefetchDeckNamesResult = {
  /** 去重后的牌组目标块数 */
  uniqueDeckIds: number
  /** 来自 orca.state.blocks / 已有缓存、无需后端的数量 */
  resolvedFromStateOrCache: number
  /** 经 get-blocks 拉取的目标块数 */
  fetchedFromBackend: number
  getBlocksCalls: number
  batchCount: number
  concurrencyPeak: number
}

/**
 * 批量预取牌组名称并写入本轮 deckNameCache。
 *
 * 顺序：
 * 1. 去重牌组目标 block ID
 * 2. 复用 deckNameCache 与 orca.state.blocks
 * 3. 缺失 ID 用正式 `get-blocks` 分批读取（批次/并发有上限）
 *
 * 批量读取失败会抛出（并 console.error），不得用 Default 静默掩盖已配置牌组。
 * 调用方应在单轮收集结束后 clearDeckNameCache，避免长期错误缓存。
 */
export async function prefetchDeckNamesForBlocks(
  blocks: ReadonlyArray<Block>,
  options: PrefetchDeckNamesOptions = {}
): Promise<PrefetchDeckNamesResult> {
  const batchSize = normalizeBoundedPositiveIntLocal(
    options.batchSize,
    DECK_PREFETCH_BATCH_SIZE,
    DECK_PREFETCH_BATCH_SIZE
  )
  const concurrency = normalizeBoundedPositiveIntLocal(
    options.concurrency,
    DECK_PREFETCH_CONCURRENCY,
    DECK_PREFETCH_CONCURRENCY
  )

  const allIds = collectDeckTargetBlockIds(blocks)
  let resolvedFromStateOrCache = 0
  const missing: DbId[] = []

  for (const id of allIds) {
    if (deckNameCache.has(id)) {
      resolvedFromStateOrCache++
      continue
    }
    const fromState = (
      orca.state.blocks as Record<number, Block | undefined> | undefined
    )?.[id as unknown as number]
    const stateText = fromState?.text?.trim()
    if (stateText) {
      deckNameCache.set(id, stateText)
      resolvedFromStateOrCache++
      continue
    }
    missing.push(id)
  }

  if (missing.length === 0) {
    return {
      uniqueDeckIds: allIds.length,
      resolvedFromStateOrCache,
      fetchedFromBackend: 0,
      getBlocksCalls: 0,
      batchCount: 0,
      concurrencyPeak: 0
    }
  }

  const batches: DbId[][] = []
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(missing.slice(i, i + batchSize))
  }

  let concurrencyPeak = 0
  let active = 0
  let getBlocksCalls = 0
  let fetchedFromBackend = 0

  await runBoundedConcurrencyLocal(batches, concurrency, async (batch) => {
    active++
    if (active > concurrencyPeak) concurrencyPeak = active
    try {
      getBlocksCalls++
      const result = (await orca.invokeBackend("get-blocks", batch)) as
        | Block[]
        | undefined
        | null
      if (!Array.isArray(result)) {
        throw new Error(
          `[deckUtils] get-blocks 返回非数组（deck batchSize=${batch.length}）`
        )
      }
      const byId = new Map<DbId, Block>()
      for (const block of result) {
        if (block?.id != null) byId.set(block.id, block)
      }
      for (const id of batch) {
        const text = byId.get(id)?.text?.trim()
        if (text) {
          deckNameCache.set(id, text)
          fetchedFromBackend++
        }
        // 缺失文本：不写入 cache；extractDeckName 将回退 Default（块确实不存在/无文本）
      }
    } catch (error) {
      console.error(
        `[deckUtils] 牌组目标块 get-blocks 失败（ids=${batch.slice(0, 8).join(",")}${batch.length > 8 ? "…" : ""} count=${batch.length}）:`,
        error
      )
      throw error
    } finally {
      active--
    }
  })

  return {
    uniqueDeckIds: allIds.length,
    resolvedFromStateOrCache,
    fetchedFromBackend,
    getBlocksCalls,
    batchCount: batches.length,
    concurrencyPeak
  }
}

/**
 * 从块的标签属性系统中提取牌组名称（无迁移，直接替换旧的 deck 方案）
 *
 * 工作原理：
 * 1. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 2. 从引用的 data 数组中找到 name="牌组" 且 type=2 (PropType.BlockRefs) 的属性
 * 3. 读取 value 中的引用 ID（数组，通常只取第一个）
 * 4. 在 block.refs 中根据引用 ID 找到对应的 BlockRef，取其 to 指向的块
 * 5. 读取目标块 text 作为牌组名称；任何一步失败都返回 "Default"
 *
 * 批量路径：先调用 prefetchDeckNamesForBlocks，再对本函数做同步缓存命中。
 *
 * @param block - 块对象
 * @returns 牌组名称，默认为 "Default"
 */
export async function extractDeckName(block: Block): Promise<string> {
  const deckTargetId = getDeckTargetBlockId(block)
  if (deckTargetId == null) {
    return DEFAULT_DECK_NAME
  }

  const deckName = await resolveBlockText(deckTargetId)
  if (!deckName) {
    return DEFAULT_DECK_NAME
  }
  return deckName
}

function normalizeDbId(value: unknown): DbId | null {
  if (typeof value === "number" && Number.isFinite(value)) return value as DbId
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed as DbId
  }
  return null
}

async function resolveBlockText(blockId: DbId): Promise<string | null> {
  const cached = deckNameCache.get(blockId)
  if (cached !== undefined) return cached

  const blockFromState = (orca.state.blocks as Record<number, Block | undefined> | undefined)?.[blockId as unknown as number]
  const stateText = blockFromState?.text?.trim()
  if (stateText) {
    deckNameCache.set(blockId, stateText)
    return stateText
  }

  // 未预取时的兼容路径：单卡 get-block（收集路径应先 prefetch 避免 N 次调用）
  const blockFromBackend = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
  const backendText = blockFromBackend?.text?.trim()
  if (!backendText) return null

  deckNameCache.set(blockId, backendText)
  return backendText
}

/**
 * 计算 deck 统计信息
 * 从 ReviewCard 列表中统计每个 deck 的卡片数量和到期情况
 * 
 * 使用精确时间判断到期状态
 * 
 * @param cards - ReviewCard 数组
 * @returns DeckStats 统计对象
 */
export function calculateDeckStats(cards: ReviewCard[]): DeckStats {
  const deckMap = new Map<string, DeckInfo>()
  const now = new Date()
  const nowTime = now.getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // 遍历所有卡片，统计各 deck 信息
  for (const card of cards) {
    const deckName = card.deck

    if (!deckMap.has(deckName)) {
      deckMap.set(deckName, {
        name: deckName,
        totalCount: 0,
        newCount: 0,
        overdueCount: 0,
        todayCount: 0,
        futureCount: 0
      })
    }

    const deckInfo = deckMap.get(deckName)!
    deckInfo.totalCount++

    if (card.isNew) {
      deckInfo.newCount++
    } else {
      // 判断卡片属于哪个到期类别（精确时间判断）
      const dueTime = card.srs.due.getTime()

      if (dueTime <= nowTime) {
        // 已到期（精确到时分秒）
        deckInfo.overdueCount++
      } else if (card.srs.due >= today && card.srs.due < tomorrow) {
        // 今天稍后到期（还没到时间）
        deckInfo.todayCount++
      } else {
        // 未来到期
        deckInfo.futureCount++
      }
    }
  }

  const decks = Array.from(deckMap.values())

  // 排序：Default 在最前，其他按名称排序
  decks.sort((a, b) => {
    if (a.name === "Default" && b.name !== "Default") return -1
    if (a.name !== "Default" && b.name === "Default") return 1
    return a.name.localeCompare(b.name)
  })

  return {
    decks,
    totalCards: cards.length,
    totalNew: cards.filter(c => c.isNew).length,
    totalOverdue: cards.filter(c => {
      if (c.isNew) return false
      return c.srs.due.getTime() <= nowTime
    }).length
  }
}


/**
 * 计算 Flash Home 首页统计数据
 * 
 * @param cards - ReviewCard 数组
 * @returns TodayStats 统计对象
 * 
 * 统计说明：
 * - todayCount: 今天到期的复习卡片数（不含新卡）- 使用精确时间判断
 * - newCount: 新卡数量
 * - pendingCount: 所有待复习卡片数（已到期，精确到时分秒）
 * - totalCount: 总卡片数
 * 
 * 需求: 1.1, 1.2, 1.3
 */
export function calculateHomeStats(cards: ReviewCard[]): TodayStats {
  const now = new Date()
  const nowTime = now.getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let todayCount = 0
  let newCount = 0
  let pendingCount = 0
  const totalCount = cards.length

  for (const card of cards) {
    if (card.isNew) {
      newCount++
    } else {
      // 非新卡：判断到期状态（精确到时分秒）
      const dueTime = card.srs.due.getTime()

      if (dueTime <= nowTime) {
        // 已到期的卡片（精确时间判断）
        pendingCount++

        // 如果到期时间在今天范围内，也计入 todayCount
        if (card.srs.due >= today && card.srs.due < tomorrow) {
          todayCount++
        }
      }
      // 如果 dueTime > nowTime，则是未来到期，不计入任何统计
    }
  }

  return {
    todayCount,
    newCount,
    pendingCount,
    totalCount
  }
}
