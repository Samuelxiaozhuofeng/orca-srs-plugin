/**
 * Deck 管理工具函数
 * 
 * 提供从块中提取 deck 名称和计算 deck 统计信息的功能
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ReviewCard, DeckInfo, DeckStats, TodayStats, CardType } from "./types"
import { isCardTag, isChoiceTag, isDeckTag } from "./tagUtils"

const DEFAULT_DECK_NAME = "Default"
const DECK_PROPERTY_NAME = "牌组"

// 简单缓存：同一轮运行中重复解析同一个牌组块时避免多次请求后端
const deckNameCache = new Map<DbId, string>()

// Re-export CardType from types.ts for backward compatibility
export type { CardType } from "./types"

/**
 * 从块的标签属性系统中提取卡片类型
 *
 * 工作原理：
 * 1. 首先检查是否有 #choice 标签（选择题卡片）
 * 2. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 3. 从引用的 data 数组中找到 name="type" 的属性
 * 4. 返回该属性的 value，如果不存在返回 "basic"
 *
 * 用户操作流程：
 * 1. 在 Orca 标签页面为 #card 标签定义属性 "type"（类型：单选/多选文本）
 * 2. 添加可选值（如 "basic", "cloze", "direction"）
 * 3. 给块打 #card 标签后，从下拉菜单选择 type 值
 * 4. 或者使用 cloze/direction 按钮时自动设置对应类型
 * 5. 或者添加 #choice 标签创建选择题卡片
 *
 * @param block - 块对象
 * @returns 卡片类型，"basic"、"cloze"、"direction"、"excerpt"、"choice"、"topic" 或 "extracts"，默认为 "basic"
 */
export function extractCardType(block: Block): CardType {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return "basic"
  }

  // 1. 首先检查是否有 #choice 标签（选择题卡片优先）
  const hasChoiceTag = block.refs.some(ref =>
    ref.type === 2 &&        // RefType.Property（标签引用）
    isChoiceTag(ref.alias)   // 标签名称为 "choice"（大小写不敏感）
  )
  
  if (hasChoiceTag) {
    return "choice"
  }

  // 2. 找到 #card 标签引用
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

  // 3. 从标签关联数据中读取 type 属性
  const typeProperty = cardRef.data.find(d => d.name === "type")

  // 边界情况：没有设置 type 属性
  if (!typeProperty) {
    return "basic"
  }

  // 4. 返回 type 值
  const typeValue = typeProperty.value

  // 处理多选类型（数组）和单选类型（字符串）
  if (Array.isArray(typeValue)) {
    // 多选类型：取数组的第一个值
    if (typeValue.length === 0 || !typeValue[0] || typeof typeValue[0] !== "string") {
      return "basic"
    }
    const rawValue = typeValue[0].trim()
    const firstValue = rawValue.toLowerCase()
    if (firstValue === "topic") return "topic"
    if (firstValue === "extracts") return "extracts"
    if (firstValue === "cloze") return "cloze"
    if (firstValue === "bg") return "bg"
    if (firstValue === "direction") return "direction"
    if (firstValue === "list") return "list"
    if (firstValue === "excerpt") return "excerpt"
    if (firstValue === "choice") return "choice"
    return "basic"
  } else if (typeof typeValue === "string") {
    // 单选类型：直接使用字符串
    const rawValue = typeValue.trim()
    const trimmedValue = rawValue.toLowerCase()
    if (trimmedValue === "topic") return "topic"
    if (trimmedValue === "extracts") return "extracts"
    if (trimmedValue === "cloze") return "cloze"
    if (trimmedValue === "bg") return "bg"
    if (trimmedValue === "direction") return "direction"
    if (trimmedValue === "list") return "list"
    if (trimmedValue === "excerpt") return "excerpt"
    if (trimmedValue === "choice") return "choice"
    return "basic"
  }

  // 其他类型：默认为 basic
  return "basic"
}

/**
 * 从块的标签属性系统中提取牌组名称（无迁移，直接替换旧的 deck 方案）
 *
 * 工作原理：
 * 1. 优先检查当前块是否有 #card 标签及其「牌组」属性
 * 2. 如果当前块没有设置牌组属性，系统会自动向上遍历父块链
 * 3. 遍历过程中检查每个父块是否有 #deck 标签的「牌组」属性（不检查 #card 标签）
 * 4. 支持 aa::BB 格式的层级牌组
 * 5. 遍历到顶层仍未找到则返回 "Default" 
 *
 * 用户操作流程：
 * 1. 在 Orca 标签页面为 #card 标签定义属性 "牌组"（类型：文本）
 * 2. 给块打 #card 标签后，在“牌组”属性里输入牌组名称
 * 3. 支持输入 aa::BB 格式创建层级牌组
 * 4. 如果未设置牌组属性，系统会自动向上遍历父块链寻找 #deck 标签的牌组设置
 *
 * @param block - 块对象
 * @returns 牌组名称，默认为 "Default"
 */
