/**
 * 卡片状态管理工具模块
 * 
 * 提供 Bury（埋藏）和 Suspend（暂停）功能：
 * - Bury：将卡片的 due 时间设置为明天零点，不改变其他 SRS 参数
 * - Suspend：在 #card 标签中写入 status=suspend，使卡片不再出现在复习队列
 */

import type { DbId, Block } from "../orca.d.ts"
import { isCardTag } from "./tagUtils"
import { invalidateBlockCache } from "./storage"
import { invalidateIrBlockCache } from "./incremental-reading/irBlockCache"


/**
 * 卡片状态类型
 * - normal: 正常状态
 * - suspend: 暂停状态（不会出现在复习队列，也不进入任何收集结果）
 * - pending: 待激活（卡片已建好但尚未排期）
 *
 * pending 与 suspend 的区别很重要：suspend 在 reviewCardFactory 处直接返回空数组，
 * 卡片对所有消费方都不可见；pending 仍然会被收集成 ReviewCard，只是不进复习队列，
 * 这样 Flash Home 才能统计并提供「激活」入口。
 */
export type CardStatus = "normal" | "suspend" | "pending"

/**
 * 从块的 #card 标签属性中提取卡片状态
 * 
 * 工作原理：
 * 1. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 2. 从引用的 data 数组中找到 name="status" 的属性
 * 3. 返回该属性的 value，如果不存在返回 "normal"
 * 
 * @param block - 块对象
 * @returns 卡片状态，"normal" 或 "suspend"
 */
export function extractCardStatus(block: Block): CardStatus {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return "normal"
  }

  // 1. 找到 #card 标签引用
  const cardRef = block.refs.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    isCardTag(ref.alias)   // 标签名称为 "card"（大小写不敏感）
  )

  // 边界情况：没有找到 #card 标签引用
  if (!cardRef) {
    return "normal"
  }

  // 边界情况：标签引用没有关联数据
  if (!cardRef.data || cardRef.data.length === 0) {
    return "normal"
  }

  // 2. 从标签关联数据中读取 status 属性
  const statusProperty = cardRef.data.find(d => d.name === "status")

  // 边界情况：没有设置 status 属性
  if (!statusProperty) {
    return "normal"
  }

  // 3. 返回 status 值
  const statusValue = statusProperty.value

  // 处理多选类型（数组）和单选类型（字符串）
  if (Array.isArray(statusValue)) {
    if (statusValue.length === 0 || !statusValue[0] || typeof statusValue[0] !== "string") {
      return "normal"
    }
    return normalizeCardStatusValue(statusValue[0])
  } else if (typeof statusValue === "string") {
    return normalizeCardStatusValue(statusValue)
  }

  return "normal"
}

/** 未知值一律按 normal：宁可多复习一张，也不要静默吞掉卡片。 */
function normalizeCardStatusValue(raw: string): CardStatus {
  const value = raw.trim().toLowerCase()
  if (value === "suspend") return "suspend"
  if (value === "pending") return "pending"
  return "normal"
}

/**
 * 暂停卡片
 * 
 * 在 #card 标签中写入 status=suspend 属性，
 * 使卡片不再出现在复习队列中。
 * 
 * @param blockId - 块 ID
 */
export async function suspendCard(blockId: DbId): Promise<void> {
  console.log(`[SRS] 暂停卡片 #${blockId}`)
  
  try {
    const block = orca.state.blocks[blockId] as Block
    if (!block) {
      throw new Error(`找不到块 #${blockId}`)
    }

    // 找到 #card 标签引用
    const cardRef = block.refs?.find(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )

    if (!cardRef) {
      throw new Error(`块 #${blockId} 没有 #card 标签`)
    }

    // 使用 setRefData 设置标签属性
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "status", value: "suspend" }]
    )
    
    console.log(`[SRS] 卡片 #${blockId} 已暂停`)
  } catch (error) {
    console.error(`[SRS] 暂停卡片失败:`, error)
    throw error
  }
}

/**
 * 取消暂停卡片
 * 
 * 将 #card 标签中的 status 属性设置为空或 "normal"，
 * 使卡片重新出现在复习队列中。
 * 
 * @param blockId - 块 ID
 */
