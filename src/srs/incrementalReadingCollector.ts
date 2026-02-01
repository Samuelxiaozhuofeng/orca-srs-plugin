/**
 * 渐进阅读卡片收集器
 *
 * 负责收集到期的 Topic / Extract，并构建渐进阅读队列。
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { isCardTag } from "./tagUtils"
import { ensureIRState, loadIRState, saveIRState } from "./incrementalReadingStorage"
import type { IRLastAction, IRStage } from "./incrementalReadingStorage"
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

/**
 * 收集所有带 #card 标签的块（只用于渐进阅读过滤）
 */
async function collectTaggedBlocks(pluginName: string): Promise<Block[]> {
  const possibleTags = ["card", "Card"]
  let tagged: Block[] = []

  for (const tag of possibleTags) {
    try {
      const result = await orca.invokeBackend("get-blocks-with-tags", [tag]) as Block[] | undefined
      if (result && result.length > 0) {
        tagged = [...tagged, ...result]
      }
    } catch (error) {
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
      tagged = allBlocks.filter(block => {
        if (!block.refs || block.refs.length === 0) return false
        return block.refs.some(ref => ref.type === 2 && isCardTag(ref.alias))
      })
      console.log(`[${pluginName}] collectTaggedBlocks: 手动过滤找到 ${tagged.length} 个带 #card 标签的块`)
    } catch (error) {
      console.error(`[${pluginName}] collectTaggedBlocks 备用方案失败:`, error)
      tagged = []
    }
  }

  return tagged
}

/**
 * 基于给定块列表收集渐进阅读卡片（便于测试）
 */
export async function collectIRCardsFromBlocks(
  blocks: Block[],
  pluginName: string = "srs-plugin"
): Promise<IRCard[]> {
  const todayStartTime = getDayStart(new Date()).getTime()
  const results: IRCard[] = []

  for (const block of blocks) {
    const cardType = extractCardType(block)
    if (cardType !== "topic" && cardType !== "extracts") continue

    try {
      await ensureIRState(block.id)
      const state = await loadIRState(block.id)
      const isNew = !state.lastRead
      const dueDayStartTime = getDayStart(state.due).getTime()

      // 按“天”边界判断是否到期（包括新卡），确保排期生效。
      if (dueDayStartTime <= todayStartTime) {
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
          resumeBlockId: state.resumeBlockId
        })
      }
    } catch (error) {
      console.error(`[${pluginName}] collectIRCardsFromBlocks: 处理块 #${block.id} 失败:`, error)
    }
  }

  return results
}

/**
 * 基于给定块列表收集所有渐进阅读卡片（便于测试）
 */
export async function collectAllIRCardsFromBlocks(
  blocks: Block[],
  pluginName: string = "srs-plugin"
): Promise<IRCard[]> {
  const results: IRCard[] = []

  for (const block of blocks) {
    const cardType = extractCardType(block)
    if (cardType !== "topic" && cardType !== "extracts") continue

    try {
      await ensureIRState(block.id)
      const state = await loadIRState(block.id)
      const isNew = !state.lastRead

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
        resumeBlockId: state.resumeBlockId
      })
    } catch (error) {
      console.error(`[${pluginName}] collectAllIRCardsFromBlocks: 处理块 #${block.id} 失败:`, error)
    }
  }

  return results
}

/**
 * 收集到期的 Topic/Extract 卡片
 */
export async function collectIRCards(pluginName: string = "srs-plugin"): Promise<IRCard[]> {
  try {
    const taggedBlocks = await collectTaggedBlocks(pluginName)
    return await collectIRCardsFromBlocks(taggedBlocks, pluginName)
  } catch (error) {
    console.error(`[${pluginName}] collectIRCards 失败:`, error)
    orca.notify("error", "渐进阅读卡片收集失败", { title: "渐进阅读" })
    return []
  }
}

/**
 * 收集所有 Topic/Extract 卡片（不限到期状态）
 */
export async function collectAllIRCards(pluginName: string = "srs-plugin"): Promise<IRCard[]> {
  try {
    const taggedBlocks = await collectTaggedBlocks(pluginName)
    return await collectAllIRCardsFromBlocks(taggedBlocks, pluginName)
  } catch (error) {
    console.error(`[${pluginName}] collectAllIRCards 失败:`, error)
    orca.notify("error", "渐进阅读卡片收集失败", { title: "渐进阅读" })
    return []
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

  const DAY_MS = 24 * 60 * 60 * 1000
  const clampIntervalDays = (cardType: IRCardType, rawDays: number): number => {
    const max = cardType === "extracts" ? 30 : 60
    return Math.min(max, Math.max(1, rawDays))
  }
  const tasks: Promise<void>[] = []

  topics.forEach((card, index) => {
    const nextPosition = maxPositionSeed + index + 1
    const postponeDays = getPostponeDays("topic", card.priority)
    const nextIntervalDays = clampIntervalDays("topic", postponeDays)
    const nextDue = new Date(now.getTime() + nextIntervalDays * DAY_MS)
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
      resumeBlockId: card.resumeBlockId
    }))
  })

  extracts.forEach(card => {
    const postponeDays = getPostponeDays("extracts", card.priority)
    const nextIntervalDays = clampIntervalDays("extracts", postponeDays)
    const nextDue = new Date(now.getTime() + nextIntervalDays * DAY_MS)
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
      resumeBlockId: card.resumeBlockId
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
