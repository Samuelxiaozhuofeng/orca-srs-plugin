/**
 * 列表卡创建模块
 *
 * 规则：
 * - 列表条目只取父块的直接子块（children）
 * - 条目 SRS 状态写在“条目子块”自身上（使用普通 srs.* 属性）
 * - 新建列表卡时：第 1 条默认今天到期，其余条目默认明天到期（需通过 Good/Easy 逐次解锁）
 */

import type { Block, CursorData, DbId } from "../orca.d.ts"
import { isCardTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { writeInitialSrsState } from "./storage"

function getTodayMidnight(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function getTomorrowMidnight(): Date {
  const tomorrow = getTodayMidnight()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

function hasAnySrsProps(block: Block | undefined): boolean {
  return !!block?.properties?.some(prop => prop.name.startsWith("srs."))
}

/**
 * 将当前块转换为列表卡（#card(type=list)），并初始化条目子块的 SRS 状态
 *
 * @param cursor - 当前光标位置
 * @param pluginName - 插件名称
 */
export async function createListCardFromBlock(
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

  const childIds = (block.children ?? []) as DbId[]
  if (childIds.length < 2) {
    orca.notify("error", "列表卡需要至少 2 条条目（子块）", { title: "列表卡" })
    return null
  }

  // 添加/更新 #card 标签，type=list
  const hasCardTag = block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias))

  try {
    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "card",
        [
          { name: "type", value: "list" },
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
          [{ name: "type", value: "list" }]
        )
      }
    }
  } catch (error) {
    console.error(`[${pluginName}] 创建列表卡失败（标签处理）:`, error)
    orca.notify("error", `创建列表卡失败: ${error}`, { title: "列表卡" })
    return null
  }

  // 标记为卡片（确保被收集）
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: "srs.isCard", value: true, type: 4 }]
    )
  } catch (error) {
    console.warn(`[${pluginName}] 设置 srs.isCard 失败（不影响主流程）:`, error)
  }

  // 初始化条目子块的 SRS 状态：1 今天，其余明天
  const todayMidnight = getTodayMidnight()
  const tomorrowMidnight = getTomorrowMidnight()

  for (let i = 0; i < childIds.length; i++) {
    const itemId = childIds[i]
    const initialDue = i === 0 ? todayMidnight : tomorrowMidnight

    try {
      const itemBlock =
        (orca.state.blocks?.[itemId] as Block | undefined) ||
        ((await orca.invokeBackend("get-block", itemId)) as Block | undefined)

      if (!hasAnySrsProps(itemBlock)) {
        await writeInitialSrsState(itemId, initialDue)
      }
    } catch (error) {
      console.warn(`[${pluginName}] 初始化列表条目 #${itemId} 失败（跳过）:`, error)
    }
  }

  orca.notify("success", "已创建列表卡（评分将逐条解锁下一条）", { title: "列表卡" })
  return { blockId }
}

