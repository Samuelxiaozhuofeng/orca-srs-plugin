/**
 * 渐进阅读右键菜单：块分类与“今天阅读”动作
 *
 * 纯判断供菜单 render 与单测共用；不依赖 CursorData。
 */

import type { Block, DbId } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import { isQueryBlock } from "./blockCardCollector"
import { extractCardType } from "./deckUtils"
import { advanceDueToToday } from "./incrementalReadingStorage"

/** 右键菜单应对该块展示的渐进阅读入口 */
export type TopicIRBlockMenuAction = "join" | "readToday" | "hidden"

/**
 * 分类块的渐进阅读右键入口：
 * - 查询块 / 无效块 → hidden
 * - 已是 #card type=topic → readToday（今天阅读）
 * - 其他普通块 → join（加入渐进阅读）
 */
export function classifyTopicIRBlockMenu(block: Block | undefined): TopicIRBlockMenuAction {
  if (!block) return "hidden"
  if (isQueryBlock(block as BlockWithRepr)) return "hidden"
  if (extractCardType(block) === "topic") return "readToday"
  return "join"
}

/**
 * 仅将 ir.due 提前到今天，不改 priority / readCount / stage 等长期状态。
 * 成功通知由本函数发出；失败时 advanceDueToToday 已 console.error + notify，
 * 此处只返回 false，避免双重日志/toast。
 */
export async function advanceTopicDueToToday(
  blockId: DbId,
  _pluginName: string
): Promise<boolean> {
  try {
    await advanceDueToToday(blockId)
    orca.notify("success", "已安排为今天阅读", { title: "渐进阅读" })
    return true
  } catch {
    // advanceDueToToday 已负责错误可见性（console.error + orca.notify）
    return false
  }
}
