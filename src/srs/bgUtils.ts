/**
 * BG 卡片工具模块
 *
 * 提供表格挖空卡片的创建和管理功能
 */

import type { Block, ContentFragment, DbId } from "../orca.d.ts"

/**
 * 从 ContentFragment 数组中提取所有 bg 挖空编号
 *
 * @param content - ContentFragment 数组
 * @param pluginName - 插件名称（用于首选匹配，但也会匹配任何 xxx.bg 格式）
 * @returns bg 挖空编号数组（去重并排序）
 */
export function getAllBgNumbers(content: ContentFragment[] | undefined, pluginName: string): number[] {
  if (!content || content.length === 0) {
    return []
  }

  const bgNumbers = new Set<number>()

  for (const fragment of content) {
    // 首先尝试精确匹配 pluginName.bg
    // 如果不匹配，则尝试匹配任何 xxx.bg 格式
    // 同时支持 cloze 类型的 fragment
    const isBgFragment = 
      fragment.t === `${pluginName}.bg` ||
      (typeof fragment.t === "string" && fragment.t.endsWith(".bg")) ||
      (fragment.t === `${pluginName}.cloze` ||
       (typeof fragment.t === "string" && fragment.t.endsWith(".cloze")))
    
    if (isBgFragment) {
      if (typeof (fragment as any).bgNumber === "number") {
        bgNumbers.add((fragment as any).bgNumber)
      } else if (typeof (fragment as any).clozeNumber === "number") {
        bgNumbers.add((fragment as any).clozeNumber)
      }
    }
  }

  // 转为数组并排序
  return Array.from(bgNumbers).sort((a, b) => a - b)
}

/**
 * 从 ContentFragment 数组中提取当前最大的 bg 挖空编号
 *
 * @param content - ContentFragment 数组
 * @param pluginName - 插件名称
 * @returns 当前最大的 bg 挖空编号，如果没有则返回 0
 */
export function getMaxBgNumberFromContent(
  content: ContentFragment[] | undefined,
  pluginName: string
): number {
  if (!content || content.length === 0) {
    return 0
  }

  let maxNumber = 0
  for (const fragment of content) {
    if ((fragment.t === `${pluginName}.bg` || (typeof fragment.t === "string" && fragment.t.endsWith(".bg"))) && typeof (fragment as any).bgNumber === "number") {
      if ((fragment as any).bgNumber > maxNumber) {
        maxNumber = (fragment as any).bgNumber
      }
    } else if ((fragment.t === `${pluginName}.cloze` || (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))) && typeof (fragment as any).clozeNumber === "number") {
      if ((fragment as any).clozeNumber > maxNumber) {
        maxNumber = (fragment as any).clozeNumber
      }
    }
  }
  return maxNumber
}

/**
 * 递归遍历块树，收集所有子块
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
    
    console.log(`[BG Utils] 块 ${id} 的子块:`, block.children)
    
    // 遍历所有子块
    for (const childId of block.children) {
      result.push(childId)
      await traverse(childId)
    }
  }
  
  await traverse(blockId)
  console.log(`[BG Utils] 递归遍历完成，找到 ${result.length} 个子块`)
  return result
}

/**
 * 从表格块及其子块中提取所有 bg 挖空内容
 *
 * @param blockId - 表格块 ID
 * @param pluginName - 插件名称
 * @returns 挖空内容数组，每个元素包含编号和内容
 */
