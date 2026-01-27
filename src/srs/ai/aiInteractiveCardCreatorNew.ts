/**
 * AI 智能制卡命令处理器（新版）
 * 
 * 使用 Valtio 状态管理 + ModalOverlay 弹窗
 */

import type { CursorData, Block } from "../../orca.d.ts"
import { extractKnowledgePoints } from "./aiKnowledgeExtractor"
import { openAIDialog } from "./aiDialogState"

export async function startInteractiveCardCreationNew(
  cursor: CursorData,
  pluginName: string
): Promise<void> {
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("warn", "请先选中一个块")
    return
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block

  if (!block) {
    orca.notify("error", "未找到当前块")
    return
  }

  const content = block.text?.trim()
  if (!content) {
    orca.notify("warn", "当前块内容为空，无法生成卡片")
    return
  }

  orca.notify("info", "AI 正在分析内容...", { title: "智能制卡" })

  const extractResult = await extractKnowledgePoints(pluginName, content)

  if (!extractResult.success) {
    orca.notify("error", extractResult.error.message, { title: "分析失败" })
    return
  }

  if (extractResult.knowledgePoints.length === 0) {
    orca.notify("warn", "未检测到知识点，请使用自定义输入", { title: "智能制卡" })
  }

  openAIDialog(extractResult.knowledgePoints, content, blockId)
}
