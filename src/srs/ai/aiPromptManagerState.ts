/**
 * AI 工具栏提示词管理窗口状态（Valtio）
 */

import type { ToolbarAIPrompt } from "./aiToolbarPromptStore"
import {
  getToolbarAIPrompts,
  hydrateToolbarAIPromptLibrary
} from "./aiToolbarPromptStore"
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
  /** 进入表单时的初始值（表单内用本地 state 编辑，避免无法输入） */
  draftLabel: string
  draftPrompt: string
  draftIncludeBlockContext: boolean
  draftInsertBelowOnComplete: boolean
  errorMessage: string | null
  isSaving: boolean
  isLoadingItems: boolean
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
  draftInsertBelowOnComplete: true,
  errorMessage: null as string | null,
  isSaving: false,
  isLoadingItems: false
}) as AIPromptManagerState

export function isAIPromptManagerOpen(): boolean {
  return aiPromptManagerState.isOpen
}

/**
 * 打开管理窗并异步 hydrate 提示词库。
 * 若 AI 闪卡 / 快捷交互弹窗已开，则 warn 并 return。
 */
export async function openAIPromptManager(pluginName: string): Promise<void> {
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
  aiPromptManagerState.draftInsertBelowOnComplete = true
  aiPromptManagerState.errorMessage = null
  aiPromptManagerState.isSaving = false
  aiPromptManagerState.isLoadingItems = true
  aiPromptManagerState.isOpen = true

  try {
    const items = await hydrateToolbarAIPromptLibrary(pluginName)
    if (
      !aiPromptManagerState.isOpen ||
      aiPromptManagerState.pluginName !== pluginName
    ) {
      return
    }
    aiPromptManagerState.items = items
  } catch (error) {
    console.error("[AI PromptManager] 加载提示词库失败:", error)
    if (
      aiPromptManagerState.isOpen &&
      aiPromptManagerState.pluginName === pluginName
    ) {
      const message =
        error instanceof Error ? error.message : "加载提示词库失败"
      aiPromptManagerState.errorMessage = message
      orca.notify("error", message, { title: "AI 提示词库" })
    }
  } finally {
    if (aiPromptManagerState.pluginName === pluginName) {
      aiPromptManagerState.isLoadingItems = false
    }
  }
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
    aiPromptManagerState.draftInsertBelowOnComplete = true
    aiPromptManagerState.errorMessage = null
    aiPromptManagerState.isSaving = false
    aiPromptManagerState.isLoadingItems = false
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
  aiPromptManagerState.draftInsertBelowOnComplete = true
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
  aiPromptManagerState.draftInsertBelowOnComplete = item.insertBelowOnComplete
  aiPromptManagerState.errorMessage = null
}

export function backToListMode(): void {
  if (aiPromptManagerState.isSaving) return
  aiPromptManagerState.mode = "list"
  aiPromptManagerState.editIndex = null
  aiPromptManagerState.draftLabel = ""
  aiPromptManagerState.draftPrompt = ""
  aiPromptManagerState.draftIncludeBlockContext = true
  aiPromptManagerState.draftInsertBelowOnComplete = true
  aiPromptManagerState.errorMessage = null
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
  aiPromptManagerState.draftInsertBelowOnComplete = true
  aiPromptManagerState.errorMessage = null
}
