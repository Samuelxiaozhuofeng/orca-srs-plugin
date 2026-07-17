/**
 * 渐进阅读卡片收集器
 *
 * 负责收集到期的 Topic / Extract，并构建渐进阅读队列。
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { isCardTag } from "./tagUtils"
import { computeDueFromIntervalDays } from "./incrementalReadingDispersal"
import { ensureIRState, loadIRState, saveIRState } from "./incrementalReadingStorage"
import type { IRLastAction, IRReadingBreakpoint, IRStage } from "./incrementalReadingStorage"
import {
  getPostponeDays
} from "./incrementalReadingScheduler"
import {
  DEFAULT_IR_DAILY_LIMIT,
  DEFAULT_IR_TOPIC_QUOTA_PERCENT
} from "./settings/incrementalReadingSettingsSchema"

export type IRCardType = "topic" | "extracts"

export type IRCard = {
  id: DbId
  cardType: IRCardType
  priority: number
  position: number | null
  due: Date
  intervalDays: number
  postponeCount: number
  stage: IRStage
  lastAction: IRLastAction
  lastRead: Date | null
  readCount: number
  isNew: boolean
  resumeBlockId: DbId | null
  readingBreakpoint?: IRReadingBreakpoint | null
  sourceBookId: DbId | null
  sourceBookTitle: string | null
  /** Present for a Web Import Topic and inherited by its Extracts. */
  sourceWebUrl?: string | null
  sourceWebSiteName?: string | null
  batchId: string | null
  batchCreatedAt: Date | null
  sourceTopicId?: DbId | null
}

export type IRQueueOptions = {
  topicQuotaPercent?: number
  dailyLimit?: number
  now?: Date
}

/**
 * 获取指定日期的本地日开始时间（00:00:00）
 */
function getDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function readBlockProperty(block: Block, name: string): unknown {
  const rawValue = block.properties?.find(prop => prop.name === name)?.value
  if (Array.isArray(rawValue)) {
    return rawValue.length > 0 ? rawValue[0] : null
  }
  return rawValue
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const next = Number(value)
    if (Number.isFinite(next)) return next
  }
  return null
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value) return null
  const next = new Date(value as string | number | Date)
  return Number.isNaN(next.getTime()) ? null : next
}

function readIRSourceMeta(block: Block) {
  return {
    sourceBookId: parseOptionalNumber(readBlockProperty(block, "ir.sourceBookId")),
    sourceBookTitle: parseOptionalString(readBlockProperty(block, "ir.sourceBookTitle")),
    sourceWebUrl:
      parseOptionalString(readBlockProperty(block, "web.canonicalUrl"))
      ?? parseOptionalString(readBlockProperty(block, "web.sourceUrl")),
    sourceWebSiteName: parseOptionalString(readBlockProperty(block, "web.siteName")),
    batchId: parseOptionalString(readBlockProperty(block, "ir.batchId")),
    batchCreatedAt: parseOptionalDate(readBlockProperty(block, "ir.batchCreatedAt")),
    sourceTopicId: parseOptionalNumber(readBlockProperty(block, "ir.sourceTopicId"))
  }
}

type IRSourceMeta = ReturnType<typeof readIRSourceMeta>

function inheritWebSourceMeta(
  meta: IRSourceMeta,
  sourceMetaById: Map<DbId, IRSourceMeta>
): IRSourceMeta {
  if (meta.sourceWebUrl || meta.sourceTopicId == null) return meta
  const parentMeta = sourceMetaById.get(meta.sourceTopicId)
  if (!parentMeta?.sourceWebUrl) return meta
  return {
    ...meta,
    sourceWebUrl: parentMeta.sourceWebUrl,
    sourceWebSiteName: parentMeta.sourceWebSiteName
  }
}

/**
 * 收集所有带 #card 标签的块（只用于渐进阅读过滤）
 *
 * 查询失败会抛错，不得静默返回 [] 伪装成“没有卡片”。
 * 仅当后端成功返回空结果时才返回空数组。
 */
