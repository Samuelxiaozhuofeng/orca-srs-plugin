/**
 * 卡片收集模块
 * 
 * 提供 SRS 卡片的收集、过滤和复习队列构建功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"
import { BlockWithRepr, isSrsCardBlock, resolveFrontBack } from "./blockUtils"
import { extractDeckName, extractCardType } from "./deckUtils"
import { extractCardStatus } from "./cardStatusUtils"
import { 
  loadCardSrsState, 
  writeInitialSrsState, 
  loadClozeSrsState, 
  writeInitialClozeSrsState,
  loadDirectionSrsState,
  writeInitialDirectionSrsState
} from "./storage"
import { getAllClozeNumbers } from "./clozeUtils"
import { extractDirectionInfo, getDirectionList } from "./directionUtils"
import { isCardTag } from "./tagUtils"

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
    const deckName = extractDeckName(block)

    if (cardType === "cloze") {
      // Cloze 卡片：为每个填空编号生成独立的 ReviewCard
      const clozeNumbers = getAllClozeNumbers(block.content, pluginName)

      if (clozeNumbers.length === 0) {
        continue
      }

      for (const clozeNumber of clozeNumbers) {
        // 检查是否已有该填空的 SRS 属性
        const hasClozeSrsProps = block.properties?.some(
          prop => prop.name.startsWith(`srs.c${clozeNumber}.`)
        )

        const srsState = hasClozeSrsProps
          ? await loadClozeSrsState(block.id, clozeNumber)
          : await writeInitialClozeSrsState(block.id, clozeNumber, clozeNumber - 1)

        // front 使用块文本（将在渲染时隐藏对应填空）
        const front = block.text || ""

        cards.push({
          id: block.id,
          front,
          back: `（填空 c${clozeNumber}）`, // 填空卡不需要独立的 back
          srs: srsState,
          isNew: !srsState.lastReviewed || srsState.reps === 0,
          deck: deckName,
          clozeNumber // 关键：标记当前复习的填空编号
        })
      }
    } else if (cardType === "direction") {
      // Direction 卡片：根据方向类型生成一张或两张卡片
      const dirInfo = extractDirectionInfo(block.content, pluginName)
      
      if (!dirInfo) {
        console.log(`[${pluginName}] collectReviewCards: 块 ${block.id} 无法解析方向卡内容`)
        continue
      }

      // 获取需要生成卡片的方向列表
      const directions = getDirectionList(dirInfo.direction)

      for (let i = 0; i < directions.length; i++) {
        const dir = directions[i]

        // 检查是否已有该方向的 SRS 属性
        const hasDirectionSrsProps = block.properties?.some(prop =>
          prop.name.startsWith(`srs.${dir}.`)
        )

        const srsState = hasDirectionSrsProps
          ? await loadDirectionSrsState(block.id, dir)
          : await writeInitialDirectionSrsState(block.id, dir, i) // 分天推送

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
          directionType: dir // 关键：标记当前复习的方向类型
        })
      }
    } else {
      // Basic 卡片：传统的正面/反面模式
      const { front, back } = resolveFrontBack(block)
      const hasSrsProps = block.properties?.some(prop => prop.name.startsWith("srs."))
      const srsState = hasSrsProps
        ? await loadCardSrsState(block.id)
        : await writeInitialSrsState(block.id, now)

      cards.push({
        id: block.id,
        front,
        back,
        srs: srsState,
        isNew: !srsState.lastReviewed || srsState.reps === 0,
        deck: deckName
        // clozeNumber 和 directionType 都为 undefined（非特殊卡片）
      })
    }
  }

  return cards
}

/**
 * 构建复习队列
 * 使用 2:1 策略交错到期卡片和新卡片
 *
 * 到期判断逻辑（类似 ANKI）：
 * - 只比较日期，忽略具体的时分秒
 * - 只要卡片的到期日期 <= 今天，就视为到期
 * - 新卡也要检查到期时间：只有到期日期 <= 今天的新卡才会出现在队列中
 * - 这样可以实现 cloze/direction 卡片的分天推送
 *
 * @param cards - ReviewCard 数组
 * @returns 排序后的复习队列
 */
export function buildReviewQueue(cards: ReviewCard[]): ReviewCard[] {
  const now = new Date()

  // 获取今天的日期（零点），用于日期比较
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1) // 明天零点

  // 到期卡片：已复习过 && 到期日期 < 明天零点（即今天或更早）
  const dueCards = cards.filter(card => {
    if (card.isNew) return false
    return card.srs.due.getTime() < todayEnd.getTime()
  })

  // 新卡片：未复习过 && 到期日期 < 明天零点（即今天或更早）
  // 关键修改：新卡也要检查到期时间！
  const newCards = cards.filter(card => {
    if (!card.isNew) return false
    return card.srs.due.getTime() < todayEnd.getTime()
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
