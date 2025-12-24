/**
 * 块卡片收集模块
 * 
 * 提供从指定块（查询块或普通块）收集卡片的功能
 * 用于右键菜单复习功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard, TagInfo } from "./types"
import { BlockWithRepr, isSrsCardBlock, resolveFrontBack } from "./blockUtils"
import { extractDeckName, extractCardType } from "./deckUtils"
import { extractCardStatus } from "./cardStatusUtils"
import { 
  ensureCardSrsState,
  ensureClozeSrsState,
  ensureDirectionSrsState
} from "./storage"
import { getAllClozeNumbers } from "./clozeUtils"
import { extractDirectionInfo, getDirectionList } from "./directionUtils"
import { isCardTag } from "./tagUtils"

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


/**
 * 判断块是否带有 #Card 标签
 * 
 * @param block - 块对象
 * @returns 是否带有 #Card 标签
 */
export function hasCardTag(block: Block | undefined): boolean {
  if (!block?.refs || block.refs.length === 0) return false
  return block.refs.some(ref => ref.type === 2 && isCardTag(ref.alias))
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
 * 将单个块转换为 ReviewCard 数组
 * 
 * 对于 Cloze 卡片，为每个填空编号生成独立的 ReviewCard
 * 对于 Direction 卡片，根据方向类型生成一张或两张 ReviewCard
 * 
 * @param block - 块对象
 * @param pluginName - 插件名称
 * @returns ReviewCard 数组
 */
export async function convertBlockToReviewCards(
  block: BlockWithRepr,
  pluginName: string = PLUGIN_NAME
): Promise<ReviewCard[]> {
  const cards: ReviewCard[] = []
  
  if (!isSrsCardBlock(block) && !hasCardTag(block)) {
    return cards
  }

  // 过滤已暂停的卡片
  const status = extractCardStatus(block)
  if (status === "suspend") {
    console.log(`[${pluginName}] convertBlockToReviewCards: 跳过已暂停的卡片 #${block.id}`)
    return cards
  }

  // 识别卡片类型
  const cardType = extractCardType(block)
  const deckName = await extractDeckName(block)

  if (cardType === "cloze") {
    // Cloze 卡片：为每个填空编号生成独立的 ReviewCard
    const clozeNumbers = getAllClozeNumbers(block.content, pluginName)

    if (clozeNumbers.length === 0) {
      return cards
    }

    for (const clozeNumber of clozeNumbers) {
      const srsState = await ensureClozeSrsState(block.id, clozeNumber, clozeNumber - 1)

      // front 使用块文本（将在渲染时隐藏对应填空）
      const front = block.text || ""

      cards.push({
        id: block.id,
        front,
        back: `（填空 c${clozeNumber}）`,
        srs: srsState,
        isNew: !srsState.lastReviewed || srsState.reps === 0,
        deck: deckName,
        tags: extractNonCardTags(block),
        clozeNumber,
        content: block.content
      })
    }
  } else if (cardType === "direction") {
    // Direction 卡片：根据方向类型生成一张或两张卡片
    const dirInfo = extractDirectionInfo(block.content, pluginName)
    
    if (!dirInfo) {
      return cards
    }

    // 允许用户先插入方向符号再补全右侧文本：未完成的方向卡不进入复习队列
    if (!dirInfo.leftText || !dirInfo.rightText) {
      return cards
    }

    // 获取需要生成卡片的方向列表
    const directions = getDirectionList(dirInfo.direction)

    for (let i = 0; i < directions.length; i++) {
      const dir = directions[i]

      const srsState = await ensureDirectionSrsState(block.id, dir, i)

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
        tags: extractNonCardTags(block),
        directionType: dir
      })
    }
  } else if (cardType === "excerpt") {
    // Excerpt 卡片：只显示内容，无正反面
    const content = block.text || ""
    const srsState = await ensureCardSrsState(block.id, new Date())

    cards.push({
      id: block.id,
      front: content,
      back: "",
      srs: srsState,
      isNew: !srsState.lastReviewed || srsState.reps === 0,
      deck: deckName,
      tags: extractNonCardTags(block)
    })
  } else {
    // Basic 卡片：传统的正面/反面模式
    // 检查是否有子块 - 如果没有子块，当作摘录卡处理
    const hasChildren = block.children && block.children.length > 0
    
    if (!hasChildren) {
      // 无子块：当作摘录卡处理（只显示内容，无正反面）
      const content = block.text || ""
      const srsState = await ensureCardSrsState(block.id, new Date())

      cards.push({
        id: block.id,
        front: content,  // 摘录内容作为 front
        back: "",        // 无 back
        srs: srsState,
        isNew: !srsState.lastReviewed || srsState.reps === 0,
        deck: deckName,
        tags: extractNonCardTags(block)
      })
    } else {
      // 有子块：正常的正面/反面模式
      const { front, back } = resolveFrontBack(block)
      const srsState = await ensureCardSrsState(block.id, new Date())

      cards.push({
        id: block.id,
        front,
        back,
        srs: srsState,
        isNew: !srsState.lastReviewed || srsState.reps === 0,
        deck: deckName,
        tags: extractNonCardTags(block)
      })
    }
  }

  return cards
}

/**
 * 从查询块收集卡片
 * 
 * 从查询结果中筛选带 #Card 标签的块，并转换为 ReviewCard
 * 
 * @param blockId - 查询块 ID
 * @param pluginName - 插件名称
 * @returns ReviewCard 数组
 */
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