async function collectTaggedBlocks(pluginName: string): Promise<Block[]> {
  const possibleTags = ["card", "Card"]
  let tagged: Block[] = []
  let querySucceeded = false
  const errors: unknown[] = []

  for (const tag of possibleTags) {
    try {
      const result = await orca.invokeBackend("get-blocks-with-tags", [tag]) as Block[] | undefined
      querySucceeded = true
      if (result && result.length > 0) {
        tagged = [...tagged, ...result]
      }
    } catch (error) {
      errors.push(error)
      console.log(`[${pluginName}] collectTaggedBlocks: 查询标签 "${tag}" 失败:`, error)
    }
  }

  const unique = new Map<DbId, Block>()
  for (const block of tagged) {
    unique.set(block.id, block)
  }
  tagged = Array.from(unique.values())

  if (tagged.length === 0) {
    console.log(`[${pluginName}] collectTaggedBlocks: 直接查询无结果，使用备用方案`)
    try {
      const allBlocks = await orca.invokeBackend("get-all-blocks") as Block[] || []
      querySucceeded = true
      tagged = allBlocks.filter(block => {
        if (!block.refs || block.refs.length === 0) return false
        return block.refs.some(ref => ref.type === 2 && isCardTag(ref.alias))
      })
      console.log(`[${pluginName}] collectTaggedBlocks: 手动过滤找到 ${tagged.length} 个带 #card 标签的块`)
    } catch (error) {
      errors.push(error)
      console.error(`[${pluginName}] collectTaggedBlocks 备用方案失败:`, error)
      if (!querySucceeded) {
        throw error instanceof Error
          ? error
          : new Error(`渐进阅读标签查询失败: ${String(error)}`)
      }
    }
  }

  if (!querySucceeded && tagged.length === 0 && errors.length > 0) {
    const first = errors[0]
    throw first instanceof Error ? first : new Error(String(first))
  }

  return tagged
}

/**
 * 优先用 IR 索引缩小候选，失败则全量标签扫描并重建索引
 */
async function collectCandidateBlocks(pluginName: string): Promise<Block[]> {
  try {
    const {
      isIRIndexFresh,
      loadIRIndex,
      rebuildIRIndexFromCards
    } = await import("./incremental-reading/irIndex")
    const index = loadIRIndex(pluginName)
    if (
      index
      && isIRIndexFresh(index)
      && (index.topicIds.length > 0 || index.extractIds.length > 0)
    ) {
      const ids = [...index.topicIds, ...index.extractIds]
      const blocks: Block[] = []
      let missing = 0
      for (const id of ids) {
        try {
          const block = await orca.invokeBackend("get-block", id) as Block | undefined
          if (block) blocks.push(block)
          else missing += 1
        } catch {
          missing += 1
        }
      }
      // 索引大量失效时回退全量
      if (missing > ids.length * 0.3) {
        const full = await collectTaggedBlocks(pluginName)
        rebuildIRIndexFromCards(
          pluginName,
          full
            .map(b => {
              const t = extractCardType(b)
              if (t !== "topic" && t !== "extracts") return null
              return { id: b.id, cardType: t as "topic" | "extracts" }
            })
            .filter((x): x is { id: DbId; cardType: "topic" | "extracts" } => x != null)
        )
        return full
      }
      return blocks
    }
  } catch (error) {
    console.warn(`[${pluginName}] IR 索引路径失败，回退全量收集:`, error)
  }

  const full = await collectTaggedBlocks(pluginName)
  try {
    const { rebuildIRIndexFromCards } = await import("./incremental-reading/irIndex")
    rebuildIRIndexFromCards(
      pluginName,
      full
        .map(b => {
          const t = extractCardType(b)
          if (t !== "topic" && t !== "extracts") return null
          return { id: b.id, cardType: t as "topic" | "extracts" }
        })
        .filter((x): x is { id: DbId; cardType: "topic" | "extracts" } => x != null)
    )
  } catch {
    // 索引写入失败不影响收集
  }
  return full
}

/**
 * 基于给定块列表收集渐进阅读卡片（便于测试）
 */
export type CollectIRCardsFromBlocksResult = {
  cards: IRCard[]
  failedCount: number
}

export async function collectIRCardsFromBlocks(
  blocks: Block[],
  pluginName: string = "srs-plugin"
): Promise<IRCard[]> {
  const { cards } = await collectIRCardsFromBlocksDetailed(blocks, pluginName)
  return cards
}

const COLLECT_CONCURRENCY = 8

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await worker(items[current])
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    () => run()
  )
  await Promise.all(runners)
  return results
}

/**
 * 收集到期卡片并报告失败计数（部分失败不等于空队列）
 * 使用有限并发，避免顺序 N+1 阻塞首屏。
 */
