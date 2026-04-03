/**
 * Cloze 卡片工具模块
 *
 * 提供 Cloze 填空卡片的创建和管理功能
 * 
 * 【2025-12-11 重构】使用直接操作 ContentFragment 数组的方式
 * 替代 deleteSelection + insertFragments，以解决插入位置偏移问题
 */

import type { CursorData, Block, ContentFragment, DbId } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import { writeInitialClozeSrsState } from "./storage"
import { isCardTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"

/**
 * 从 ContentFragment 数组中提取当前最大的 cloze 编号
 *
 * @param content - ContentFragment 数组
 * @param pluginName - 插件名称
 * @returns 当前最大的 cloze 编号，如果没有则返回 0
 */
export function getMaxClozeNumberFromContent(
  content: ContentFragment[] | undefined,
  pluginName: string
): number {
  if (!content || content.length === 0) {
    return 0
  }

  let maxNumber = 0
  for (const fragment of content) {
    if (fragment.t === `${pluginName}.cloze` && typeof fragment.clozeNumber === "number") {
      if (fragment.clozeNumber > maxNumber) {
        maxNumber = fragment.clozeNumber
      }
    }
  }
  return maxNumber
}

/**
 * 从 ContentFragment 数组中提取所有 cloze 编号
 *
 * @param content - ContentFragment 数组
 * @param pluginName - 插件名称（用于首选匹配，但也会匹配任何 xxx.cloze 格式）
 * @returns cloze 编号数组（去重并排序）
 */
export function getAllClozeNumbers(content: ContentFragment[] | undefined, pluginName: string): number[] {
  if (!content || content.length === 0) {
    return []
  }

  const clozeNumbers = new Set<number>()

  for (const fragment of content) {
    // 首先尝试精确匹配 pluginName.cloze
    // 如果不匹配，则尝试匹配任何 xxx.cloze 格式
    const isClozeFragment = 
      fragment.t === `${pluginName}.cloze` ||
      (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
    
    if (isClozeFragment && typeof (fragment as any).clozeNumber === "number") {
      clozeNumbers.add((fragment as any).clozeNumber)
    }
  }

  // 转为数组并排序
  return Array.from(clozeNumbers).sort((a, b) => a - b)
}

/**
 * 递归遍历块树，收集所有子块
 * 表格 cloze 卡片时，遍历表格内块对象
 *
 * @param blockId - 起始块 ID
 * @returns 所有子块 ID 数组
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
      // 使用批量获取方式获取块
      const blocks = await orca.invokeBackend("get-blocks", [id]) as Block[]
      if (blocks && blocks.length > 0) {
        block = blocks[0]
      }
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
 * 向上遍历所有父块，检查是否存在表格块
 *
 * @param blockId - 起始块 ID
 * @returns 表格块 ID（如果存在），否则返回 null
 */
export async function findTableParentBlock(blockId: DbId): Promise<DbId | null> {
  let currentBlockId: DbId | undefined = blockId
  
  console.log(`[findTableParentBlock] 开始向上遍历，起始块 ID: ${blockId}`)
  
  while (currentBlockId) {
    // 获取当前块数据
    let block = orca.state.blocks?.[currentBlockId] as BlockWithRepr | undefined
    if (!block) {
      // 使用批量获取方式获取块
      console.log(`[findTableParentBlock] 从后端获取块数据，块 ID: ${currentBlockId}`)
      const blocks = await orca.invokeBackend("get-blocks", [currentBlockId]) as Block[]
      if (blocks && blocks.length > 0) {
        block = blocks[0]
      }
    }
    
    if (block) {
      console.log(`[findTableParentBlock] 检查块 ID: ${currentBlockId}`)
      console.log(`[findTableParentBlock] 块 _repr:`, block._repr)
      
      // 详细检查 properties
      if (block.properties) {
        console.log(`[findTableParentBlock] 块 properties 长度: ${Array.isArray(block.properties) ? block.properties.length : '未知'}`)
        if (Array.isArray(block.properties)) {
          for (let i = 0; i < block.properties.length; i++) {
            const prop = block.properties[i]
            console.log(`[findTableParentBlock] 块 properties[${i}]:`, {
              name: prop.name,
              type: prop.type,
              value: prop.value
            })
            // 检查是否是表格块
            if (prop.name === "_repr" && prop.value && prop.value.type === "table2") {
              console.log(`[findTableParentBlock] 找到表格块，ID: ${currentBlockId}`)
              return currentBlockId
            }
          }
        } else {
          console.log(`[findTableParentBlock] 块 properties 不是数组:`, block.properties)
        }
      } else {
        console.log(`[findTableParentBlock] 块 properties: undefined`)
      }
      
      console.log(`[findTableParentBlock] 块父 ID: ${block.parent}`)
      
      // 继续向上遍历父块
      currentBlockId = block.parent
    } else {
      console.log(`[findTableParentBlock] 无法获取块数据，块 ID: ${currentBlockId}`)
      // 无法获取块数据，结束遍历
      break
    }
  }
  
  console.log(`[findTableParentBlock] 未找到表格块`)
  return null
}

/**
 * 从块树中提取所有 cloze 挖空内容（备用方法）
 * 表格 cloze 卡片时，遍历表格内块对象
 *
 * @param blockId - 起始块 ID
 * @param pluginName - 插件名称
 * @returns 挖空内容数组，每个元素包含编号和内容
 */
export async function extractClozeContentFromBlockTree(blockId: DbId, pluginName: string): Promise<{ number: number; content: string }[]> {
  const result: { number: number; content: string }[] = []
  
  // 递归获取所有子块 ID
  const allBlockIds = await getAllDescendantIds(blockId)
  allBlockIds.push(blockId) // 包含自身
  
  // 收集需要从后端获取的块 ID
  const blocksToFetch: DbId[] = []
  const blocksMap = new Map<DbId, Block>()
  
  // 先从 state 中获取已有的块
  for (const id of allBlockIds) {
    const block = orca.state.blocks?.[id] as Block | undefined
    if (block) {
      blocksMap.set(id, block)
    } else {
      blocksToFetch.push(id)
    }
  }
  
  // 批量从后端获取缺失的块
  if (blocksToFetch.length > 0) {
    const fetchedBlocks = await orca.invokeBackend("get-blocks", blocksToFetch) as Block[]
    if (fetchedBlocks && fetchedBlocks.length > 0) {
      for (const block of fetchedBlocks) {
        blocksMap.set(block.id, block)
      }
    }
  }
  
  // 遍历所有块，提取 cloze 挖空内容
  for (const id of allBlockIds) {
    const block = blocksMap.get(id)
    
    if (block && block.content) {
      for (const fragment of block.content) {
        const isClozeFragment = 
          fragment.t === `${pluginName}.cloze` ||
          (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
        
        if (isClozeFragment && typeof (fragment as any).clozeNumber === "number") {
          result.push({
            number: (fragment as any).clozeNumber,
            content: fragment.v || ""
          })
        }
      }
    }
  }
  
  return result
}

/**
 * 从块树中提取当前最大的 cloze 编号（备用方法）
 * 表格 cloze 卡片时，遍历表格内块对象
 *
 * @param blockId - 起始块 ID
 * @param pluginName - 插件名称
 * @returns 当前最大的 cloze 编号，如果没有则返回 0
 */
export async function getMaxClozeNumberFromBlockTree(blockId: DbId, pluginName: string): Promise<number> {
  const clozeContent = await extractClozeContentFromBlockTree(blockId, pluginName)
  if (clozeContent.length === 0) {
    return 0
  }
  
  return Math.max(...clozeContent.map(item => item.number))
}

/**
 * 从块树中提取所有 cloze 编号（备用方法）
 * 表格 cloze 卡片时，遍历表格内块对象
 *
 * @param blockId - 起始块 ID
 * @param pluginName - 插件名称
 * @returns cloze 编号数组（去重并排序）
 */
export async function getAllClozeNumbersFromBlockTree(blockId: DbId, pluginName: string): Promise<number[]> {
  const clozeContent = await extractClozeContentFromBlockTree(blockId, pluginName)
  const clozeNumbers = new Set<number>(clozeContent.map(item => item.number))
  return Array.from(clozeNumbers).sort((a, b) => a - b)
}

/**
 * 在 ContentFragment 数组中找到指定位置并拆分/插入 cloze fragment
 * 
 * 根据 cursor 的 index 和 offset，找到对应的 fragment，将其拆分，
 * 并在中间插入 cloze fragment
 * 
 * @param content - 原始 ContentFragment 数组
 * @param cursor - 光标数据
 * @param selectedText - 选中的文本
 * @param clozeNumber - cloze 编号
 * @param pluginName - 插件名称
 * @returns 新的 ContentFragment 数组
 */
function buildNewContent(
  content: ContentFragment[],
  cursor: CursorData,
  selectedText: string,
  clozeNumber: number,
  pluginName: string
): ContentFragment[] {
  // 获取选区的起始和结束位置
  const startIndex = Math.min(cursor.anchor.index, cursor.focus.index)
  
  // 根据方向确定起始和结束 offset
  let startOffset: number
  let endOffset: number
  
  if (cursor.anchor.index === cursor.focus.index) {
    // 在同一个 fragment 中
    startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
    endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)
  } else {
    // 跨越多个 fragment（目前不支持，返回原数组）
    console.warn(`[${pluginName}] 不支持跨 fragment 的选区`)
    return content
  }

  const newContent: ContentFragment[] = []

  for (let i = 0; i < content.length; i++) {
    const fragment = content[i]
    
    if (i === startIndex) {
      // 这是包含选区的 fragment
      const text = fragment.v || ""
      
      // 前半部分（选区之前的文本）
      if (startOffset > 0) {
        const beforeText = text.substring(0, startOffset)
        newContent.push({
          ...fragment,
          v: beforeText
        })
      }
      
      // 插入 cloze fragment
      newContent.push({
        t: `${pluginName}.cloze`,
        v: selectedText,
        clozeNumber: clozeNumber
      } as ContentFragment)
      
      // 后半部分（选区之后的文本）
      if (endOffset < text.length) {
        const afterText = text.substring(endOffset)
        newContent.push({
          ...fragment,
          v: afterText
        })
      }
    } else {
      // 其他 fragment 保持不变
      newContent.push(fragment)
    }
  }

  return newContent
}

/**
 * 将选中的文本转换为 cloze 格式
 * 
 * 【2025-12-11 重构】直接操作 ContentFragment 数组：
 * 1. 根据 cursor.anchor.index/offset 定位到 fragment
 * 2. 拆分该 fragment 并在中间插入 cloze fragment
 * 3. 使用 setBlocksContent 更新块内容
 * 
 * 这种方式能精确控制插入位置，避免 insertFragments 的偏移问题
 * 
 * @param cursor - 当前光标位置和选中信息
 * @param pluginName - 插件名称
 * @returns 转换结果或 null
 */
export async function createCloze(
  cursor: CursorData,
  pluginName: string
): Promise<{ 
  blockId: number
  clozeNumber: number
} | null> {
  // 验证光标数据
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block

  if (!block) {
    orca.notify("error", "未找到当前块")
    console.error(`[${pluginName}] 错误：未找到块 #${blockId}`)
    return null
  }

  // 检查是否在同一块内选择
  if (cursor.anchor.blockId !== cursor.focus.blockId) {
    orca.notify("warn", "请在同一块内选择文本")
    return null
  }

  // 检查是否有选中内容
  if (cursor.anchor.offset === cursor.focus.offset && cursor.anchor.index === cursor.focus.index) {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }

  // 检查是否在同一个 fragment 内（目前只支持单 fragment 选区）
  if (cursor.anchor.index !== cursor.focus.index) {
    orca.notify("warn", "请在同一段文本内选择（不支持跨样式选区）")
    return null
  }

  // 确保有 content 数组
  if (!block.content || block.content.length === 0) {
    orca.notify("warn", "块内容为空")
    return null
  }

  // 获取选区对应的 fragment
  const fragmentIndex = cursor.anchor.index
  const fragment = block.content[fragmentIndex]
  
  if (!fragment || !fragment.v) {
    orca.notify("warn", "无法获取选中的文本片段")
    return null
  }

  // 计算选区在 fragment 内的位置
  const startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
  const endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)
  const selectedText = fragment.v.substring(startOffset, endOffset)
  
  if (!selectedText || selectedText.trim() === "") {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }
  
  // 检查是否存在表格父块
  const tableBlockId = await findTableParentBlock(blockId)
  const isTableBlock = !!tableBlockId
  const targetBlockId = isTableBlock ? tableBlockId : blockId
  const cardType = isTableBlock ? "bg" : "cloze"
  
  // 从 block.content 中获取当前最大的 cloze 编号
  let maxClozeNumber = getMaxClozeNumberFromContent(block.content, pluginName)
  
  // 如果当前方法失败（未找到任何 cloze 编号），尝试使用备用的块树遍历方式
  if (maxClozeNumber === 0) {
    try {
      const treeMaxNumber = await getMaxClozeNumberFromBlockTree(targetBlockId, pluginName)
      if (treeMaxNumber > 0) {
        maxClozeNumber = treeMaxNumber
      }
    } catch (error) {
      console.warn(`[${pluginName}] 尝试从块树提取 cloze 编号失败:`, error)
    }
  }
  
  const nextClozeNumber = maxClozeNumber + 1

  try {
    // 构建新的 content 数组
    const newContent = buildNewContent(
      block.content,
      cursor,
      selectedText,
      nextClozeNumber,
      pluginName
    )

    // 使用 setBlocksContent 更新块内容
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [
        {
          id: blockId,
          content: newContent
        }
      ],
      false
    )

    // 处理 #card 标签（表格块特殊处理）
    const targetBlock = orca.state.blocks[targetBlockId] as Block
    const hasCardTag = targetBlock.refs?.some(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )

    if (!hasCardTag) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          targetBlockId,
          "card",
          [
            { name: "type", value: cardType },
            { name: "牌组", value: [] },  // 空数组表示未设置牌组
            { name: "status", value: "" }  // 空字符串表示正常状态
          ]
        )
        console.log(`[${pluginName}] 已添加 #card 标签并设置 type=${cardType}`)
        
        // 确保 #card 标签块有属性定义（首次使用时自动初始化）
        await ensureCardTagProperties(pluginName)
      } catch (error) {
        console.error(`[${pluginName}] 添加 #card 标签失败:`, error)
      }
    } else {
      try {
        const cardRef = targetBlock.refs?.find(
          ref => ref.type === 2 && isCardTag(ref.alias)
        )
        if (cardRef) {
          await orca.commands.invokeEditorCommand(
            "core.editor.setRefData",
            null,
            cardRef,
            [{ name: "type", value: cardType }]
          )
          console.log(`[${pluginName}] 已更新 #card 标签的 type=${cardType}`)
        }
      } catch (error) {
        console.error(`[${pluginName}] 更新 #card 标签属性失败:`, error)
      }
    }

    // 自动加入复习队列
    try {
      const finalBlock = orca.state.blocks[targetBlockId] as BlockWithRepr

      // 设置 _repr
      finalBlock._repr = {
        type: "srs.cloze-card",
        front: block.text || "",
        back: "（填空卡）",
        cardType: cardType
      }

      // 获取块中所有的 cloze 编号
      const clozeNumbers = getAllClozeNumbers(block.content, pluginName)

      // 设置 srs.isCard 属性
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [targetBlockId],
        [{ name: "srs.isCard", value: true, type: 4 }]
      )

      // 为每个填空设置分天的初始 SRS 状态
      for (let i = 0; i < clozeNumbers.length; i++) {
        const clozeNumber = clozeNumbers[i]
        const daysOffset = clozeNumber - 1
        await writeInitialClozeSrsState(targetBlockId, clozeNumber, daysOffset)
      }
    } catch (error) {
      console.error(`[${pluginName}] 自动加入复习队列失败:`, error)
    }

    // 显示成功通知
    orca.notify(
      "success",
      `已创建填空 c${nextClozeNumber}: "${selectedText}"`,
      { title: "Cloze" }
    )

    return { blockId, clozeNumber: nextClozeNumber }
  } catch (error) {
    console.error(`[${pluginName}] 创建 cloze 失败:`, error)
    orca.notify("error", `创建 cloze 失败: ${error}`, { title: "Cloze" })
    return null
  }
}

