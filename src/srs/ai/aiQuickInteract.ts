/**
 * 选中文本 AI 快捷交互：流程入口 + 稳定导入路径
 *
 * 实现已按职责拆分（纯移动，零行为变更）：
 * - 选区提取 / prompt 构建 / 纯文本 AI 请求 → ./aiQuickPrompt
 * - 结果块持久化状态机（含合并写入串行锁） → ./aiQuickResultBlocks
 * 本文件保留 startAIQuickInteractFlow，并 re-export 全部公共 API，外部导入路径不变。
 */

import type { CursorData } from "../../orca.d.ts"
import { isAIConfigured } from "./aiSettingsSchema"
import { findToolbarAIPrompt } from "./aiToolbarPromptStore"
import {
  describeSelectedTextExtractFailure,
  describeSourceTruncation,
  resolveSelectedTextFromCursor
} from "./aiQuickPrompt"

export {
  AI_SOURCE_SUBTREE_MAX_BLOCKS,
  AI_SOURCE_SUBTREE_MAX_DEPTH,
  buildQuickInteractSystemPrompt,
  buildQuickInteractUserPrompt,
  clipText,
  collectBoundedSubtreePlainText,
  createSubtreeCollectBudget,
  cursorSpansBlocks,
  describeSelectedTextExtractFailure,
  describeSourceTruncation,
  extractSelectedTextFromCursor,
  isExcludedAiSourceBlock,
  isMultiBlockSourceFailure,
  resolveSelectedTextFromCursor,
  shouldUseWholeBlockTextsForCrossBlock,
  QUICK_BLOCK_CONTEXT_MAX,
  QUICK_RESULT_MAX,
  QUICK_SELECTION_MAX,
  runToolbarAIPrompt
} from "./aiQuickPrompt"
export type {
  RunToolbarAIPromptOptions,
  RunToolbarAIPromptResult,
  SelectedTextExtract,
  SelectedTextExtractFailureReason,
  SelectedTextExtractResult
} from "./aiQuickPrompt"
export {
  clearReuseInsertSerialLocksForTests,
  dismissQuickResult,
  findReusableQuickResultRoot,
  insertQuickResult,
  insertQuickResultAfter,
  insertQuickResultAsChild,
  isStrictDescendantOf,
  keepQuickResult,
  keepSelectedQuickResultBlocks,
  promoteQuickResultToChild,
  toggleQuickResultBlockSelection
} from "./aiQuickResultBlocks"
export type {
  InsertQuickResultOptions,
  InsertQuickResultSuccess,
  QuickResultCommitStatus,
  QuickResultInsertPosition
} from "./aiQuickResultBlocks"

export type StartAIQuickInteractOpts =
  | { mode: "preset"; promptId: string }
  | { mode: "custom" }

/**
 * 校验配置/选区并打开弹窗。preset 将 phase 设为 loading，由 Mount 立即请求；
 * custom 进入 edit-prompt 等待用户填写。
 *
 * Valtio 弹窗状态与 AI 闪卡弹窗互斥检查均动态 import，避免 Node 测试加载 window.Valtio。
 */
export async function startAIQuickInteractFlow(
  cursor: CursorData,
  pluginName: string,
  opts: StartAIQuickInteractOpts
): Promise<void> {
  const title = "AI 快捷交互"

  const { isAIDialogBusyOrInReview } = await import("./aiDialogState")
  const {
    isAIQuickInteractOpen,
    openAIQuickInteract
  } = await import("./aiQuickInteractState")

  if (isAIDialogBusyOrInReview()) {
    orca.notify("warn", "AI 生成闪卡对话框已打开，请先关闭后再试", { title })
    return
  }
  if (isAIQuickInteractOpen()) {
    orca.notify("warn", "AI 快捷交互对话框已打开，请先关闭后再试", { title })
    return
  }

  if (!isAIConfigured(pluginName)) {
    orca.notify("warn", "请先在插件设置中配置 API Key", { title })
    return
  }

  const resolved = resolveSelectedTextFromCursor(cursor)
  if (!resolved.ok) {
    orca.notify("warn", describeSelectedTextExtractFailure(resolved.reason), {
      title
    })
    return
  }
  const extract = resolved.extract
  if (extract.truncated) {
    orca.notify("info", describeSourceTruncation(extract), { title })
  }

  // 跨块时仅发送选区拼接结果，不再附带单块 context
  const includeBlockContextForCustom = !extract.multiBlock

  if (opts.mode === "custom") {
    openAIQuickInteract({
      pluginName,
      blockId: extract.blockId,
      selectedText: extract.selectedText,
      blockText: extract.blockText,
      promptLabel: "自定义提示词",
      promptText: "",
      includeBlockContext: includeBlockContextForCustom,
      mode: "custom"
    })
    return
  }

  const prompt = findToolbarAIPrompt(pluginName, opts.promptId)
  if (!prompt) {
    orca.notify("warn", "未找到该提示词，请打开 AI 提示词库检查", { title })
    return
  }

  const includeBlockContext =
    !extract.multiBlock && prompt.includeBlockContext === true

  // 后台插入：预览确认 或 直接写入（均不弹窗）
  if (prompt.directWriteBelow || prompt.insertBelowOnComplete) {
    const { startBackgroundQuickInsertJob } = await import(
      "./aiQuickInteractJobs"
    )
    await startBackgroundQuickInsertJob({
      pluginName,
      sourceBlockId: extract.blockId,
      selectedText: extract.selectedText,
      blockText: extract.blockText,
      promptLabel: prompt.label,
      promptText: prompt.prompt,
      includeBlockContext,
      model: prompt.model,
      commitMode: prompt.directWriteBelow ? "direct" : "preview",
      tags: prompt.resultTags,
      reuseSameResultBlock: prompt.reuseSameResultBlock
    })
    return
  }

  openAIQuickInteract({
    pluginName,
    blockId: extract.blockId,
    selectedText: extract.selectedText,
    blockText: extract.blockText,
    promptLabel: prompt.label,
    promptText: prompt.prompt,
    includeBlockContext,
    resultTags: prompt.resultTags,
    reuseSameResultBlock: prompt.reuseSameResultBlock,
    model: prompt.model,
    mode: "preset"
  })
}
