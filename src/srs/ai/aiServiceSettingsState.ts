/**
 * AI / Firecrawl 服务设置面板状态
 */

import {
  getQuickCardPrefs,
  hydrateQuickCardPrefs,
  type QuickCardPrefs
} from "./aiQuickCardPrefs"
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
import {
  getChapterQuizPrefs,
  hydrateChapterQuizPrefs,
  DEFAULT_CHAPTER_QUIZ_COUNT,
  type ChapterQuizPrefs
} from "../settings/chapterQuizSettingsSchema"
import {
  getTtsSettings,
  hydrateTtsSettings,
  DEFAULT_TTS_REGION,
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_RATE,
  DEFAULT_TTS_PITCH,
  DEFAULT_TTS_OUTPUT_FORMAT,
  type TtsSettings
} from "../tts/ttsSettingsSchema"
import {
  getDefaultReviewServiceSettingsDraft,
  loadReviewServiceSettings,
  type ReviewServiceSettingsDraft
} from "../settings/reviewServiceSettings"

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
  initialQuickCard: QuickCardPrefs
  /** 章末小测偏好（出题数量 / 语言 / 自定义提示词 / 专用模型） */
  initialChapterQuiz: ChapterQuizPrefs
  /** Azure TTS 连接（独立 key，不复用 AI） */
  initialTts: TtsSettings
  /**
   * 复习页可见三项（日新卡 / 日复习 / 保留率；仍存 plugin settings）。
   * 打开时填安全生效值；非法旧配置时见 reviewLoadWarning。
   * 不含权重 / 最大间隔草稿。
   */
  initialReview: ReviewServiceSettingsDraft
  /** 打开时若可见复习项非法，展示 runtime 警告文案 */
  reviewLoadWarning: string | null
}

const emptyAI: AISettings = {
  apiKey: "",
  apiUrl: "",
  model: "",
  enableNativeWebSearch: false,
  reasoningEffort: "default",
  webSearchToolType: "auto",
  maxOutputTokens: 16384
}

const emptyQuickCard: QuickCardPrefs = {
  cardLanguage: "auto",
  customInstruction: "",
  model: ""
}

const emptyFirecrawl: WebImportSettings = {
  firecrawlApiKey: "",
  firecrawlApiUrl: ""
}

const emptyChapterQuiz: ChapterQuizPrefs = {
  // 单一默认源：与生成侧 CHAPTER_QUIZ_DEFAULT_COUNT(10) 一致的 schema 默认常量
  questionCount: DEFAULT_CHAPTER_QUIZ_COUNT,
  language: "auto",
  customPrompt: "",
  model: ""
}

const emptyTts: TtsSettings = {
  provider: "azure",
  region: DEFAULT_TTS_REGION,
  endpoint: "",
  apiKey: "",
  voice: DEFAULT_TTS_VOICE,
  format: DEFAULT_TTS_OUTPUT_FORMAT,
  rate: DEFAULT_TTS_RATE,
  pitch: DEFAULT_TTS_PITCH
}

const emptyReview: ReviewServiceSettingsDraft =
  getDefaultReviewServiceSettingsDraft()

export const aiServiceSettingsState = proxy({
  isOpen: false,
  pluginName: null as string | null,
  isLoading: false,
  isSaving: false,
  errorMessage: null as string | null,
  initialAI: { ...emptyAI },
  initialFirecrawl: { ...emptyFirecrawl },
  initialChapterQuiz: { ...emptyChapterQuiz },
  initialTts: { ...emptyTts },
  initialReview: { ...emptyReview },
  reviewLoadWarning: null as string | null
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
  aiServiceSettingsState.initialQuickCard = getQuickCardPrefs(pluginName)
  aiServiceSettingsState.initialChapterQuiz = getChapterQuizPrefs(pluginName)
  aiServiceSettingsState.initialTts = getTtsSettings(pluginName)
  // 复习可见项存 plugin settings，同步可读；非法旧值展示安全草稿 + 警告
  const reviewLoaded = loadReviewServiceSettings(pluginName)
  aiServiceSettingsState.initialReview = reviewLoaded.draft
  aiServiceSettingsState.reviewLoadWarning = reviewLoaded.warningMessage
  aiServiceSettingsState.isOpen = true

  try {
    const [ai, firecrawl, quickCard, chapterQuiz, tts] = await Promise.all([
      hydrateAISettings(pluginName),
      hydrateWebImportSettings(pluginName),
      hydrateQuickCardPrefs(pluginName),
      hydrateChapterQuizPrefs(pluginName),
      hydrateTtsSettings(pluginName)
    ])
    if (
      !aiServiceSettingsState.isOpen ||
      aiServiceSettingsState.pluginName !== pluginName
    ) {
      return
    }
    aiServiceSettingsState.initialAI = ai
    aiServiceSettingsState.initialFirecrawl = firecrawl
    aiServiceSettingsState.initialQuickCard = quickCard
    aiServiceSettingsState.initialChapterQuiz = chapterQuiz
    aiServiceSettingsState.initialTts = tts
    // 复习无独立 hydrate；再次同步读，避免打开后 settings 已变
    const reviewAgain = loadReviewServiceSettings(pluginName)
    aiServiceSettingsState.initialReview = reviewAgain.draft
    aiServiceSettingsState.reviewLoadWarning = reviewAgain.warningMessage
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
    aiServiceSettingsState.initialChapterQuiz = { ...emptyChapterQuiz }
    aiServiceSettingsState.initialTts = { ...emptyTts }
    aiServiceSettingsState.initialReview = { ...emptyReview }
    aiServiceSettingsState.reviewLoadWarning = null
  }, 300)
}

export function setServiceSettingsError(message: string | null): void {
  aiServiceSettingsState.errorMessage = message
}

export function setServiceSettingsSaving(value: boolean): void {
  aiServiceSettingsState.isSaving = value
}
