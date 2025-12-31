/**
 * 卡片创建模块
 * 
 * 提供将块转换为 SRS 卡片和批量扫描标签卡片的功能
 */

import type { Block, CursorData } from "../orca.d.ts"
import { BlockWithRepr, resolveFrontBack } from "./blockUtils"
import { extractDeckName, extractCardType } from "./deckUtils"
import { ensureCardSrsState, writeInitialSrsState } from "./storage"
import { cleanupSrsProperties } from "./tagCleanup"
import { isCardTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"

/**
 * 扫描所有带 #card 标签的块，并将它们转换为 SRS 卡片
 *
 * 处理逻辑：
 * 1. 获取所有带 #card 标签的块
 * 2. 对每个块：
 *    - 父块文本作为题目（front）
 *    - 第一个子块文本作为答案（back）
 *    - 从 #card 标签属性中读取 deck 名称
 *    - 设置 _repr.type = "srs.card"
 *    - 设置初始 SRS 属性
 * 
 * @param pluginName - 插件名称（用于日志和通知）
 */
export async function scanCardsFromTags(pluginName: string) {
  console.log(`[${pluginName}] 开始扫描带 #card 标签的块...`)

  try {
    // 1. 获取所有带 #card 标签的块
    const taggedBlocks = await orca.invokeBackend("get-blocks-with-tags", ["card"]) as Block[]
    
    // 如果 API 不支持层级标签查询，需要获取所有块然后过滤
    let allTaggedBlocks = taggedBlocks
    if (!taggedBlocks || taggedBlocks.length === 0) {
      console.log(`[${pluginName}] 直接查询 #card 标签无结果，尝试获取所有块并过滤`)
      try {
        // 备用方案1：尝试获取所有块
        const allBlocks = await orca.invokeBackend("get-all-blocks") as Block[] || []
        console.log(`[${pluginName}] get-all-blocks 返回了 ${allBlocks.length} 个块`)
        
        // 备用方案2：查询 #card 标签
        const possibleTags = ["card"]
        let foundBlocks: Block[] = []

        for (const tag of possibleTags) {
          try {
            const taggedWithSpecific = await orca.invokeBackend("get-blocks-with-tags", [tag]) as Block[] || []
            console.log(`[${pluginName}] 标签 "${tag}" 找到 ${taggedWithSpecific.length} 个块`)
            foundBlocks = [...foundBlocks, ...taggedWithSpecific]
          } catch (e) {
            console.log(`[${pluginName}] 查询标签 "${tag}" 失败:`, e)
          }
        }
        
        if (foundBlocks.length > 0) {
          allTaggedBlocks = foundBlocks
          console.log(`[${pluginName}] 多标签查询找到 ${allTaggedBlocks.length} 个带 #card 标签的块`)
        } else {
          // 最后备用方案：手动过滤所有块
          allTaggedBlocks = allBlocks.filter(block => {
            if (!block.refs || block.refs.length === 0) {
              return false
            }
            
            const hasCardTag = block.refs.some(ref => {
              if (ref.type !== 2) {
                return false
              }
              const tagAlias = ref.alias || ""
              return isCardTag(tagAlias)
            })
            
            return hasCardTag
          })
          console.log(`[${pluginName}] 手动过滤找到 ${allTaggedBlocks.length} 个带 #card 标签的块`)
        }
      } catch (error) {
        console.error(`[${pluginName}] 备用方案失败:`, error)
        allTaggedBlocks = []
      }
    }

    if (!taggedBlocks || taggedBlocks.length === 0) {
      orca.notify("info", "没有找到带 #card 标签的块", { title: "SRS 扫描" })
      console.log(`[${pluginName}] 未找到任何带 #card 标签的块`)
      return
    }

    console.log(`[${pluginName}] 找到 ${allTaggedBlocks.length} 个带 #card 标签的块`)

    let convertedCount = 0
    let skippedCount = 0

    // 2. 处理每个块
    for (const block of allTaggedBlocks) {
      const blockWithRepr = block as BlockWithRepr

      // 识别卡片类型（basic 或 cloze）
      const cardType = extractCardType(block)

      // 方向卡/列表卡不走这里的 _repr 转换逻辑
      // - 方向卡：单行可编辑卡片（由方向标记 + 标签属性驱动）
      // - 列表卡：容器卡片（条目在子块上存储 SRS 状态）
      if (cardType === "direction" || cardType === "list") {
        console.log(`[${pluginName}] 跳过：块 #${block.id} 是 ${cardType} 卡片（不转换 _repr）`)
        skippedCount++
        continue
      }

      // 根据卡片类型确定 repr type
      let reprType: string
      if (cardType === "cloze") {
        reprType = "srs.cloze-card"
      } else if (cardType === "choice") {
        reprType = "srs.choice-card"
      } else {
        reprType = "srs.card"
      }

      // 如果已经是对应的卡片类型，跳过
      if (blockWithRepr._repr?.type === reprType) {
        console.log(`[${pluginName}] 跳过：块 #${block.id} 已经是 ${cardType} 卡片`)
        skippedCount++
        continue
      }

      const { front, back } = resolveFrontBack(blockWithRepr)

      // 从标签属性系统中读取牌组名称
      const deckName = await extractDeckName(block)

      // 设置 _repr（直接修改，Valtio 会触发响应式更新）
      blockWithRepr._repr = {
        type: reprType,
        front: front,
        back: back,
        deck: deckName,
        cardType: cardType  // 添加 cardType 字段，方便后续使用
      }

      // 确保存在初始 SRS 属性（仅在真正未初始化时写入，避免误判导致重置进度）
      await ensureCardSrsState(block.id)

      console.log(`[${pluginName}] 已转换：块 #${block.id}`)
      console.log(`  卡片类型: ${cardType}`)
      console.log(`  题目: ${front}`)
      console.log(`  答案: ${back}`)
      if (deckName) {
        console.log(`  Deck: ${deckName}`)
      }

      convertedCount++
    }

    // 显示结果通知
    const message = `转换了 ${convertedCount} 张卡片${skippedCount > 0 ? `，跳过 ${skippedCount} 张已有卡片` : ""}`
    orca.notify("success", message, { title: "SRS 扫描完成" })
    console.log(`[${pluginName}] 扫描完成：${message}`)

  } catch (error) {
    console.error(`[${pluginName}] 扫描失败:`, error)
    orca.notify("error", `扫描失败: ${error}`, { title: "SRS 扫描" })
  }
}

/**
 * 将当前块转换为 SRS 卡片块
 * - 使用官方的 insertTag 命令添加 #card 标签（创建真正的标签DOM元素）
 * - 直接将块转换为 SRS 卡片
 * - 当前块的文本作为题目（front）
 * - 第一个子块的文本作为答案（back），如果没有子块则使用默认答案
 *
 * @param cursor - 当前光标位置
 * @param pluginName - 插件名称（用于日志）
 * @returns 转换结果（包含 blockId 和原始 _repr，供 undo 使用）
 */
export async function makeCardFromBlock(cursor: CursorData, pluginName: string) {
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as BlockWithRepr

  if (!block) {
    orca.notify("error", "未找到当前块")
    return null
  }

  // 保存原始 _repr 和文本供撤销使用
  const originalRepr = block._repr ? { ...block._repr } : { type: "text" }
  const originalText = block.text || ""

  // 检查块是否已经有 #card 标签
  const hasCardTag = block.refs?.some(ref => 
    ref.type === 2 &&      // RefType.Property（标签引用）
    isCardTag(ref.alias)   // 标签名称为 "card"（大小写不敏感）
  )

  // 如果没有标签，使用官方命令添加
  if (!hasCardTag) {
    try {
      // 使用官方的 insertTag 命令
      // 同时创建三个默认属性：type、牌组、status
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "card",
        [
          { name: "type", value: "basic" },
          { name: "牌组", value: [] },  // 空数组表示未设置牌组
          { name: "status", value: "" }  // 空字符串表示正常状态
        ]
      )
      
      // 确保 #card 标签块有属性定义（首次使用时自动初始化）
      await ensureCardTagProperties(pluginName)
    } catch (error) {
      console.error(`[${pluginName}] 添加标签失败:`, error)
      orca.notify("error", `添加标签失败: ${error}`, { title: "SRS" })
      return null
    }
  }

  // 直接转换为 SRS 卡片
  const { front, back } = resolveFrontBack(block)

  // 识别卡片类型（basic 或 cloze）
  const updatedBlock = orca.state.blocks[blockId] as BlockWithRepr
  const cardType = extractCardType(updatedBlock)
  
  // 根据卡片类型确定 repr type
  let reprType: string
  if (cardType === "cloze") {
    reprType = "srs.cloze-card"
  } else if (cardType === "choice") {
    reprType = "srs.choice-card"
  } else {
    reprType = "srs.card"
  }

  // 修改块的 _repr（Valtio 会自动触发响应式更新）
  block._repr = {
    type: reprType,
    front: front,
    back: back,
    cardType: cardType
  }

  // 处理 SRS 状态
  // 如果块之前没有 #card 标签（新创建卡片场景），需要先清理可能残留的旧 SRS 属性
  if (!hasCardTag) {
    await cleanupSrsProperties(blockId, pluginName)
    await writeInitialSrsState(blockId)
  } else {
    // 块已有标签，使用 ensureCardSrsState 保持现有状态
    await ensureCardSrsState(blockId)
  }

  // 显示通知
  const cardTypeLabel = cardType === "cloze" ? "填空卡片" : "记忆卡片"
  orca.notify(
    "success",
    `已添加 #card 标签并转换为 SRS ${cardTypeLabel}`,
    { title: "SRS" }
  )

  // 返回结果供 undo 使用
  return { blockId, originalRepr, originalText }
}
