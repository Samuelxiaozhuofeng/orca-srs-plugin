/**
 * 渐进阅读 Topic 卡片创建模块
 *
 * 规则：
 * - 当前块没有 #card 标签时，添加 #card 并设置 type=topic
 * - 当前块已有 #card 标签时，更新 type=topic
 * - 初始化渐进阅读状态（ir.*）
 */

import type { Block, CursorData, DbId } from "../orca.d.ts"
import { ensureIRState } from "./incrementalReadingStorage"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { isCardTag } from "./tagUtils"

export async function createTopicCard(
  cursor: CursorData,
  pluginName: string
): Promise<{ blockId: DbId } | null> {
  if (!cursor?.anchor?.blockId) {
    orca.notify("error", "无法获取光标位置")
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks?.[blockId] as Block | undefined

  if (!block) {
    orca.notify("error", "未找到当前块")
    return null
  }

  const hasCardTag = block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias))

  try {
    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "card",
        [
          { name: "type", value: "topic" },
          { name: "牌组", value: [] },
          { name: "status", value: "" }
        ]
      )
      await ensureCardTagProperties(pluginName)
    } else {
      const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
      if (cardRef) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          [{ name: "type", value: "topic" }]
        )
      }
    }
  } catch (error) {
    console.error(`[${pluginName}] 创建 Topic 卡片失败（标签处理）:`, error)
    orca.notify("error", `创建 Topic 卡片失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  try {
    await ensureIRState(blockId)
  } catch (error) {
    console.error(`[${pluginName}] 初始化渐进阅读状态失败:`, error)
    orca.notify("error", `初始化渐进阅读状态失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  orca.notify("success", "已创建 Topic 卡片", { title: "渐进阅读" })
  return { blockId }
}