export async function extractBgClozeContent(blockId: DbId, pluginName: string): Promise<{ number: number; content: string }[]> {
  const result: { number: number; content: string }[] = []
  
  // 递归获取所有子块 ID
  const allBlockIds = await getAllDescendantIds(blockId)
  allBlockIds.push(blockId) // 包含自身
  
  console.log(`[BG Utils] 开始遍历块树，总块数: ${allBlockIds.length}`)
  console.log(`[BG Utils] 遍历的块 ID:`, allBlockIds)
  
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
    console.log(`[BG Utils] 批量获取块:`, blocksToFetch)
    const fetchedBlocks = await orca.invokeBackend("get-blocks", blocksToFetch) as Block[]
    if (fetchedBlocks && fetchedBlocks.length > 0) {
      console.log(`[BG Utils] 成功获取 ${fetchedBlocks.length} 个块`)
      for (const block of fetchedBlocks) {
        blocksMap.set(block.id, block)
      }
    }
  }
  
  // 遍历所有块，提取 bg 挖空内容
  for (const id of allBlockIds) {
    console.log(`[BG Utils] 处理块 ID: ${id}`)
    const block = blocksMap.get(id)
    
    if (block) {
      console.log(`[BG Utils] 块 ${id} 存在，有 content: ${!!block.content}`)
      if (block.content) {
        console.log(`[BG Utils] 块 ${id} 的 content 长度: ${block.content.length}`)
        console.log(`[BG Utils] 块 ${id} 的 content:`, block.content)
        for (const fragment of block.content) {
          console.log(`[BG Utils] 检查 fragment:`, {
            type: fragment.t,
            content: fragment.v,
            bgNumber: (fragment as any).bgNumber,
            clozeNumber: (fragment as any).clozeNumber
          })
          const isBgFragment = 
            fragment.t === `${pluginName}.bg` ||
            (typeof fragment.t === "string" && fragment.t.endsWith(".bg")) ||
            (fragment.t === `${pluginName}.cloze` ||
             (typeof fragment.t === "string" && fragment.t.endsWith(".cloze")))
          
          console.log(`[BG Utils] fragment.t: ${fragment.t}, isBgFragment: ${isBgFragment}`)
          
          if (isBgFragment) {
            console.log(`[BG Utils] 找到 bg 挖空 fragment:`, {
              type: fragment.t,
              bgNumber: (fragment as any).bgNumber,
              clozeNumber: (fragment as any).clozeNumber,
              content: fragment.v
            })
            if (typeof (fragment as any).bgNumber === "number") {
              const bgItem = {
                number: (fragment as any).bgNumber,
                content: fragment.v || ""
              }
              result.push(bgItem)
              console.log(`[BG Utils] 添加 bg 挖空内容:`, bgItem)
            } else if (typeof (fragment as any).clozeNumber === "number") {
              const bgItem = {
                number: (fragment as any).clozeNumber,
                content: fragment.v || ""
              }
              result.push(bgItem)
              console.log(`[BG Utils] 添加 cloze 挖空内容:`, bgItem)
            } else {
              console.log(`[BG Utils] 没有有效的挖空序号:`, {
                bgNumber: (fragment as any).bgNumber,
                clozeNumber: (fragment as any).clozeNumber
              })
            }
          }
        }
      }
    } else {
      console.log(`[BG Utils] 块 ${id} 不存在`)
    }
  }
  
  console.log(`[BG Utils] 提取完成，共找到 ${result.length} 个 bg 挖空`)
  console.log(`[BG Utils] 提取的 bg 挖空内容:`)
  result.forEach((item, index) => {
    console.log(`[BG Utils] 序号 ${item.number}: "${item.content}"`)
  })
  console.log(`[BG Utils] 所有挖空序号:`, result.map(item => item.number))
  
  return result
}

/**
 * 在 ContentFragment 数组中找到指定位置并拆分/插入 bg fragment
 * 
 * @param content - 原始 ContentFragment 数组
 * @param cursor - 光标数据
 * @param selectedText - 选中的文本
 * @param bgNumber - bg 编号
 * @param pluginName - 插件名称
 * @returns 新的 ContentFragment 数组
 */
function buildNewBgContent(
  content: ContentFragment[],
  cursor: any,
  selectedText: string,
  bgNumber: number,
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
      
      // 插入 bg fragment
      newContent.push({
        t: `${pluginName}.bg`,
        v: selectedText,
        bgNumber: bgNumber,
        'data-bg-number': bgNumber
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
 * 将选中的文本转换为 bg 挖空格式
 * 
 * @param cursor - 当前光标位置和选中信息
 * @param pluginName - 插件名称
 * @returns 转换结果或 null
 */
export async function createBgCloze(
  cursor: any,
  pluginName: string
): Promise<{ 
  blockId: number
  bgNumber: number
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
  
  // 从 block.content 中获取当前最大的 bg 编号
  const maxBgNumber = getMaxBgNumberFromContent(block.content, pluginName)
  const nextBgNumber = maxBgNumber + 1

  // 【关键】先检查是否有 #card 标签
  const hasCardTagBefore = !!block.refs?.some(
    ref => ref.type === 2 && (ref.alias === "card" || ref.alias === " Card")
  )

  try {
    // 构建新的 content 数组
    const newContent = buildNewBgContent(
      block.content,
      cursor,
      selectedText,
      nextBgNumber,
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

    // 处理 #card 标签
    const currentBlock = orca.state.blocks[blockId] as Block
    const hasCardTagAfter = currentBlock.refs?.some(
      ref => ref.type === 2 && (ref.alias === "card" || ref.alias === " Card")
    )

    if (!hasCardTagAfter) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "card",
          [
            { name: "type", value: "bg" },
            { name: "牌组", value: [] },  // 空数组表示未设置牌组
            { name: "status", value: "" }  // 空字符串表示正常状态
          ]
        )
        console.log(`[${pluginName}] 已添加 #card 标签并设置 type=bg`)
      } catch (error) {
        console.error(`[${pluginName}] 添加 #card 标签失败:`, error)
      }
    } else if (!hasCardTagBefore) {
      try {
        const cardRef = currentBlock.refs?.find(
          ref => ref.type === 2 && (ref.alias === "card" || ref.alias === " Card")
        )
        if (cardRef) {
          await orca.commands.invokeEditorCommand(
            "core.editor.setRefData",
            null,
            cardRef,
            [{ name: "type", value: "bg" }]
          )
          console.log(`[${pluginName}] 已更新 #card 标签的 type=bg`)
        }
      } catch (error) {
        console.error(`[${pluginName}] 更新 #card 标签属性失败:`, error)
      }
    }

    // 显示成功通知
    orca.notify(
      "success",
      `已创建表格挖空 b${nextBgNumber}: "${selectedText}"`,
      { title: "BG Card" }
    )

    return { blockId, bgNumber: nextBgNumber }
  } catch (error) {
    console.error(`[${pluginName}] 创建 bg 挖空失败:`, error)
    orca.notify("error", `创建 bg 挖空失败: ${error}`, { title: "BG Card" })
    return null
  }
}
