/**
 * AI 工具栏提示词管理窗口状态（Valtio）
 */

import type { ToolbarAIPrompt } from "./aiToolbarPromptStore"
import { getToolbarAIPrompts } from "./aiToolbarPromptStore"
import { isAIDialogBusyOrInReview } from "./aiDialogState"
import { isAIQuickInteractOpen } from "./aiQuickInteractState"

const { proxy } = window.Valtio

export type AIPromptManagerMode = "list" | "edit" | "create"

export interface AIPromptManagerState {
  isOpen: boolean
  pluginName: string | null
  items: ToolbarAIPrompt[]
  mode: AIPromptManagerMode
  editIndex: number | null
  draftLabel: string
  draftPrompt: string
  draftIncludeBlockContext: boolean
  errorMessage: string | null
  isSaving: boolean
}

export const aiPromptManagerState = proxy({
  isOpen: false,
  pluginName: null as string | null,
  items: [] as ToolbarAIPrompt[],
  mode: "list" as AIPromptManagerMode,
  editIndex: null as number | null,
  draftLabel: "",
  draftPrompt: "",
  draftIncludeBlockContext: true,
  errorMessage: null as string | null,
  isSaving: false
}) as AIPromptManagerState

export function isAIPromptManagerOpen(): boolean {
  return aiPromptManagerState.isOpen
}

/**
 * 打开管理窗并载入当前提示词。
 * 若 AI 闪卡 / 快捷交互弹窗已开，则 warn 并 return。
 */
export function openAIPromptManager(pluginName: string): void {
  if (isAIDialogBusyOrInReview()) {
    orca.notify("warn", "请先关闭 AI 生成闪卡窗口", { title: "AI 提示词库" })
    return
  }
  if (isAIQuickInteractOpen()) {
    orca.notify("warn", "请先关闭 AI 快捷交互窗口", { title: "AI 提示词库" })
    return
  }

  aiPromptManagerState.pluginName = pluginName
  aiPromptManagerState.items = getToolbarAIPrompts(pluginName)
  aiPromptManagerState.mode = "list"
  aiPromptManagerState.editIndex = null
  aiPromptManagerState.draftLabel = ""
  aiPromptManagerState.draftPrompt = ""
  aiPromptManagerState.draftIncludeBlockContext = true
  aiPromptManagerState.errorMessage = null
  aiPromptManagerState.isSaving = false
  aiPromptManagerState.isOpen = true
}

export function closeAIPromptManager(): void {
  if (aiPromptManagerState.isSaving) return
  aiPromptManagerState.isOpen = false
  setTimeout(() => {
    if (aiPromptManagerState.isOpen) return
    aiPromptManagerState.pluginName = null
    aiPromptManagerState.items = []
    aiPromptManagerState.mode = "list"
    aiPromptManagerState.editIndex = null
    aiPromptManagerState.draftLabel = ""
    aiPromptManagerState.draftPrompt = ""
    aiPromptManagerState.draftIncludeBlockContext = true
    aiPromptManagerState.errorMessage = null
    aiPromptManagerState.isSaving = false
  }, 300)
}

export function reloadAIPromptManagerItems(pluginName: string): void {
  aiPromptManagerState.items = getToolbarAIPrompts(pluginName)
}

export function enterCreateMode(): void {
  aiPromptManagerState.mode = "create"
  aiPromptManagerState.editIndex = null
  aiPromptManagerState.draftLabel = ""
  aiPromptManagerState.draftPrompt = ""
  aiPromptManagerState.draftIncludeBlockContext = true
  aiPromptManagerState.errorMessage = null
}

export function enterEditMode(index: number): void {
  const item = aiPromptManagerState.items[index]
  if (!item) return
  aiPromptManagerState.mode = "edit"
  aiPromptManagerState.editIndex = index
  aiPromptManagerState.draftLabel = item.label
  aiPromptManagerState.draftPrompt = item.prompt
  aiPromptManagerState.draftIncludeBlockContext = item.includeBlockContext
  aiPromptManagerState.errorMessage = null
}

export function backToListMode(): void {
  if (aiPromptManagerState.isSaving) return
  aiPromptManagerState.mode = "list"
  aiPromptManagerState.editIndex = null
  aiPromptManagerState.draftLabel = ""
  aiPromptManagerState.draftPrompt = ""
  aiPromptManagerState.draftIncludeBlockContext = true
  aiPromptManagerState.errorMessage = null
}

export function setManagerDraftLabel(value: string): void {
  aiPromptManagerState.draftLabel = value
}

export function setManagerDraftPrompt(value: string): void {
  aiPromptManagerState.draftPrompt = value
}

export function setManagerDraftIncludeBlockContext(value: boolean): void {
  aiPromptManagerState.draftIncludeBlockContext = value
}

export function setManagerError(message: string | null): void {
  aiPromptManagerState.errorMessage = message
}

export function setManagerSaving(value: boolean): void {
  aiPromptManagerState.isSaving = value
}

export function applyManagerItems(items: ToolbarAIPrompt[]): void {
  aiPromptManagerState.items = items
  aiPromptManagerState.mode = "list"
  aiPromptManagerState.editIndex = null
  aiPromptManagerState.draftLabel = ""
  aiPromptManagerState.draftPrompt = ""
  aiPromptManagerState.draftIncludeBlockContext = true
  aiPromptManagerState.errorMessage = null
}
