/**
 * Cloze 卡片工具模块
 *
 * 提供 Cloze 填空卡片的创建和管理功能
 */

import type { CursorData, Block, ContentFragment } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import { writeInitialSrsState } from "./storage"

/**
 * 将包含 {cN:: 文本} 格式的纯文本解析为 ContentFragment 数组
 *
 * 例如：
 * 输入："中国的首都是{c1:: 北京}，最大的城市是{c2:: 上海}"
 * 输出：[
 *   { t: "t", v: "中国的首都是" },
 *   { t: "pluginName.cloze", v: "北京", clozeNumber: 1 },
 *   { t: "t", v: "，最大的城市是" },
 *   { t: "pluginName.cloze", v: "上海", clozeNumber: 2 }
 * ]
 *
 * @param text - 包含 cloze 标记的文本
 * @param pluginName - 插件名称（用于生成 inline 类型）
 * @returns ContentFragment 数组
 */
export function parseClozeText(text: string, pluginName: string): ContentFragment[] {
  if (!text) {
    return [{ t: "t", v: "" }]
  }

  const fragments: ContentFragment[] = []

  // 正则表达式：匹配 {cN:: 内容}
  // 捕获组1: 数字N
  // 捕获组2: 填空内容
  const clozePattern = /\{c(\d+)::\s*([^}]*)\}/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = clozePattern.exec(text)) !== null) {
    const clozeNumber = parseInt(match[1], 10)
    const clozeContent = match[2]
    const matchStart = match.index
    const matchEnd = clozePattern.lastIndex

    // 添加 cloze 标记之前的普通文本
    if (matchStart > lastIndex) {
      const beforeText = text.substring(lastIndex, matchStart)
      fragments.push({ t: "t", v: beforeText })
    }

    // 添加 cloze inline fragment
    fragments.push({
      t: `${pluginName}.cloze`,
      v: clozeContent,
      clozeNumber: clozeNumber
    } as ContentFragment)

    lastIndex = matchEnd
  }

  // 添加最后剩余的普通文本
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex)
    fragments.push({ t: "t", v: remainingText })
  }

  // 如果没有任何 cloze 标记，返回原文本
  if (fragments.length === 0) {
    return [{ t: "t", v: text }]
  }

  return fragments
}