/**
 * 创建同序挖空，使用当前最大的序号，不递增
 * 
 * @param cursor - 当前光标位置和选中信息
 * @param pluginName - 插件名称
 * @returns 转换结果或 null
 */
export async function createClozeSameNumber(
  cursor: CursorData,
  pluginName: string
): Promise<{ 
  blockId: number
  clozeNumber: number
} | null> {
  // 验证光标数据
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block

  if (!block) {
    orca.notify("error", "未找到当前块")
    console.error(`[${pluginName}] 错误：未找到块 #${blockId}`)
    return null
  }

  // 检查是否在同一块内选择
  if (cursor.anchor.blockId !== cursor.focus.blockId) {
    orca.notify("warn", "请在同一块内选择文本")
    return null
  }

  // 检查是否有选中内容
  if (cursor.anchor.offset === cursor.focus.offset && cursor.anchor.index === cursor.focus.index) {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }

  // 检查是否在同一个 fragment 内（目前只支持单 fragment 选区）
  if (cursor.anchor.index !== cursor.focus.index) {
    orca.notify("warn", "请在同一段文本内选择（不支持跨样式选区）")
    return null
  }

  // 确保有 content 数组
  if (!block.content || block.content.length === 0) {
    orca.notify("warn", "块内容为空")
    return null
  }

  // 获取选区对应的 fragment
  const fragmentIndex = cursor.anchor.index
  const fragment = block.content[fragmentIndex]
  
  if (!fragment || !fragment.v) {
    orca.notify("warn", "无法获取选中的文本片段")
    return null
  }

  // 计算选区在 fragment 内的位置
  const startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
  const endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)
  const selectedText = fragment.v.substring(startOffset, endOffset)
  
  if (!selectedText || selectedText.trim() === "") {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }
  
  // 检查是否存在表格父块
  const tableBlockId = await findTableParentBlock(blockId)
  const isTableBlock = !!tableBlockId
  const targetBlockId = isTableBlock ? tableBlockId : blockId
  const cardType = isTableBlock ? "bg" : "cloze"
  
  // 从 block.content 中获取当前最大的 cloze 编号
  let maxClozeNumber = getMaxClozeNumberFromContent(block.content, pluginName)
  
  // 如果当前方法失败（未找到任何 cloze 编号），尝试使用备用的块树遍历方式
  if (maxClozeNumber === 0) {
    try {
      const treeMaxNumber = await getMaxClozeNumberFromBlockTree(targetBlockId, pluginName)
      if (treeMaxNumber > 0) {
        maxClozeNumber = treeMaxNumber
      }
    } catch (error) {
      console.warn(`[${pluginName}] 尝试从块树提取 cloze 编号失败:`, error)
    }
  }
  
  // 如果仍然没有找到，则使用 1
  const clozeNumber = maxClozeNumber > 0 ? maxClozeNumber : 1

  try {
    // 构建新的 content 数组
    const newContent = buildNewContent(
      block.content,
      cursor,
      selectedText,
      clozeNumber,
      pluginName
    )

    // 使用 setBlocksContent 更新块内容
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [
        {
          id: blockId,
          content: newContent
        }
      ],
      false
    )

    // 处理 #card 标签（表格块特殊处理）
    const targetBlock = orca.state.blocks[targetBlockId] as BlockWithRepr
    const hasCardTag = targetBlock.refs?.some(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )

    if (!hasCardTag) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          targetBlockId,
          "card",
          [
            { name: "type", value: cardType },
            { name: "牌组", value: [] },  // 空数组表示未设置牌组
            { name: "status", value: "" }  // 空字符串表示正常状态
          ]
        )
        console.log(`[${pluginName}] 已添加 #card 标签到块 ${targetBlockId} 并设置 type=${cardType}`)
        
        // 确保 #card 标签块有属性定义（首次使用时自动初始化）
        await ensureCardTagProperties(pluginName)
      } catch (error) {
        console.error(`[${pluginName}] 添加 #card 标签失败:`, error)
      }
    } else {
      try {
        const cardRef = targetBlock.refs?.find(
          ref => ref.type === 2 && isCardTag(ref.alias)
        )
        if (cardRef) {
          await orca.commands.invokeEditorCommand(
            "core.editor.setRefData",
            null,
            cardRef,
            [{ name: "type", value: cardType }]
          )
          console.log(`[${pluginName}] 已更新 #card 标签的 type=${cardType}`)
        }
      } catch (error) {
        console.error(`[${pluginName}] 更新 #card 标签属性失败:`, error)
      }
    }

    // 自动加入复习队列
    try {
      const finalBlock = orca.state.blocks[targetBlockId] as BlockWithRepr

      // 设置 _repr
      finalBlock._repr = {
        type: "srs.cloze-card",
        front: block.text || "",
        back: "（填空卡）",
        cardType: cardType
      }

      // 获取块中所有的 cloze 编号
      const clozeNumbers = getAllClozeNumbers(block.content, pluginName)

      // 设置 srs.isCard 属性
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [targetBlockId],
        [{ name: "srs.isCard", value: true, type: 4 }]
      )

      // 为每个填空设置分天的初始 SRS 状态
      for (let i = 0; i < clozeNumbers.length; i++) {
        const number = clozeNumbers[i]
        const daysOffset = number - 1
        await writeInitialClozeSrsState(targetBlockId, number, daysOffset)
      }
    } catch (error) {
      console.error(`[${pluginName}] 自动加入复习队列失败:`, error)
    }

    // 显示成功通知
    orca.notify(
      "success",
      `已创建同序填空 c${clozeNumber}: "${selectedText}"`,
      { title: "Cloze" }
    )

    return { blockId, clozeNumber }
  } catch (error) {
    console.error(`[${pluginName}] 创建同序 cloze 失败:`, error)
    orca.notify("error", `创建同序 cloze 失败: ${error}`, { title: "Cloze" })
    return null
  }
}

