/**
 * 渐进阅读 Extract（摘录）创建工具
 *
 * SuperMemo 风格：将当前块中选中的文本“摘录”为一个子块，并为该子块打上 #card 标签。
 *
 * 注意：本实现严格复用现有代码库的模式：
 * - 光标/选区处理：参考 src/srs/clozeUtils.ts
 * - #card 标签与 IR 初始化：参考 src/srs/topicCardCreator.ts
 */

import type { Block, ContentFragment, CursorData, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { ensureIRState } from "./incrementalReadingStorage"
import type { IRPriorityChoice } from "./incrementalReadingScheduler"
import { getPriorityChoiceFromTopic } from "./incrementalReadingScheduler"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { isCardTag } from "./tagUtils"

const DEFAULT_PRIORITY_CHOICE = "中优先级"

const findNearestTopic = (block: Block): Block | null => {
  let current: Block | undefined = block
  let guard = 0

  while (current && guard < 100) {
    if (extractCardType(current) === "topic") {
      return current
    }
    const parentId = current.parent
    if (!parentId) return null
    current = orca.state.blocks?.[parentId] as Block | undefined
    guard += 1
  }

  return null
}

const resolveInheritedPriority = (block: Block): IRPriorityChoice => {
  const topic = findNearestTopic(block)
  if (!topic) return DEFAULT_PRIORITY_CHOICE
  return getPriorityChoiceFromTopic(topic, DEFAULT_PRIORITY_CHOICE)
}

/**
 * 创建摘录子块并初始化其 #card 与渐进阅读状态
 *
 * @returns { blockId, extractBlockId } 便于上层做撤销/定位等操作
 */
export async function createExtract(
  cursor: CursorData,
  pluginName: string
): Promise<{ blockId: DbId; extractBlockId: DbId } | null> {
  // 验证光标数据
  if (!cursor?.anchor?.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks?.[blockId] as Block | undefined

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
    orca.notify("warn", "请先选择要摘录的文本")
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
  const fragment = block.content[fragmentIndex] as ContentFragment | undefined

  if (!fragment || !fragment.v) {
    orca.notify("warn", "无法获取选中的文本片段")
    return null
  }

  // 计算选区在 fragment 内的位置
  const startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
  const endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)
  const selectedText = fragment.v.substring(startOffset, endOffset)

  if (!selectedText || selectedText.trim() === "") {
    orca.notify("warn", "请先选择要摘录的文本")
    return null
  }

  // 1) 创建子块（摘录块）
  let extractBlockId: DbId
  try {
    const insertResult = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      block,
      "lastChild",
      [{ t: "t", v: selectedText }]
    )

    if (typeof insertResult !== "number") {
      orca.notify("error", "创建摘录块失败：无法获取新块 ID", { title: "渐进阅读" })
      console.error(`[${pluginName}] 创建摘录块失败：insertBlock 返回值异常`, insertResult)
      return null
    }
    extractBlockId = insertResult
  } catch (error) {
    console.error(`[${pluginName}] 创建摘录块失败:`, error)
    orca.notify("error", `创建摘录块失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  // 2) 为摘录块添加/更新 #card 标签属性
  try {
    const inheritedPriority = resolveInheritedPriority(block)
    const extractBlock = orca.state.blocks?.[extractBlockId] as Block | undefined
    const hasCardTag = extractBlock?.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false

    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        extractBlockId,
        "card",
        [
          { name: "type", value: "extracts" },
          { name: "牌组", value: [] },
          { name: "status", value: "" },
          { name: "priority", value: [inheritedPriority] }
        ]
      )
      await ensureCardTagProperties(pluginName)
    } else {
      const cardRef = extractBlock?.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
      if (cardRef) {
        // 仅补齐缺失的 priority，避免覆盖用户已有选择
        const hasPriority = cardRef.data?.some(data => data.name === "priority") ?? false
        const refData: Array<{ name: string; value: unknown }> = [{ name: "type", value: "extracts" }]
        if (!hasPriority) {
          refData.push({ name: "priority", value: [inheritedPriority] })
        }
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          refData
        )
      }
    }
  } catch (error) {
    console.error(`[${pluginName}] 创建 Extract 卡片失败（标签处理）:`, error)
    orca.notify("error", `创建 Extract 卡片失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  // 3) 初始化渐进阅读状态（ir.*）
  try {
    await ensureIRState(extractBlockId)
  } catch (error) {
    console.error(`[${pluginName}] 初始化渐进阅读状态失败:`, error)
    orca.notify("error", `初始化渐进阅读状态失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  orca.notify("success", "已创建摘录（Extract）", { title: "渐进阅读" })
  return { blockId, extractBlockId }
}