export async function unsuspendCard(blockId: DbId): Promise<void> {
  console.log(`[SRS] 取消暂停卡片 #${blockId}`)
  
  try {
    const block = orca.state.blocks[blockId] as Block
    if (!block) {
      throw new Error(`找不到块 #${blockId}`)
    }

    // 找到 #card 标签引用
    const cardRef = block.refs?.find(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )

    if (!cardRef) {
      throw new Error(`块 #${blockId} 没有 #card 标签`)
    }

    // 使用 setRefData 清除 status 属性
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "status", value: "" }]
    )
    
    console.log(`[SRS] 卡片 #${blockId} 已取消暂停`)
  } catch (error) {
    console.error(`[SRS] 取消暂停卡片失败:`, error)
    throw error
  }
}

/**
 * 计算明天零点的时间
 * @returns 明天零点的 Date 对象
 */
function getTomorrowMidnight(): Date {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
}

/**
 * 构建 SRS due 属性名称
 * 
 * @param clozeNumber - 填空编号（可选）
 * @param directionType - 方向类型（可选）
 * @returns 属性名称，如 "srs.due"、"srs.c1.due"、"srs.forward.due"
 */
function buildDuePropertyName(
  clozeNumber?: number,
  directionType?: "forward" | "backward"
): string {
  if (clozeNumber !== undefined) {
    return `srs.c${clozeNumber}.due`
  }
  if (directionType !== undefined) {
    return `srs.${directionType}.due`
  }
  return "srs.due"
}

/**
 * 推迟卡片
 * 
 * 将卡片的 due 时间设置为明天零点，不改变其他 SRS 参数（interval、stability 等）。
 * 卡片今天不会再出现在复习队列中，明天会重新进入正常调度。
 * 
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号（仅 Cloze 卡片需要）
 * @param directionType - 方向类型（仅 Direction 卡片需要）
 */
export async function postponeCard(
  blockId: DbId,
  clozeNumber?: number,
  directionType?: "forward" | "backward"
): Promise<void> {
  const cardTypeLabel = clozeNumber 
    ? `Cloze c${clozeNumber}` 
    : directionType 
    ? `Direction ${directionType}` 
    : "Basic"
  
  console.log(`[SRS] 推迟 ${cardTypeLabel} 卡片 #${blockId}`)
  
  try {
    const tomorrow = getTomorrowMidnight()
    const propertyName = buildDuePropertyName(clozeNumber, directionType)
    
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: propertyName, type: 5, value: tomorrow }]
    )
    
    // 清除缓存，确保下次 collectReviewCards 读取最新数据
    invalidateBlockCache(blockId)
    
    console.log(`[SRS] 卡片 #${blockId} 已推迟，明天 ${tomorrow.toLocaleDateString()} 再复习`)
  } catch (error) {
    console.error(`[SRS] 推迟卡片失败:`, error)
    throw error
  }
}

// 保持向后兼容性的别名
export const buryCard = postponeCard



/**
 * 批量激活待激活卡片：把 #card 标签的 status 从 pending 清回空。
 *
 * 刻意不复用 `unsuspendCard`：它只读 `orca.state.blocks`，对**未渲染**的块
 * 直接抛「找不到块」——而批量激活面对的正是一堆从未打开过的 AI 卡；
 * 它也没有失效缓存，紧接着的收集会读回旧 status。这里 backend-first 解析并
 * 在写后失效两套缓存。
 *
 * 逐个串行处理并累计失败，不用 Promise.all —— 批量块写入必须有界，
 * 且单张失败不应让整批静默中止。
 */
export async function activatePendingCards(
  blockIds: readonly DbId[]
): Promise<{ activated: DbId[]; failed: Array<{ blockId: DbId; error: string }> }> {
  const activated: DbId[] = []
  const failed: Array<{ blockId: DbId; error: string }> = []

  for (const blockId of blockIds) {
    try {
      let block: Block | null = null
      try {
        block =
          ((await orca.invokeBackend("get-block", blockId)) as Block | null) ??
          null
      } catch {
        block = (orca.state.blocks?.[blockId] as Block | undefined) ?? null
      }
      if (!block) {
        throw new Error(`找不到块 #${blockId}`)
      }

      const cardRef = block.refs?.find(
        (ref) => ref.type === 2 && isCardTag(ref.alias)
      )
      if (!cardRef) {
        throw new Error(`块 #${blockId} 没有 #card 标签`)
      }

      await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        cardRef,
        [{ name: "status", value: "" }]
      )

      invalidateBlockCache(blockId)
      invalidateIrBlockCache(blockId)
      activated.push(blockId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[SRS] 激活卡片 #${blockId} 失败:`, error)
      failed.push({ blockId, error: message })
    }
  }

  return { activated, failed }
}