/**
 * 清除挖空格式，将 cloze fragment 转换回普通文本
 * 
 * @param cursor - 当前光标位置和选中信息
 * @param pluginName - 插件名称
 * @returns 转换结果或 null
 */
export async function clearClozeFormat(
  cursor: CursorData,
  pluginName: string
): Promise<{ 
  blockId: number
} | null> {
  // 验证光标数据
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block

  if (!block) {
    orca.notify("error", "未找到当前块")
    console.error(`[${pluginName}] 错误：未找到块 #${blockId}`)
    return null
  }

  // 确保有 content 数组
  if (!block.content || block.content.length === 0) {
    orca.notify("warn", "块内容为空")
    return null
  }

  try {
    // 构建新的 content 数组，将 cloze fragment 转换为普通文本
    const newContent: ContentFragment[] = []
    
    block.content.forEach((fragment, index) => {
      // 检查是否是 cloze fragment
      if (fragment.t === `${pluginName}.cloze` || (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))) {
        // 转换为普通文本 fragment
        newContent.push({
          t: "t",
          v: fragment.v || ""
        })
      } else {
        // 保持原有 fragment
        newContent.push(fragment)
      }
    })

    // 检查是否有任何变化
    const hasChanges = JSON.stringify(newContent) !== JSON.stringify(block.content)
    if (!hasChanges) {
      orca.notify("info", "未找到需要清除的挖空格式", { title: "Cloze" })
      return null
    }

    // 使用 setBlocksContent 更新块内容
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [
        {
          id: blockId,
          content: newContent
        }
      ],
      false
    )

    // 显示成功通知
    orca.notify(
      "success",
      "已清除挖空格式",
      { title: "Cloze" }
    )

    return { blockId }
  } catch (error) {
    console.error(`[${pluginName}] 清除挖空格式失败:`, error)
    orca.notify("error", `清除挖空格式失败: ${error}`, { title: "Cloze" })
    return null
  }
}
