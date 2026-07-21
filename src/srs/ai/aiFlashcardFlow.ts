/**
 * AI 生成闪卡入口：读取当前块 → 打开 Plan B 弹窗
 */

import type { Block, CursorData } from "../../orca.d.ts"
import {
  aiDialogState,
  isAIDialogBusyOrInReview,
  openAIDialog
} from "./aiDialogState"
import { isAIConfigured } from "./aiSettingsSchema"

/**
 * backend-first 读取块文本；get-block 成功返回 null 视为缺失，不回退 state。
 * 仅当 backend 抛错时回退 state。
 */
export async function readBlockText(blockId: number): Promise<{
  text: string
  block: Block | null
}> {
  let block: Block | null = null

  try {
    const fromBackend = (await orca.invokeBackend("get-block", blockId)) as
      | Block
      | null
      | undefined
    if (fromBackend == null) {
      return { text: "", block: null }
    }
    block = fromBackend
  } catch {
    block = (orca.state.blocks[blockId] as Block | undefined) ?? null
  }

  const text = (block?.text ?? "").trim()
  return { text, block }
}

/**
 * 从光标打开 AI 闪卡对话框（不发起 AI 请求）
 */
export async function startAIFlashcardFlow(
  cursor: CursorData,
  pluginName: string
): Promise<void> {
  if (!cursor?.anchor?.blockId) {
    orca.notify("warn", "请先将光标放在一个块上", { title: "AI 生成闪卡" })
    return
  }

  if (isAIDialogBusyOrInReview()) {
    orca.notify(
      "warn",
      "AI 生成闪卡对话框已打开，请先关闭当前对话框后再试",
      { title: "AI 生成闪卡" }
    )
    return
  }

  // Defensive: if somehow open with empty state
  if (aiDialogState.isOpen) {
    orca.notify(
      "warn",
      "AI 生成闪卡对话框已打开，请先关闭当前对话框后再试",
      { title: "AI 生成闪卡" }
    )
    return
  }

  try {
    const { isAIQuickInteractOpen } = await import("./aiQuickInteractState")
    if (isAIQuickInteractOpen()) {
      orca.notify(
        "warn",
        "AI 快捷交互对话框已打开，请先关闭后再试",
        { title: "AI 生成闪卡" }
      )
      return
    }
  } catch (error) {
    console.warn("[AI 生成闪卡] 检查快捷交互弹窗状态失败:", error)
  }

  if (!isAIConfigured(pluginName)) {
    orca.notify("warn", "请先在插件设置中配置 API Key", { title: "AI 生成闪卡" })
    return
  }

  const blockId = cursor.anchor.blockId
  const { text } = await readBlockText(blockId)

  if (!text) {
    orca.notify("warn", "当前块内容为空，无法生成卡片", { title: "AI 生成闪卡" })
    return
  }

  openAIDialog(text, blockId)
}
