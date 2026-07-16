/** 将一个 Orca 卡片块规范化为一组 ReviewCard。 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard, TagInfo } from "./types"
import { BlockWithRepr, isSrsCardBlock, resolveFrontBack } from "./blockUtils"
import { extractDeckName, extractCardType } from "./deckUtils"
import { extractCardStatus } from "./cardStatusUtils"
import {
  ensureCardSrsState,
  ensureCardSrsStateWithInitialDue,
  ensureClozeSrsState,
  ensureDirectionSrsState
} from "./storage"
import { getAllClozeNumbers } from "./clozeUtils"
import { extractDirectionInfo, getDirectionList } from "./directionUtils"
import { isCardTag } from "./tagUtils"

const PLUGIN_NAME = "srs-plugin"

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
  pluginName: string = PLUGIN_NAME,
  now: Date = new Date()
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

  // 与 cardCollector 一致：渐进阅读主题/摘录不进入 SRS ReviewCard
  if (cardType === "extracts" || cardType === "topic") {
    return cards
  }

  const deckName = await extractDeckName(block)
  const nowTime = now.getTime()
  const todayMidnight = getTodayMidnight()
  const tomorrowMidnight = getTomorrowMidnight()

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
        cardType: "cloze",
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
        cardType: "direction",
        tags: extractNonCardTags(block),
        directionType: dir
      })
    }
  } else if (cardType === "excerpt") {
    // Excerpt 卡片：只显示内容，无正反面
    const content = block.text || ""
    const srsState = await ensureCardSrsState(block.id, now)

    cards.push({
      id: block.id,
      front: content,
      back: "",
      srs: srsState,
      isNew: !srsState.lastReviewed || srsState.reps === 0,
      deck: deckName,
      cardType: "excerpt",
      tags: extractNonCardTags(block)
    })
  } else if (cardType === "choice") {
    // Choice 卡片：与 cardCollector 一致，必须可与 Basic 区分身份
    const question = block.text || ""
    const srsState = await ensureCardSrsState(block.id, now)
    const hasChildren = block.children && block.children.length > 0
    if (!hasChildren) {
      console.log(`[${pluginName}] convertBlockToReviewCards: 跳过无选项的选择题卡片 #${block.id}`)
      return cards
    }
    cards.push({
      id: block.id,
      front: question,
      back: "",
      srs: srsState,
      isNew: !srsState.lastReviewed || srsState.reps === 0,
      deck: deckName,
      cardType: "choice",
      tags: extractNonCardTags(block),
      content: block.content
    })
  } else if (cardType === "list") {
    // List 卡片：只取直接子块作为条目，逐次推送
    const itemIds = (block.children ?? []) as DbId[]
    if (itemIds.length === 0) {
      return cards
    }

    let dueIndex = -1
    let dueItemId: DbId | null = null
    let dueItemSrs: ReviewCard["srs"] | null = null

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i]
      const initialDue = i === 0 ? todayMidnight : tomorrowMidnight
      const srsState = await ensureCardSrsStateWithInitialDue(itemId, initialDue)
      if (srsState.due.getTime() <= nowTime) {
        dueIndex = i + 1
        dueItemId = itemId
        dueItemSrs = srsState
        break
      }
    }

    if (!dueItemId || !dueItemSrs || dueIndex === -1) {
      return cards
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
