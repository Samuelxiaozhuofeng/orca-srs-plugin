/**
 * AI 生成闪卡入口：读取当前块 / 多块选区 → 打开 Plan B 弹窗
 */

import type { Block, CursorData } from "../../orca.d.ts"
import {
  aiDialogState,
  isAIDialogBusyOrInReview,
  openAIDialog
} from "./aiDialogState"
import {
  collectBoundedSubtreePlainText,
  describeSelectedTextExtractFailure,
  describeSourceTruncation,
  isMultiBlockSourceFailure,
  QUICK_SELECTION_MAX,
  resolveSelectedTextFromCursor
} from "./aiQuickPrompt"
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
  } catch (error) {
    console.warn(
      "[AI 生成闪卡] get-block 失败，回退 state.blocks:",
      blockId,
      error
    )
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
    try {
      const { openAIServiceSettings } = await import(
        "./aiServiceSettingsState"
      )
      await openAIServiceSettings(pluginName)
    } catch (error) {
      console.error("[AI 生成闪卡] 打开连接设置失败:", error)
      orca.notify("error", "打开连接设置失败，请从插件设置中重试", {
        title: "AI 生成闪卡"
      })
    }
    return
  }

  const title = "AI 生成闪卡"

  // 有效选区优先：单 fragment、同块跨样式与跨块都只发送选中内容。
  const selection = resolveSelectedTextFromCursor(cursor)
  if (
    selection.ok &&
    selection.extract.selectedText.trim()
  ) {
    if (selection.extract.truncated) {
      orca.notify("info", describeSourceTruncation(selection.extract), {
        title
      })
    }
    openAIDialog(selection.extract.selectedText, selection.extract.blockId)
    return
  }

  if (!selection.ok && isMultiBlockSourceFailure(cursor, selection)) {
    orca.notify("warn", describeSelectedTextExtractFailure(selection.reason), {
      title
    })
    return
  }

  const blockId = Number(cursor.anchor.blockId)
  // 折叠光标 / 无选区：保持整块全文 + 有界子树。
  // 先确认块仍存在（backend-first），再从 state 展开子树
  const { block } = await readBlockText(blockId)
  if (!block) {
    orca.notify("warn", "当前块内容为空，无法生成卡片", { title })
    return
  }

  const subtree = collectBoundedSubtreePlainText(blockId)
  let text = subtree.text.trim()
  if (!text) {
    orca.notify("warn", "当前块内容为空，无法生成卡片", { title })
    return
  }

  const charTruncated = text.length > QUICK_SELECTION_MAX
  if (charTruncated) {
    text = text.slice(0, QUICK_SELECTION_MAX)
  }
  const structureTruncated = subtree.truncatedByStructure
  if (charTruncated || structureTruncated) {
    orca.notify(
      "info",
      describeSourceTruncation({
        truncated: true,
        charTruncated,
        structureTruncated
      }),
      { title }
    )
  }

  openAIDialog(text, blockId)
}
