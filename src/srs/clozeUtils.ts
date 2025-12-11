/**
 * Cloze 卡片工具模块
 *
 * 提供 Cloze 填空卡片的创建和管理功能
 * 
 * 【2025-12-11 重构】使用直接操作 ContentFragment 数组的方式
 * 替代 deleteSelection + insertFragments，以解决插入位置偏移问题
 */

import type { CursorData, Block, ContentFragment } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import { writeInitialClozeSrsState } from "./storage"

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
 * @param pluginName - 插件名称
 * @returns cloze 编号数组（去重并排序）
 */
export function getAllClozeNumbers(content: ContentFragment[] | undefined, pluginName: string): number[] {
  if (!content || content.length === 0) {
    return []
  }

  const clozeNumbers = new Set<number>()

  for (const fragment of content) {
    if (fragment.t === `${pluginName}.cloze` && typeof fragment.clozeNumber === "number") {
      clozeNumbers.add(fragment.clozeNumber)
    }
  }

  // 转为数组并排序
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
  
  // 从 block.content 中获取当前最大的 cloze 编号
  const maxClozeNumber = getMaxClozeNumberFromContent(block.content, pluginName)
  const nextClozeNumber = maxClozeNumber + 1

  // 【关键】先检查是否有 #card 标签
  const hasCardTagBefore = !!block.refs?.some(
    ref => ref.type === 2 && ref.alias === "card"
  )

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

    // 处理 #card 标签
    const currentBlock = orca.state.blocks[blockId] as Block
    const hasCardTagAfter = currentBlock.refs?.some(
      ref => ref.type === 2 && ref.alias === "card"
    )

    if (!hasCardTagAfter) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "card",
          [{ name: "type", value: "cloze" }]
        )
        console.log(`[${pluginName}] 已添加 #card 标签并设置 type=cloze`)
      } catch (error) {
        console.error(`[${pluginName}] 添加 #card 标签失败:`, error)
      }
    } else if (!hasCardTagBefore) {
      try {
        const cardRef = currentBlock.refs?.find(
          ref => ref.type === 2 && ref.alias === "card"
        )
        if (cardRef) {
          await orca.commands.invokeEditorCommand(
            "core.editor.setRefData",
            null,
            cardRef,
            [{ name: "type", value: "cloze" }]
          )
          console.log(`[${pluginName}] 已更新 #card 标签的 type=cloze`)
        }
      } catch (error) {
        console.error(`[${pluginName}] 更新 #card 标签属性失败:`, error)
      }
    }

    // 自动加入复习队列
    try {
      const finalBlock = orca.state.blocks[blockId] as BlockWithRepr

      // 设置 _repr
      finalBlock._repr = {
        type: "srs.cloze-card",
        front: block.text || "",
        back: "（填空卡）",
        cardType: "cloze"
      }

      // 获取块中所有的 cloze 编号
      const clozeNumbers = getAllClozeNumbers(finalBlock.content, pluginName)

      // 设置 srs.isCard 属性
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [blockId],
        [{ name: "srs.isCard", value: true, type: 4 }]
      )

      // 为每个填空设置分天的初始 SRS 状态
      for (let i = 0; i < clozeNumbers.length; i++) {
        const clozeNumber = clozeNumbers[i]
        const daysOffset = clozeNumber - 1
        await writeInitialClozeSrsState(blockId, clozeNumber, daysOffset)
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
