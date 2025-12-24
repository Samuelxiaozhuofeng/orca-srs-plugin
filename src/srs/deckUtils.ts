/**
 * Deck 管理工具函数
 * 
 * 提供从块中提取 deck 名称和计算 deck 统计信息的功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats } from "./types"
import { isCardTag } from "./tagUtils"

const DEFAULT_DECK_NAME = "Default"
const DECK_PROPERTY_NAME = "牌组"

// 简单缓存：同一轮运行中重复解析同一个牌组块时避免多次请求后端
const deckNameCache = new Map<DbId, string>()

/**
 * 卡片类型
 * - basic: 基本卡（正面/反面）
 * - cloze: 填空卡
 * - direction: 方向卡
 * - excerpt: 摘录卡（只显示内容，无正反面）
 */
export type CardType = "basic" | "cloze" | "direction" | "excerpt"

/**
 * 从块的标签属性系统中提取卡片类型
 *
 * 工作原理：
 * 1. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 2. 从引用的 data 数组中找到 name="type" 的属性
 * 3. 返回该属性的 value，如果不存在返回 "basic"
 *
 * 用户操作流程：
 * 1. 在 Orca 标签页面为 #card 标签定义属性 "type"（类型：单选/多选文本）
 * 2. 添加可选值（如 "basic", "cloze", "direction"）
 * 3. 给块打 #card 标签后，从下拉菜单选择 type 值
 * 4. 或者使用 cloze/direction 按钮时自动设置对应类型
 *
 * @param block - 块对象
 * @returns 卡片类型，"basic"、"cloze" 或 "direction"，默认为 "basic"
 */
export function extractCardType(block: Block): CardType {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return "basic"
  }

  // 1. 找到 #card 标签引用
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

  // 2. 从标签关联数据中读取 type 属性
  const typeProperty = cardRef.data.find(d => d.name === "type")

  // 边界情况：没有设置 type 属性
  if (!typeProperty) {
    return "basic"
  }

  // 3. 返回 type 值
  const typeValue = typeProperty.value

  // 处理多选类型（数组）和单选类型（字符串）
  if (Array.isArray(typeValue)) {
    // 多选类型：取数组的第一个值
    if (typeValue.length === 0 || !typeValue[0] || typeof typeValue[0] !== "string") {
      return "basic"
    }
    const firstValue = typeValue[0].trim().toLowerCase()
    if (firstValue === "cloze") return "cloze"
    if (firstValue === "direction") return "direction"
    if (firstValue === "excerpt") return "excerpt"
    return "basic"
  } else if (typeof typeValue === "string") {
    // 单选类型：直接使用字符串
    const trimmedValue = typeValue.trim().toLowerCase()
    if (trimmedValue === "cloze") return "cloze"
    if (trimmedValue === "direction") return "direction"
    if (trimmedValue === "excerpt") return "excerpt"
    return "basic"
  }

  // 其他类型：默认为 basic
  return "basic"
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
 * 用户操作流程：
 * 1. 创建一个普通块，块文本为牌组名称（如“测试牌组”）
 * 2. 在 Orca 标签页面为 #card 标签定义属性 "牌组"（类型：块引用）
 * 3. 给块打 #card 标签后，在“牌组”属性里引用该牌组块
 *
 * @param block - 块对象
 * @returns 牌组名称，默认为 "Default"
 */
export async function extractDeckName(block: Block): Promise<string> {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return DEFAULT_DECK_NAME
  }

  // 1. 找到 #card 标签引用
  const cardRef = block.refs.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    isCardTag(ref.alias)   // 标签名称为 "card"（大小写不敏感）
  )

  // 边界情况：没有找到 #card 标签引用
  if (!cardRef) {
    return DEFAULT_DECK_NAME
  }

  // 边界情况：标签引用没有关联数据
  if (!cardRef.data || cardRef.data.length === 0) {
    return DEFAULT_DECK_NAME
  }

  // 2. 从标签关联数据中读取“牌组”属性（块引用）
  const deckProperty = cardRef.data.find(d => d.name === DECK_PROPERTY_NAME)

  // 边界情况：没有设置“牌组”属性
  if (!deckProperty) {
    return DEFAULT_DECK_NAME
  }

  // 3. 获取引用 ID（标签属性的 value 保存的是“引用ID数组”，不是块ID）
  const refIds = deckProperty.value
  if (!Array.isArray(refIds) || refIds.length === 0) {
    return DEFAULT_DECK_NAME
  }

  const firstRefId = normalizeDbId(refIds[0])
  if (!firstRefId) {
    return DEFAULT_DECK_NAME
  }

  // 4. 通过引用 ID 找到实际的块引用
  const deckRef = block.refs.find(r => r.id === firstRefId)
  if (!deckRef) {
    return DEFAULT_DECK_NAME
  }

  // 5. 读取目标块文本作为牌组名称
  const deckName = await resolveBlockText(deckRef.to)
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