export async function collectIRCardsFromBlocksDetailed(
  blocks: Block[],
  pluginName: string = "srs-plugin"
): Promise<CollectIRCardsFromBlocksResult> {
  const todayStartTime = getDayStart(new Date()).getTime()
  const candidates = blocks.filter(block => {
    const cardType = extractCardType(block)
    return cardType === "topic" || cardType === "extracts"
  })
  const sourceMetaById = new Map<DbId, IRSourceMeta>(
    blocks.map(block => [block.id, readIRSourceMeta(block)])
  )

  let failedCount = 0
  const mapped = await mapPool(candidates, COLLECT_CONCURRENCY, async (block) => {
    try {
      // 惰性迁移：属性明显缺失时 ensure，但始终以 load 结果为准（避免 ensure 默认值覆盖真实 due）
      const props = block.properties ?? []
      const missingCore = !props.some(p => p.name === "ir.priority") || !props.some(p => p.name === "ir.due")
      if (missingCore) {
        try {
          await ensureIRState(block.id)
        } catch (error) {
          console.warn(`[${pluginName}] ensureIRState 跳过 #${block.id}:`, error)
        }
      }

      const state = await loadIRState(block.id)
      const isNew = !state.lastRead
      const dueDayStartTime = getDayStart(state.due).getTime()
      const sourceMeta = inheritWebSourceMeta(
        sourceMetaById.get(block.id) ?? readIRSourceMeta(block),
        sourceMetaById
      )
      if (dueDayStartTime > todayStartTime) return null

      const cardType = extractCardType(block) as IRCardType
      return {
        id: block.id,
        cardType,
        priority: state.priority,
        position: state.position,
        due: state.due,
        intervalDays: state.intervalDays,
        postponeCount: state.postponeCount,
        stage: state.stage,
        lastAction: state.lastAction,
        lastRead: state.lastRead,
        readCount: state.readCount,
        isNew,
        resumeBlockId: state.resumeBlockId,
        readingBreakpoint: state.readingBreakpoint ?? null,
        ...sourceMeta
      } satisfies IRCard
    } catch (error) {
      failedCount += 1
      console.error(`[${pluginName}] collectIRCardsFromBlocks: 处理块 #${block.id} 失败:`, error)
      return null
    }
  })

  const cards: IRCard[] = []
  for (const item of mapped) {
    if (item) cards.push(item)
  }
  return { cards, failedCount }
}

/**
 * 基于给定块列表收集所有渐进阅读卡片（便于测试）
 */
export async function collectAllIRCardsFromBlocks(
  blocks: Block[],
  pluginName: string = "srs-plugin"
): Promise<IRCard[]> {
  const results: IRCard[] = []
  const sourceMetaById = new Map<DbId, IRSourceMeta>(
    blocks.map(block => [block.id, readIRSourceMeta(block)])
  )

  for (const block of blocks) {
    const cardType = extractCardType(block)
    if (cardType !== "topic" && cardType !== "extracts") continue

    try {
      await ensureIRState(block.id)
      const state = await loadIRState(block.id)
      const isNew = !state.lastRead
      const sourceMeta = inheritWebSourceMeta(
        sourceMetaById.get(block.id) ?? readIRSourceMeta(block),
        sourceMetaById
      )

      results.push({
        id: block.id,
        cardType,
        priority: state.priority,
        position: state.position,
        due: state.due,
        intervalDays: state.intervalDays,
        postponeCount: state.postponeCount,
        stage: state.stage,
        lastAction: state.lastAction,
        lastRead: state.lastRead,
        readCount: state.readCount,
        isNew,
        resumeBlockId: state.resumeBlockId,
        readingBreakpoint: state.readingBreakpoint ?? null,
        ...sourceMeta
      })
    } catch (error) {
      console.error(`[${pluginName}] collectAllIRCardsFromBlocks: 处理块 #${block.id} 失败:`, error)
    }
  }

  return results
}

/**
 * 收集到期的 Topic/Extract 卡片
 *
 * 失败时抛出错误，不得用空数组伪装成“暂无到期内容”。
 */
export async function collectIRCards(pluginName: string = "srs-plugin"): Promise<IRCard[]> {
  const detailed = await collectIRCardsDetailed(pluginName)
  return detailed.cards
}

/**
 * 收集到期卡片（含失败计数），支持有限并发读取以降低首屏阻塞。
 */
