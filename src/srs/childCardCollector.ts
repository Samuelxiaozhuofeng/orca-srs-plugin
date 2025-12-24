/**
 * 子卡片收集模块
 * 
 * 通过反链（backRefs）收集父卡片的直接子卡片
 * 如果一个闪卡的反链中有带 #Card 标签的块，那些块就是子闪卡
 * 复习父卡片时，直接子卡片会被强制插入到队列中
 * 
 * 注意：只收集直接子卡片，不递归。每次复习一张卡片时都会收集它的直接子卡片。
 * 
 * 会话级追踪：每个父卡片在一次复习会话中只插入一次子卡片，
 * 避免 Again 按钮导致的重复插入问题。
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"
import { BlockWithRepr, isSrsCardBlock } from "./blockUtils"
import { hasCardTag, convertBlockToReviewCards } from "./blockCardCollector"

const PLUGIN_NAME = "srs-plugin"

// ========================================
// 会话级追踪：防止同一父卡片重复插入子卡片
// ========================================

/**
 * 已处理的父卡片集合（会话级）
 * 存储格式：blockId-clozeNumber-directionType
 * 
 * 当一张卡片被复习并插入子卡片后，记录到这个集合中。
 * 如果同一张卡片因为 Again 按钮再次进入队列并被复习，
 * 不会再次插入子卡片。
 */
const processedParentCards = new Set<string>()

/**
 * 生成父卡片的唯一键
 */
export function getParentCardKey(
  blockId: DbId,
  clozeNumber?: number,
  directionType?: string
): string {
  return `${blockId}-${clozeNumber || 0}-${directionType || "basic"}`
}

/**
 * 检查父卡片是否已经处理过（已插入子卡片）
 */
export function isParentCardProcessed(
  blockId: DbId,
  clozeNumber?: number,
  directionType?: string
): boolean {
  const key = getParentCardKey(blockId, clozeNumber, directionType)
  return processedParentCards.has(key)
}

/**
 * 标记父卡片为已处理
 */
export function markParentCardProcessed(
  blockId: DbId,
  clozeNumber?: number,
  directionType?: string
): void {
  const key = getParentCardKey(blockId, clozeNumber, directionType)
  processedParentCards.add(key)
  console.log(`[orca-srs] 标记父卡片已处理: ${key}`)
}

/**
 * 重置已处理的父卡片集合（新会话开始时调用）
 */
export function resetProcessedParentCards(): void {
  processedParentCards.clear()
  console.log("[orca-srs] 重置已处理父卡片集合")
}

/**
 * 从父卡片的反链中收集直接子卡片（不递归）
 * 
 * 逻辑：
 * 1. 获取父卡片的 backRefs（反向引用）
 * 2. 遍历每个反链，检查引用块是否带有 #Card 标签
 * 3. 如果是卡片，转换为 ReviewCard 并返回
 * 
 * @param parentBlockId - 父卡片块 ID
 * @param pluginName - 插件名称
 * @returns 直接子卡片数组
 */
export async function collectChildCards(
  parentBlockId: DbId,
  pluginName: string = PLUGIN_NAME
): Promise<ReviewCard[]> {
  const childCards: ReviewCard[] = []
  
  // 获取父卡片块数据
  let parentBlock = orca.state.blocks?.[parentBlockId] as BlockWithRepr | undefined
  if (!parentBlock) {
    parentBlock = await orca.invokeBackend("get-block", parentBlockId) as BlockWithRepr | undefined
  }
  
  if (!parentBlock) {
    return childCards
  }
  
  // 获取反链
  const backRefs = parentBlock.backRefs
  if (!backRefs || backRefs.length === 0) {
    return childCards
  }
  
  // 用于去重（同一个父卡片的直接子卡片不重复）
  const processedIds = new Set<DbId>()
  
  // 遍历反链
  for (const backRef of backRefs) {
    const refBlockId = backRef.from
    
    // 跳过已处理的块
    if (processedIds.has(refBlockId)) {
      continue
    }
    processedIds.add(refBlockId)
    
    // 获取引用块数据
    let refBlock = orca.state.blocks?.[refBlockId] as BlockWithRepr | undefined
    if (!refBlock) {
      refBlock = await orca.invokeBackend("get-block", refBlockId) as BlockWithRepr | undefined
    }
    
    if (!refBlock) {
      continue
    }
    
    // 检查引用块是否带有 #Card 标签
    if (!hasCardTag(refBlock) && !isSrsCardBlock(refBlock)) {
      continue
    }
    
    // 转换为 ReviewCard（只收集直接子卡片，不递归）
    const cards = await convertBlockToReviewCards(refBlock, pluginName)
    childCards.push(...cards)
  }
  
  if (childCards.length > 0) {
    console.log(`[${pluginName}] collectChildCards: 父卡片 #${parentBlockId} 有 ${childCards.length} 张直接子卡片`)
  }
  
  return childCards
}

/**
 * 检查卡片是否有子卡片
 * 
 * @param blockId - 卡片块 ID
 * @returns 是否有子卡片
 */
export async function hasChildCards(blockId: DbId): Promise<boolean> {
  // 获取块数据
  let block = orca.state.blocks?.[blockId] as BlockWithRepr | undefined
  if (!block) {
    block = await orca.invokeBackend("get-block", blockId) as BlockWithRepr | undefined
  }
  
  if (!block?.backRefs || block.backRefs.length === 0) {
    return false
  }
  
  // 检查反链中是否有卡片
  for (const backRef of block.backRefs) {
    let refBlock = orca.state.blocks?.[backRef.from] as Block | undefined
    if (!refBlock) {
      refBlock = await orca.invokeBackend("get-block", backRef.from) as Block | undefined
    }
    
    if (refBlock && hasCardTag(refBlock)) {
      return true
    }
  }
  
  return false
}

/**
 * 生成唯一的卡片键
 * 用于去重和比较卡片
 * 
 * @param card - ReviewCard 对象
 * @returns 唯一键字符串
 */
export function getCardKey(card: ReviewCard): string {
  return `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
}

/**
 * 将子卡片插入到队列指定位置
 * 
 * @param queue - 当前复习队列
 * @param childCards - 要插入的子卡片
 * @param insertIndex - 插入位置（子卡片将从这个位置开始插入）
 * @returns 新的队列
 */
export function insertChildCardsToQueue(
  queue: ReviewCard[],
  childCards: ReviewCard[],
  insertIndex: number
): ReviewCard[] {
  if (childCards.length === 0) {
    return queue
  }
  
  // 获取当前队列中所有卡片的键
  const existingKeys = new Set(queue.map(getCardKey))
  
  // 过滤掉已经在队列中的子卡片
  const newChildCards = childCards.filter(card => !existingKeys.has(getCardKey(card)))
  
  if (newChildCards.length === 0) {
    return queue
  }
  
  // 在指定位置插入子卡片
  const newQueue = [...queue]
  newQueue.splice(insertIndex, 0, ...newChildCards)
  
  return newQueue
}
