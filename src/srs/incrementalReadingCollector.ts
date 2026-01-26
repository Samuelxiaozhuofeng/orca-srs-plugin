/**
 * 渐进阅读卡片收集器
 *
 * 负责收集到期的 Topic / Extract，并构建渐进阅读队列。
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { isCardTag } from "./tagUtils"
import { ensureIRState, loadIRState } from "./incrementalReadingStorage"

export type IRCardType = "topic" | "extracts"

export type IRCard = {
  id: DbId
  cardType: IRCardType
  priority: number
  due: Date
  lastRead: Date | null
  readCount: number
  isNew: boolean
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

      if (isNew || dueDayStartTime <= todayStartTime) {
        results.push({
          id: block.id,
          cardType,
          priority: state.priority,
          due: state.due,
          lastRead: state.lastRead,
          readCount: state.readCount,
          isNew
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
        due: state.due,
        lastRead: state.lastRead,
        readCount: state.readCount,
        isNew
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

function compareCardType(a: IRCardType, b: IRCardType): number {
  if (a === b) return 0
  if (a === "topic") return -1
  return 1
}

function sortCardsByPriority(cards: IRCard[]): IRCard[] {
  return [...cards].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return compareCardType(a.cardType, b.cardType)
  })
}

/**
 * 构建渐进阅读队列（2:1 混合策略）
 */
export function buildIRQueue(cards: IRCard[]): IRCard[] {
  const dueCards = sortCardsByPriority(cards.filter(card => !card.isNew))
  const newCards = sortCardsByPriority(cards.filter(card => card.isNew))

  const queue: IRCard[] = []
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
