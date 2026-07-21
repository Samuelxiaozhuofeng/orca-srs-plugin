/**
 * AI / Firecrawl 服务设置面板状态
 */

import { isAIDialogBusyOrInReview } from "./aiDialogState"
import { isAIQuickInteractOpen } from "./aiQuickInteractState"
import {
  getAISettings,
  hydrateAISettings,
  type AISettings
} from "./aiSettingsSchema"
import {
  getWebImportSettings,
  hydrateWebImportSettings,
  type WebImportSettings
} from "../settings/webImportSettingsSchema"

const { proxy } = window.Valtio

export interface AIServiceSettingsState {
  isOpen: boolean
  pluginName: string | null
  isLoading: boolean
  isSaving: boolean
  errorMessage: string | null
  /** 打开时载入的初始值，供表单 key 初始化 */
  initialAI: AISettings
  initialFirecrawl: WebImportSettings
}

const emptyAI: AISettings = {
  apiKey: "",
  apiUrl: "",
  model: ""
}

const emptyFirecrawl: WebImportSettings = {
  firecrawlApiKey: "",
  firecrawlApiUrl: ""
}

export const aiServiceSettingsState = proxy({
  isOpen: false,
  pluginName: null as string | null,
  isLoading: false,
  isSaving: false,
  errorMessage: null as string | null,
  initialAI: { ...emptyAI },
  initialFirecrawl: { ...emptyFirecrawl }
}) as AIServiceSettingsState

export function isAIServiceSettingsOpen(): boolean {
  return aiServiceSettingsState.isOpen
}

export async function openAIServiceSettings(pluginName: string): Promise<void> {
  if (isAIDialogBusyOrInReview()) {
    orca.notify("warn", "请先关闭 AI 生成闪卡窗口", { title: "服务设置" })
    return
  }
  if (isAIQuickInteractOpen()) {
    orca.notify("warn", "请先关闭 AI 快捷交互窗口", { title: "服务设置" })
    return
  }
  // 动态 import 避免与 aiPromptManagerState 循环依赖
  const { isAIPromptManagerOpen } = await import("./aiPromptManagerState")
  if (isAIPromptManagerOpen()) {
    orca.notify("warn", "请先关闭 AI 提示词库", { title: "服务设置" })
    return
  }

  aiServiceSettingsState.pluginName = pluginName
  aiServiceSettingsState.errorMessage = null
  aiServiceSettingsState.isSaving = false
  aiServiceSettingsState.isLoading = true
  // 先用同步缓存/settings 填充，避免空白
  aiServiceSettingsState.initialAI = getAISettings(pluginName)
  aiServiceSettingsState.initialFirecrawl = getWebImportSettings(pluginName)
  aiServiceSettingsState.isOpen = true

  try {
    const [ai, firecrawl] = await Promise.all([
      hydrateAISettings(pluginName),
      hydrateWebImportSettings(pluginName)
    ])
    if (
      !aiServiceSettingsState.isOpen ||
      aiServiceSettingsState.pluginName !== pluginName
    ) {
      return
    }
    aiServiceSettingsState.initialAI = ai
    aiServiceSettingsState.initialFirecrawl = firecrawl
  } catch (error) {
    console.error("[AI ServiceSettings] 加载失败:", error)
    if (
      aiServiceSettingsState.isOpen &&
      aiServiceSettingsState.pluginName === pluginName
    ) {
      const message =
        error instanceof Error ? error.message : "加载服务设置失败"
      aiServiceSettingsState.errorMessage = message
      orca.notify("error", message, { title: "服务设置" })
    }
  } finally {
    if (aiServiceSettingsState.pluginName === pluginName) {
      aiServiceSettingsState.isLoading = false
    }
  }
}

export function closeAIServiceSettings(): void {
  if (aiServiceSettingsState.isSaving) return
  aiServiceSettingsState.isOpen = false
  setTimeout(() => {
    if (aiServiceSettingsState.isOpen) return
    aiServiceSettingsState.pluginName = null
    aiServiceSettingsState.errorMessage = null
    aiServiceSettingsState.isLoading = false
    aiServiceSettingsState.isSaving = false
    aiServiceSettingsState.initialAI = { ...emptyAI }
    aiServiceSettingsState.initialFirecrawl = { ...emptyFirecrawl }
  }, 300)
}

export function setServiceSettingsError(message: string | null): void {
  aiServiceSettingsState.errorMessage = message
}

export function setServiceSettingsSaving(value: boolean): void {
  aiServiceSettingsState.isSaving = value
}