export async function collectIRCardsDetailed(
  pluginName: string = "srs-plugin"
): Promise<CollectIRCardsFromBlocksResult> {
  try {
    const taggedBlocks = await collectCandidateBlocks(pluginName)
    return await collectIRCardsFromBlocksDetailed(taggedBlocks, pluginName)
  } catch (error) {
    console.error(`[${pluginName}] collectIRCards 失败:`, error)
    orca.notify("error", "渐进阅读卡片收集失败", { title: "渐进阅读" })
    throw error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * 收集所有 Topic/Extract 卡片（不限到期状态）
 *
 * 失败时抛出错误，不得用空数组伪装成空库。
 */
export async function collectAllIRCards(pluginName: string = "srs-plugin"): Promise<IRCard[]> {
  try {
    const taggedBlocks = await collectCandidateBlocks(pluginName)
    return await collectAllIRCardsFromBlocks(taggedBlocks, pluginName)
  } catch (error) {
    console.error(`[${pluginName}] collectAllIRCards 失败:`, error)
    orca.notify("error", "渐进阅读卡片收集失败", { title: "渐进阅读" })
    throw error instanceof Error ? error : new Error(String(error))
  }
}

function compareTopicPosition(a: IRCard, b: IRCard): number {
  if (a.priority !== b.priority) return b.priority - a.priority

  const dueDelta = a.due.getTime() - b.due.getTime()
  if (dueDelta !== 0) return dueDelta

  const aPos = a.position ?? Number.POSITIVE_INFINITY
  const bPos = b.position ?? Number.POSITIVE_INFINITY
  if (aPos !== bPos) return aPos - bPos

  return a.id - b.id
}

function compareExtracts(a: IRCard, b: IRCard): number {
  const dueDelta = a.due.getTime() - b.due.getTime()
  if (dueDelta !== 0) return dueDelta
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.id - b.id
}

function sortTopics(cards: IRCard[]): IRCard[] {
  return [...cards].sort(compareTopicPosition)
}

function sortExtracts(cards: IRCard[]): IRCard[] {
  return [...cards].sort(compareExtracts)
}

function normalizePercent(value: number | undefined, fallback: number): number {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.min(100, Math.max(0, raw))
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.floor(raw))
}

function interleaveByRatio(topics: IRCard[], extracts: IRCard[], ratio: number): IRCard[] {
  if (ratio <= 0) return [...extracts]
  if (ratio >= 1) return [...topics]

  const queue: IRCard[] = []
  let topicIndex = 0
  let extractIndex = 0

  while (topicIndex < topics.length || extractIndex < extracts.length) {
    if (topicIndex >= topics.length) {
      queue.push(extracts[extractIndex++])
      continue
    }
    if (extractIndex >= extracts.length) {
      queue.push(topics[topicIndex++])
      continue
    }

    const currentRatio = topicIndex / Math.max(1, topicIndex + extractIndex)
    if (currentRatio < ratio) {
      queue.push(topics[topicIndex++])
    } else {
      queue.push(extracts[extractIndex++])
    }
  }

  return queue
}

function getMaxTopicPosition(cards: IRCard[], fallback: number): number {
  let max = Number.NEGATIVE_INFINITY
  for (const card of cards) {
    if (typeof card.position === "number" && Number.isFinite(card.position)) {
      if (card.position > max) max = card.position
    }
  }
  return Number.isFinite(max) ? max : fallback
}

async function deferOverflowCards(
  topics: IRCard[],
  extracts: IRCard[],
  now: Date,
  maxPositionSeed: number
): Promise<void> {
  if (topics.length === 0 && extracts.length === 0) return

  const clampIntervalDays = (cardType: IRCardType, rawDays: number): number => {
    const max = cardType === "extracts" ? 30 : 60
    return Math.min(max, Math.max(1, rawDays))
  }
  const tasks: Promise<void>[] = []

  topics.forEach((card, index) => {
    const nextPosition = maxPositionSeed + index + 1
    const postponeDays = getPostponeDays("topic", card.priority)
    const nextIntervalDays = clampIntervalDays("topic", postponeDays)
    const nextDue = computeDueFromIntervalDays(now, nextIntervalDays)
    tasks.push(saveIRState(card.id, {
      priority: card.priority,
      lastRead: card.lastRead,
      readCount: card.readCount,
      due: nextDue,
      intervalDays: nextIntervalDays,
      postponeCount: card.postponeCount + 1,
      stage: card.stage,
      lastAction: "autoPostpone",
      position: nextPosition,
      resumeBlockId: card.resumeBlockId,
      readingBreakpoint: card.readingBreakpoint ?? null,
      autoPostponeBatchId: null
    }))
  })

  extracts.forEach(card => {
    const postponeDays = getPostponeDays("extracts", card.priority)
    const nextIntervalDays = clampIntervalDays("extracts", postponeDays)
    const nextDue = computeDueFromIntervalDays(now, nextIntervalDays)
    tasks.push(saveIRState(card.id, {
      priority: card.priority,
      lastRead: card.lastRead,
      readCount: card.readCount,
      due: nextDue,
      intervalDays: nextIntervalDays,
      postponeCount: card.postponeCount + 1,
      stage: card.stage,
      lastAction: "autoPostpone",
      position: card.position,
      resumeBlockId: card.resumeBlockId,
      readingBreakpoint: card.readingBreakpoint ?? null,
      autoPostponeBatchId: null
    }))
  })

  const results = await Promise.allSettled(tasks)
  const failed = results.filter(result => result.status === "rejected")
  if (failed.length > 0) {
    console.warn("[IR] 溢出推后失败", { failed: failed.length })
  }
}

/**
 * 构建渐进阅读队列（Topic 配额 + Extract 配额）
 *
 * 注意：该函数只负责“选择今天最多 N 张并排序”，不会写回任何排期状态（不会修改 due/intervalDays）。
 */
export async function buildIRQueue(cards: IRCard[], options: IRQueueOptions = {}): Promise<IRCard[]> {
  const topics = sortTopics(cards.filter(card => card.cardType === "topic"))
  const extracts = sortExtracts(cards.filter(card => card.cardType === "extracts"))

  const topicQuotaPercent = normalizePercent(
    options.topicQuotaPercent,
    DEFAULT_IR_TOPIC_QUOTA_PERCENT
  )
  const dailyLimit = normalizeLimit(options.dailyLimit, DEFAULT_IR_DAILY_LIMIT)
  const ratio = topicQuotaPercent / 100

  if (dailyLimit <= 0) {
    return interleaveByRatio(topics, extracts, ratio)
  }

  const totalAvailable = topics.length + extracts.length
  const totalTarget = Math.min(dailyLimit, totalAvailable)

  const now = options.now ?? new Date()
  const todayStartTime = getDayStart(now).getTime()

  // Extract（复习）优先：先把“已逾期”的 extracts 放到队列最前面，避免被 topicQuota 稀释。
  const overdueExtracts = extracts.filter(card => getDayStart(card.due).getTime() < todayStartTime)
  const dueExtracts = extracts.filter(card => getDayStart(card.due).getTime() >= todayStartTime)

  const selectedOverdueExtracts = overdueExtracts.slice(0, totalTarget)
  let remainingSlots = totalTarget - selectedOverdueExtracts.length

  const maxTopics = Math.min(
    topics.length,
    Math.max(0, Math.round(totalTarget * ratio))
  )
  const selectedTopics = topics.slice(0, Math.min(maxTopics, remainingSlots))
  remainingSlots -= selectedTopics.length

  const selectedDueExtracts = dueExtracts.slice(0, remainingSlots)
  remainingSlots -= selectedDueExtracts.length

  if (remainingSlots > 0) {
    const extraTopics = topics.slice(selectedTopics.length, selectedTopics.length + remainingSlots)
    selectedTopics.push(...extraTopics)
    remainingSlots -= extraTopics.length
  }

  const queue = [
    ...selectedOverdueExtracts,
    ...interleaveByRatio(selectedTopics, selectedDueExtracts, ratio)
  ]

  return queue
}

/**
 * 将“溢出（未入选今天队列）”的卡片按优先级推后，并写回排期状态。
 *
 * - 用于“明确按钮”触发（例如：一键把溢出推后）
 * - 不会影响已入选 `queue` 的卡片
 */
export async function deferIROverflow(
  dueCards: IRCard[],
  queue: IRCard[],
  options: { now?: Date } = {}
): Promise<{ deferredCount: number }> {
  const topics = sortTopics(dueCards.filter(card => card.cardType === "topic"))
  const extracts = sortExtracts(dueCards.filter(card => card.cardType === "extracts"))
  const selectedIds = new Set(queue.map(card => card.id))

  const deferredTopics = topics.filter(card => !selectedIds.has(card.id))
  const deferredExtracts = extracts.filter(card => !selectedIds.has(card.id))
  const deferredCount = deferredTopics.length + deferredExtracts.length
  if (deferredCount === 0) return { deferredCount: 0 }

  const now = options.now ?? new Date()
  const maxPositionSeed = getMaxTopicPosition(topics, Date.now())

  try {
    await deferOverflowCards(deferredTopics, deferredExtracts, now, maxPositionSeed)
  } catch (error) {
    console.warn("[IR] 溢出推后异常:", error)
  }

  return { deferredCount }
}