export async function extractDeckName(block: Block): Promise<string> {
  // 1. 优先检查当前块是否有 #card 标签
  const cardRef = block.refs?.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    isCardTag(ref.alias)   // 标签名称为 "card"（大小写不敏感）
  );

  // 2. 如果找到 #card 标签，尝试提取牌组属性
  if (cardRef && cardRef.data && cardRef.data.length > 0) {
    const deckProperty = cardRef.data.find(d => d.name === DECK_PROPERTY_NAME);
    if (deckProperty) {
      const deckValue = deckProperty.value;
      if (deckValue !== undefined && deckValue !== null) {
        const trimmedValue = String(deckValue).trim();
        if (trimmedValue) {
          return trimmedValue;
        }
      }
    }
  }

  // 3. 如果当前块没有有效牌组属性，递归向上遍历父块链检查 #deck 标签
  console.log(`当前块 #${block.id} 没有有效牌组属性，开始向上遍历父块链检查 #deck 标签`);
  return await findDeckFromParentChain(block.id)
}

/**
 * 递归向上遍历父块链，寻找具有 #deck 标签「牌组」属性的块
 * （不检查 #card 标签，符合新的工作流程要求）
 * @param blockId - 起始块ID
 * @param depth - 递归深度（防死循环）
 * @returns 牌组名称，默认为 "Default"
 */
async function findDeckFromParentChain(blockId: DbId, depth: number = 0): Promise<string> {
  const MAX_DEPTH = 20; // 最大递归深度，避免死循环
  if (depth > MAX_DEPTH) {
    console.error("递归超过20层，未找到具有牌组属性的块");
    return DEFAULT_DECK_NAME;
  }

  try {
    // 1. 获取当前块信息（优先缓存，缓存无则调后端）
    let currentBlock = orca.state.blocks?.[blockId];
    if (!currentBlock) {
      currentBlock = await orca.invokeBackend("get-block", blockId) as Block | undefined;
    }
    if (!currentBlock) {
      console.error(`找不到块 #${blockId}`);
      return DEFAULT_DECK_NAME;
    }

    // 2. 检查当前块是否有父块
    if (!currentBlock.parent) {
      console.log(`块 #${blockId} 无父块，已到顶层`);
      return DEFAULT_DECK_NAME;
    }

    // 3. 获取父块信息
    let parentBlock = orca.state.blocks?.[currentBlock.parent];
    if (!parentBlock) {
      parentBlock = await orca.invokeBackend("get-block", currentBlock.parent) as Block | undefined;
    }
    if (!parentBlock) {
      console.error(`找不到父块 #${currentBlock.parent}`);
      return DEFAULT_DECK_NAME;
    }

    // 4. 尝试从父块中提取牌组名称
    const deckName = await extractDeckNameFromBlock(parentBlock);
    if (deckName !== DEFAULT_DECK_NAME) {
      console.log(`✅ 从父块 #${parentBlock.id} 提取到有效牌组值：${deckName}`);
      return deckName;
    }

    // 5. 如果父块没有有效牌组属性，递归查询父块的父块
    console.log(`父块 #${parentBlock.id} 没有有效牌组属性，继续向上查找`);
    return await findDeckFromParentChain(parentBlock.id, depth + 1);
  } catch (error) {
    console.error(`递归查询出错：${error instanceof Error ? error.message : String(error)}`);
    return DEFAULT_DECK_NAME;
  }
}

/**
 * 从指定块中提取牌组名称（不递归）
 * 只检查 #deck 标签的牌组属性（符合新的工作流程要求）
 * @param block - 块对象
 * @returns 牌组名称，默认为 "Default"
 */
