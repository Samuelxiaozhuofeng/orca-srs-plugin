/**
 * 块卡片收集模块
 * 
 * 提供从指定块（查询块或普通块）收集卡片的功能
 * 用于右键菜单复习功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"
import { BlockWithRepr } from "./blockUtils"
import {
  convertBlockToReviewCards,
  hasCardTag
} from "./reviewCardFactory"

export { convertBlockToReviewCards, hasCardTag } from "./reviewCardFactory"

const PLUGIN_NAME = "srs-plugin"

/**
 * 判断块是否为查询块
 * 查询块的 _repr.type 为 "query"
 * 注意：Orca 中查询块的 _repr 存储在 properties 中
 * 
 * @param block - 块对象
 * @returns 是否为查询块
 */
export function isQueryBlock(block: BlockWithRepr | undefined): boolean {
  if (!block) return false
  
  // 方式1：从 properties 中获取 _repr（这是 Orca 的标准存储方式）
  const reprProperty = block.properties?.find(p => p.name === "_repr")
  if (reprProperty?.value?.type === "query") {
    return true
  }
  
  // 方式2：直接从 _repr 属性获取（兼容旧方式）
  if (block._repr?.type === "query") {
    return true
  }
  
  return false
}

/**
 * 获取查询块的结果列表
 * 通过执行查询块的查询语句来获取结果
 * 
 * @param blockId - 查询块 ID
 * @returns 查询结果块 ID 数组
 */
export async function getQueryResults(blockId: DbId): Promise<DbId[]> {
  // 必须从后端获取完整的块数据（state 中的数据可能不完整）
  const block = await orca.invokeBackend("get-block", blockId) as BlockWithRepr | undefined
  
  if (!block) {
    console.log(`[blockCardCollector] 无法获取块 ${blockId}`)
    return []
  }
  
  // 从 properties 中获取 _repr（这是 Orca 存储查询块数据的方式）
  const reprProperty = block.properties?.find(p => p.name === "_repr")
  const repr = reprProperty?.value
  
  if (!repr || repr.type !== "query") {
    console.log(`[blockCardCollector] 块 ${blockId} 不是查询块或没有 _repr`)
    return []
  }
  
  if (!repr.q) {
    console.log(`[blockCardCollector] 查询块 ${blockId} 没有查询语句 (repr.q)`)
    return []
  }
  
  console.log(`[blockCardCollector] 查询块 ${blockId} 的查询语句:`, JSON.stringify(repr.q))
  
  try {
    // 执行查询获取结果
    const queryResults = await orca.invokeBackend("query", repr.q) as DbId[] | null
    
    if (!queryResults || queryResults.length === 0) {
      console.log(`[blockCardCollector] 查询块 ${blockId} 查询结果为空`)
      return []
    }
    
    console.log(`[blockCardCollector] 查询块 ${blockId} 获取到 ${queryResults.length} 个结果`)
    return queryResults
  } catch (error) {
    console.error(`[blockCardCollector] 执行查询失败:`, error)
    return []
  }
}

/**
 * 递归获取所有子块 ID
 * 支持任意深度的块树结构
 * 
 * @param blockId - 父块 ID
 * @returns 所有子块 ID 数组（不包含父块本身）
 */
export async function getAllDescendantIds(blockId: DbId): Promise<DbId[]> {
  const result: DbId[] = []
  const visited = new Set<DbId>()
  
  async function traverse(id: DbId): Promise<void> {
    if (visited.has(id)) return
    visited.add(id)
    
    // 获取块数据
    let block = orca.state.blocks?.[id] as Block | undefined
    if (!block) {
      block = await orca.invokeBackend("get-block", id) as Block | undefined
    }
    
    if (!block?.children || block.children.length === 0) {
      return
    }
    
    // 遍历所有子块
    for (const childId of block.children) {
      result.push(childId)
      await traverse(childId)
    }
  }
  
  await traverse(blockId)
  return result
}

