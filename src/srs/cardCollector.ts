/**
 * 卡片收集模块
 * 
 * 提供 SRS 卡片的收集、过滤和复习队列构建功能
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
 * @param pluginName - 插件名称（用于日志），可选
 * @returns ReviewCard 数组
 */
export async function collectReviewCards(pluginName: string = "srs-plugin"): Promise<ReviewCard[]> {
  const blocks = await collectSrsBlocks(pluginName)
  const now = new Date()
  const cards: ReviewCard[] = []

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
        tags: extractNonCardTags(block)
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
          tags: extractNonCardTags(block)
          // clozeNumber 和 directionType 都为 undefined（非特殊卡片）
        })
      }
    }
  }

  return cards
}

/**
 * 构建复习队列
 * 使用 2:1 策略交错到期卡片和新卡片
 * 
 * 子卡片展开逻辑：
 * - 对于每张卡片，检查它的反链中是否有子卡片
 * - 如果有，将子卡片链展开并插入到父卡片后面
 * - 这样可以实现 A1 → B → C → D → A2 → B → C → D 的复习顺序
 *
 * 到期判断逻辑（精确时间）：
 * - 使用精确的时分秒进行比较
 * - 只有卡片的到期时间 <= 当前时间，才视为到期
 * - 新卡也要检查到期时间
 * - 这样可以实现 Learning 阶段的精确间隔控制
 *
 * @param cards - ReviewCard 数组
 * @returns 排序后的复习队列
 */
export function buildReviewQueue(cards: ReviewCard[]): ReviewCard[] {
  const now = new Date()
  const nowTime = now.getTime()

  // 到期卡片：已复习过 && 到期时间 <= 当前时间（精确到时分秒）
  const dueCards = cards.filter(card => {
    if (card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

  // 新卡片：未复习过 && 到期时间 <= 当前时间（精确到时分秒）
  const newCards = cards.filter(card => {
    if (!card.isNew) return false
    return card.srs.due.getTime() <= nowTime
  })

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
 * 构建带子卡片展开的复习队列（异步版本）
 * 
 * 对于每张"根卡片"（初始队列中的卡片），收集它的完整子卡片链。
 * 每个根卡片都会展开自己的子卡片链，子卡片可以重复出现。
 * 
 * 例如：初始队列 [A1, A2, B, C, D]，关系 A1,A2 ← B ← C ← D
 * 
 * 处理过程：
 * 1. A1 是根卡片 → 展开子卡片链 → [A1, B, C, D]
 * 2. A2 是根卡片 → 展开子卡片链 → [A2, B, C, D]
 * 3. B 是根卡片，但已经作为 A1 的子卡片出现过 → 跳过
 * 4. C 是根卡片，但已经作为子卡片出现过 → 跳过
 * 5. D 是根卡片，但已经作为子卡片出现过 → 跳过
 * 
 * 最终结果：[A1, B, C, D, A2, B, C, D]（8张）
 * 
 * @param cards - ReviewCard 数组
 * @param pluginName - 插件名称
 * @returns 展开子卡片后的复习队列
 */
export async function buildReviewQueueWithChildren(
  cards: ReviewCard[],
  pluginName: string = "srs-plugin"
): Promise<ReviewCard[]> {
  // 先用原有逻辑构建基础队列
  const baseQueue = buildReviewQueue(cards)
  
  // 动态导入 childCardCollector 避免循环依赖
  const { collectChildCards } = await import("./childCardCollector")
  
  // 展开后的队列
  const expandedQueue: ReviewCard[] = []
  
  // 已经作为"根卡片"处理过的卡片（用于跳过重复的根卡片）
  const processedRootKeys = new Set<string>()
  
  // 已经出现在队列中的卡片（用于判断根卡片是否应该跳过）
  const appearedInQueue = new Set<string>()
  
  /**
   * 递归展开一张卡片及其子卡片链
   * @param card - 当前卡片
   * @param visitedInChain - 当前链中已访问的卡片（防止循环引用）
   */
  async function expandCardChain(
    card: ReviewCard, 
    visitedInChain: Set<string>
  ): Promise<void> {
    const cardKey = `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
    
    // 防止循环引用
    if (visitedInChain.has(cardKey)) {
      return
    }
    visitedInChain.add(cardKey)
    
    // 添加当前卡片到队列
    expandedQueue.push(card)
    appearedInQueue.add(cardKey)
    
    // 收集直接子卡片
    const childCards = await collectChildCards(card.id, pluginName)
    
    // 递归展开每个子卡片
    for (const childCard of childCards) {
      await expandCardChain(childCard, visitedInChain)
    }
  }
  
  // 遍历基础队列中的每张卡片作为"根卡片"
  for (const card of baseQueue) {
    const cardKey = `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
    
    // 如果这张卡片已经作为某个根卡片的子卡片出现过，跳过它作为根卡片
    if (appearedInQueue.has(cardKey)) {
      console.log(`[${pluginName}] 跳过根卡片 #${card.id}，已作为子卡片出现`)
      continue
    }
    
    // 标记为已处理的根卡片
    processedRootKeys.add(cardKey)
    
    // 展开这个根卡片的完整子卡片链
    const visitedInChain = new Set<string>()
    await expandCardChain(card, visitedInChain)
  }
  
  console.log(`[${pluginName}] buildReviewQueueWithChildren: 基础队列 ${baseQueue.length} 张，展开后 ${expandedQueue.length} 张`)
  
  return expandedQueue
}
