/**
 * 渐进阅读 Topic 卡片创建模块
 *
 * 规则：
 * - 当前块没有 #card 标签时，添加 #card 并设置 type=topic
 * - 当前块已有 #card 标签时，更新 type=topic
 * - 初始化渐进阅读状态（ir.*），默认优先级 DEFAULT_IR_PRIORITY=50，正常分散排期
 * - 不自动将 due 改到今天
 */

import type { Block, CursorData, DbId } from "../orca.d.ts"
import { ensureIRState, invalidateIrBlockCache } from "./incrementalReadingStorage"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { isCardTag } from "./tagUtils"
import { buildCardTagData } from "./cardTagDataBuilder"
import { upsertIRIndexId } from "./incremental-reading/irIndex"

/**
 * 按 blockId 将块初始化为 Topic IR（不依赖编辑器光标）。
 * 供右键菜单与斜杠命令共用。
 */
export async function createTopicCardByBlockId(
  blockId: DbId,
  pluginName: string
): Promise<{ blockId: DbId } | null> {
  let block =
    (orca.state.blocks?.[blockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

  if (!block) {
    console.error(`[${pluginName}] 创建 Topic 卡片失败：未找到块 #${blockId}`)
    orca.notify("error", "未找到当前块", { title: "渐进阅读" })
    return null
  }

  const hasCardTag = block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false

  try {
    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        blockId,
        "card",
        await buildCardTagData(pluginName, blockId, "topic")
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

  // 插入/更新 #card type=topic 后必须失效块缓存，避免 ensureIRState 读到旧类型按 basic 初始化
  invalidateIrBlockCache(blockId)

  try {
    await ensureIRState(blockId)
    upsertIRIndexId(pluginName, blockId, "topic")
  } catch (error) {
    console.error(`[${pluginName}] 初始化渐进阅读状态失败:`, error)
    orca.notify("error", `初始化渐进阅读状态失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  orca.notify("success", "已加入渐进阅读", { title: "渐进阅读" })
  return { blockId }
}

/**
 * 基于编辑器光标创建 Topic IR；验证 cursor 后委托给 createTopicCardByBlockId。
 */
export async function createTopicCard(
  cursor: CursorData,
  pluginName: string
): Promise<{ blockId: DbId } | null> {
  if (!cursor?.anchor?.blockId) {
    orca.notify("error", "无法获取光标位置")
    return null
  }

  return createTopicCardByBlockId(cursor.anchor.blockId, pluginName)
}