export async function collectCardsFromQueryBlock(
  blockId: DbId,
  pluginName: string = PLUGIN_NAME
): Promise<ReviewCard[]> {
  const cards: ReviewCard[] = []
  
  // 获取查询结果
  const resultIds = await getQueryResults(blockId)
  
  if (resultIds.length === 0) {
    return cards
  }
  
  // 遍历查询结果，收集带 #Card 标签的块
  for (const resultId of resultIds) {
    // 获取块数据
    let block = orca.state.blocks?.[resultId] as BlockWithRepr | undefined
    if (!block) {
      block = await orca.invokeBackend("get-block", resultId) as BlockWithRepr | undefined
    }
    
    if (!block) continue
    
    // 检查是否带有 #Card 标签
    if (!hasCardTag(block)) continue
    
    // 转换为 ReviewCard
    const blockCards = await convertBlockToReviewCards(block, pluginName)
    cards.push(...blockCards)
  }
  
  return cards
}


/**
 * 从普通块收集卡片（包含当前块和所有子块）
 * 
 * 先检查当前块是否是卡片，然后递归遍历子块并收集带 #Card 标签的块，转换为 ReviewCard
 * 
 * @param blockId - 块 ID
 * @param pluginName - 插件名称
 * @returns ReviewCard 数组
 */
export async function collectCardsFromChildren(
  blockId: DbId,
  pluginName: string = PLUGIN_NAME
): Promise<ReviewCard[]> {
  const cards: ReviewCard[] = []
  
  // 首先检查当前块本身是否是卡片
  let currentBlock = orca.state.blocks?.[blockId] as BlockWithRepr | undefined
  if (!currentBlock) {
    currentBlock = await orca.invokeBackend("get-block", blockId) as BlockWithRepr | undefined
  }
  
  if (currentBlock && hasCardTag(currentBlock)) {
    const currentBlockCards = await convertBlockToReviewCards(currentBlock, pluginName)
    cards.push(...currentBlockCards)
  }
  
  // 获取所有子块 ID
  const descendantIds = await getAllDescendantIds(blockId)
  
  // 遍历所有子块，收集带 #Card 标签的块
  for (const descendantId of descendantIds) {
    // 获取块数据
    let block = orca.state.blocks?.[descendantId] as BlockWithRepr | undefined
    if (!block) {
      block = await orca.invokeBackend("get-block", descendantId) as BlockWithRepr | undefined
    }
    
    if (!block) continue
    
    // 检查是否带有 #Card 标签
    if (!hasCardTag(block)) continue
    
    // 转换为 ReviewCard
    const blockCards = await convertBlockToReviewCards(block, pluginName)
    cards.push(...blockCards)
  }
  
  return cards
}

/**
 * 预估块中的卡片数量
 * 
 * 用于右键菜单显示预估卡片数量
 * 
 * @param blockId - 块 ID
 * @param isQuery - 是否为查询块
 * @returns 预估的卡片数量
 */
export async function estimateCardCount(
  blockId: DbId,
  isQuery: boolean
): Promise<number> {
  let count = 0
  
  if (isQuery) {
    // 查询块：统计查询结果中带 #Card 标签的块数量
    const resultIds = await getQueryResults(blockId)
    for (const resultId of resultIds) {
      let block = orca.state.blocks?.[resultId] as Block | undefined
      if (!block) {
        block = await orca.invokeBackend("get-block", resultId) as Block | undefined
      }
      if (block && hasCardTag(block)) {
        count++
      }
    }
  } else {
    // 普通块：统计当前块和子块中带 #Card 标签的块数量
    
    // 首先检查当前块本身
    let currentBlock = orca.state.blocks?.[blockId] as Block | undefined
    if (!currentBlock) {
      currentBlock = await orca.invokeBackend("get-block", blockId) as Block | undefined
    }
    if (currentBlock && hasCardTag(currentBlock)) {
      count++
    }
    
    // 然后统计子块
    const descendantIds = await getAllDescendantIds(blockId)
    for (const descendantId of descendantIds) {
      let block = orca.state.blocks?.[descendantId] as Block | undefined
      if (!block) {
        block = await orca.invokeBackend("get-block", descendantId) as Block | undefined
      }
      if (block && hasCardTag(block)) {
        count++
      }
    }
  }
  
  return count
}