async function extractDeckNameFromBlock(block: Block): Promise<string> {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return DEFAULT_DECK_NAME;
  }

  // 找到 #deck 标签引用（只检查 #deck 标签，不检查 #card 标签）
  const deckRef = block.refs.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    isDeckTag(ref.alias)   // 标签名称为 "deck"（大小写不敏感）
  );

  // 边界情况：没有找到 #deck 标签引用
  if (!deckRef) {
    console.log(`父块 #${block.id} 没有 #deck 标签，继续向上查找`);
    return DEFAULT_DECK_NAME;
  }

  // 边界情况：标签引用没有关联数据
  if (!deckRef.data || deckRef.data.length === 0) {
    console.log(`父块 #${block.id} 的 #deck 标签没有关联数据，继续向上查找`);
    return DEFAULT_DECK_NAME;
  }

  // 从标签关联数据中读取“牌组”属性
  const deckProperty = deckRef.data.find(d => d.name === DECK_PROPERTY_NAME);

  // 边界情况：没有设置“牌组”属性
  if (!deckProperty) {
    console.log(`父块 #${block.id} 的 #deck 标签没有设置「牌组」属性，继续向上查找`);
    return DEFAULT_DECK_NAME;
  }

  // 读取属性值作为牌组名称
  const deckValue = deckProperty.value;
  
  // 处理文本值（现在都是文本值，简化处理逻辑）
  if (deckValue !== undefined && deckValue !== null) {
    // 统一转为字符串并去除首尾空格
    const trimmedValue = String(deckValue).trim();
    if (trimmedValue) {
      console.log(`✅ 从父块 #${block.id} 的 #deck 标签提取到有效牌组值：${trimmedValue}`);
      return trimmedValue;
    }
  }

  // 其他情况：返回默认牌组
  console.log(`父块 #${block.id} 的 #deck 标签「牌组」属性值为空或无效，继续向上查找`);
  return DEFAULT_DECK_NAME;
}

/**
 * 解析层级牌组名称，返回层级结构
 * 
 * @param deckName - 牌组名称，支持 aa::BB 格式
 * @returns 牌组层级数组
 */
export function parseDeckHierarchy(deckName: string): string[] {
  if (!deckName) {
    return []
  }
  return deckName.split('::').map(part => part.trim()).filter(part => part !== '')
}

/**
 * 从层级数组构建牌组名称
 * 
 * @param hierarchy - 牌组层级数组
 * @returns 牌组名称字符串，使用 :: 分隔
 */
export function buildDeckName(hierarchy: string[]): string {
  return hierarchy.join('::')
}

/**
 * 获取牌组的父级牌组名称
 * 
 * @param deckName - 牌组名称，支持 aa::BB 格式
 * @returns 父级牌组名称，如无父级则返回 null
 */
export function getParentDeckName(deckName: string): string | null {
  const hierarchy = parseDeckHierarchy(deckName)
  if (hierarchy.length <= 1) {
    return null
  }
  return buildDeckName(hierarchy.slice(0, -1))
}

/**
 * 获取牌组的直接子牌组名称
 * 
 * @param deckName - 牌组名称，支持 aa::BB 格式
 * @param childName - 子牌组名称
 * @returns 完整的子牌组名称
 */
export function getChildDeckName(deckName: string, childName: string): string {
  if (!deckName) {
    return childName
  }
  return `${deckName}::${childName}`
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
 * 支持 aa::BB 格式的层级牌组
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
    
    // 处理层级牌组：为所有父级牌组添加统计
    let parentDeckName = getParentDeckName(deckName)
    while (parentDeckName) {
      if (!deckMap.has(parentDeckName)) {
        deckMap.set(parentDeckName, {
          name: parentDeckName,
          totalCount: 0,
          newCount: 0,
          overdueCount: 0,
          todayCount: 0,
          futureCount: 0
        })
      }
      
      const parentDeckInfo = deckMap.get(parentDeckName)!
      parentDeckInfo.totalCount++
      
      if (card.isNew) {
        parentDeckInfo.newCount++
      } else {
        const dueTime = card.srs.due.getTime()
        if (dueTime <= nowTime) {
          parentDeckInfo.overdueCount++
        } else if (card.srs.due >= today && card.srs.due < tomorrow) {
          parentDeckInfo.todayCount++
        } else {
          parentDeckInfo.futureCount++
        }
      }
      
      parentDeckName = getParentDeckName(parentDeckName)
    }
  }

  const decks = Array.from(deckMap.values())

  // 排序：Default 在最前，其他按层级结构和名称排序
  decks.sort((a, b) => {
    // Default 牌组优先
    if (a.name === "Default" && b.name !== "Default") return -1
    if (a.name !== "Default" && b.name === "Default") return 1
    
    // 按层级结构排序
    const aParts = parseDeckHierarchy(a.name)
    const bParts = parseDeckHierarchy(b.name)
    
    // 比较每一层的名称
    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
      const compare = aParts[i].localeCompare(bParts[i])
      if (compare !== 0) {
        return compare
      }
    }
    
    // 如果前面的层级都相同，则层级少的排在前面
    return aParts.length - bParts.length
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