// 匹配位于文本末尾用于展示 #card 标签的内容（行尾或整行）
const CARD_TAG_DISPLAY_PATTERN =
  /(\s*#card(?:\/[^\s#]+)?)+\s*$/i

/**
 * 移除块文本末尾用于展示 #card 标签的文本片段
 * 只清理位于末尾的 `#card` 行，避免 setBlocksContent 之后重复渲染
 */
function stripTrailingCardTagText(text: string): string {
  if (!text) {
    return text
  }
  return text.replace(CARD_TAG_DISPLAY_PATTERN, "")
}

/**
 * 从文本中提取当前最大的 cloze 编号
 * 
 * @param text - 要检测的文本
 * @returns 当前最大的 cloze 编号，如果没有则返回 0
 */
export function getMaxClozeNumber(text: string): number {
  // 匹配 {c1::...}、{c2::...} 等格式
  const clozePattern = /\{c(\d+)::/g
  let maxNumber = 0
  let match: RegExpExecArray | null

  while ((match = clozePattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10)
    if (num > maxNumber) {
      maxNumber = num
    }
  }

  return maxNumber
}

/**
 * 将选中的文本转换为 cloze 格式
 * 
 * 处理逻辑：
 * 1. 获取光标选中的文本
 * 2. 检测当前块中已有的最大 cloze 编号
 * 3. 使用下一个编号创建新的 cloze
 * 4. 替换选中文本
 * 
 * @param cursor - 当前光标位置和选中信息
 * @param pluginName - 插件名称（用于日志）
 * @returns 转换结果或 null
 */
export async function createCloze(
  cursor: CursorData,
  pluginName: string
): Promise<{ 
  blockId: number
  originalText: string
  originalContent?: ContentFragment[]
} | null> {
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

  // 检查是否有选中文本
  if (cursor.anchor.blockId !== cursor.focus.blockId) {
    orca.notify("warn", "请在同一块内选择文本")
    return null
  }

  // 获取块的当前文本
  const blockText = block.text || ""

  // 计算选中文本的位置
  const startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
  const endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)

  // 提取选中的文本
  const selectedText = blockText.substring(startOffset, endOffset)

  if (!selectedText || selectedText.trim() === "") {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }
  
  // 获取当前最大的 cloze 编号
  const maxClozeNumber = getMaxClozeNumber(blockText)
  const nextClozeNumber = maxClozeNumber + 1

  // 创建新的 cloze 文本
  const clozeText = `{c${nextClozeNumber}:: ${selectedText}}`

  // 构建新的块文本（替换选中部分）
  const newBlockText =
    blockText.substring(0, startOffset) +
    clozeText +
    blockText.substring(endOffset)

  // 【关键】先检查是否有 #card 标签，在修改内容之前
  const hasCardTagBefore = !!block.refs?.some(
    ref => ref.type === 2 && ref.alias === "card"
  )

  // 如果块已经关联了 #card 标签，移除末尾的标签展示文本，避免官方命令再次注入
  const normalizedBlockText = hasCardTagBefore
    ? stripTrailingCardTagText(newBlockText)
    : newBlockText

  // 保存原始数据供撤销使用
  const originalText = blockText
  const originalContent = block.content ? [...block.content] : undefined

  // 【新增】将纯文本转换为 ContentFragment 数组
  // 这样 {c1::} 符号会被解析为自定义 inline 渲染器
  const contentFragments = parseClozeText(normalizedBlockText, pluginName)

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [
        {
          id: blockId,
          content: contentFragments
        }
      ],
      false // setBackCursor
    )

    // 检查块是否已经有 #card 标签（内容更新后再次检查）
    const currentBlock = orca.state.blocks[blockId] as Block
    const hasCardTagAfter = currentBlock.refs?.some(
      ref => ref.type === 2 && ref.alias === "card"
    )

    // 如果没有标签，使用官方命令添加，并设置 type 属性为 cloze
    if (!hasCardTagAfter) {
      try {
        // 使用官方的 insertTag 命令，同时设置 type 属性
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          cursor,
          blockId,
          "card",
          [{ name: "type", value: "cloze" }]  // 设置卡片类型为 cloze
        )
        console.log(`[${pluginName}] 已添加 #card 标签并设置 type=cloze`)
      } catch (error) {
        console.error(`[${pluginName}] 添加 #card 标签失败:`, error)
        // 标签添加失败不影响 cloze 创建，只记录错误
      }
    } else {
      // 如果标签已存在，需要更新其 type 属性
      try {
        const updatedBlock = orca.state.blocks[blockId] as Block
        const cardRef = updatedBlock.refs?.find(
          ref => ref.type === 2 && ref.alias === "card"
        )

        if (cardRef) {
          // 使用 setRefData 更新标签属性
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
        // 属性更新失败不影响 cloze 创建，只记录错误
      }
    }

    // ========================================
    // 自动加入复习队列（与 makeCardFromBlock 一致）
    // ========================================
    try {
      // 获取更新后的块
      const finalBlock = orca.state.blocks[blockId] as BlockWithRepr

      // 设置 _repr（虽然不会持久化，但在当前会话可用）
      finalBlock._repr = {
        type: "srs.cloze-card",
        front: blockText,
        back: "（填空卡）",
        cardType: "cloze"
      }

      // 写入初始 SRS 属性（这是关键 - 自动加入复习队列）
      await writeInitialSrsState(blockId)

      console.log(`[${pluginName}] ✓ 块 #${blockId} 已自动加入复习队列`)
      console.log(`[${pluginName}] 最终 block._repr:`, finalBlock._repr)
    } catch (error) {
      console.error(`[${pluginName}] 自动加入复习队列失败:`, error)
      // 这个错误不影响 cloze 创建，只记录
    }

    // 显示通知
    orca.notify(
      "success",
      `已创建填空 {c${nextClozeNumber}:: ${selectedText}}`,
      { title: "Cloze" }
    )

    return { blockId, originalText, originalContent }
  } catch (error) {
    console.error(`[${pluginName}] 更新块内容失败:`, error)
    orca.notify("error", `创建 cloze 失败: ${error}`, { title: "Cloze" })
    return null
  }
}

