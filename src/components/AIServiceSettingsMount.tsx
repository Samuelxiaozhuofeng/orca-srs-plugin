/**
 * AI / Firecrawl 服务设置挂载
 */

import {
  saveQuickCardPrefs,
  type QuickCardPrefs
} from "../srs/ai/aiQuickCardPrefs"
import {
  aiServiceSettingsState,
  closeAIServiceSettings,
  setServiceSettingsError,
  setServiceSettingsSaving
} from "../srs/ai/aiServiceSettingsState"
import { saveAISettings, type AISettings } from "../srs/ai/aiSettingsSchema"
import {
  saveWebImportSettings,
  type WebImportSettings
} from "../srs/settings/webImportSettingsSchema"
import {
  saveChapterQuizPrefs,
  type ChapterQuizPrefs
} from "../srs/settings/chapterQuizSettingsSchema"
import {
  IR_NATIVE_FORMAT_GROUP_IDS,
  saveIRSelectionToolbarSettings,
  type IRSelectionToolbarSettings
} from "../srs/settings/irSelectionToolbarSettings"
import { notifyIRSelectionToolbarSettingsChanged } from "../srs/incremental-reading/irSelectionToolbarController"
import {
  normalizeTtsSettings,
  saveTtsSettings,
  setTtsSettingsCache,
  getTtsSettings,
  TTS_PREVIEW_TEXT,
  type TtsSettings
} from "../srs/tts/ttsSettingsSchema"
import {
  parseReviewServiceSettingsDraftStrict,
  saveReviewServiceSettingsFromForm,
  type ReviewServiceSettingsDraft
} from "../srs/settings/reviewServiceSettings"
import { synthesizeSpeech } from "../srs/tts/azureTtsClient"
import { playTtsAudio } from "../srs/tts/ttsPlayback"
import { sanitizePublicError } from "../srs/http/redactSecrets"
import { fetchCompatibleModels } from "../srs/ai/aiModelsFetch"
import { setCompatibleModelsCache } from "../srs/ai/aiModelsCache"
import {
  createAIConnectionConfigFingerprint,
  isCurrentAIConnectionTestResult,
  testAIConfigWithDetails,
  type AIConnectionConfigSnapshot
} from "../srs/ai/aiConfigValidator"
import {
  AIServiceSettingsDialog,
  type ServiceSettingsDraft
} from "./AIServiceSettingsDialog"

const { Valtio } = window
const { useSnapshot } = Valtio
const { useEffect, useState, useRef } = window.React

interface AIServiceSettingsMountProps {
  pluginName: string
}

export function AIServiceSettingsMount({
  pluginName
}: AIServiceSettingsMountProps) {
  const snap = useSnapshot(aiServiceSettingsState)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [isTestingAI, setIsTestingAI] = useState(false)
  const [isTestingTts, setIsTestingTts] = useState(false)
  const modelsAbortRef = useRef<AbortController | null>(null)
  const aiTestAbortRef = useRef<AbortController | null>(null)
  const aiTestFingerprintRef = useRef<string | null>(null)
  const aiTestResultVisibleRef = useRef(false)
  const ttsTestAbortRef = useRef<AbortController | null>(null)

  const resetAIConnectionTest = () => {
    aiTestAbortRef.current?.abort()
    aiTestAbortRef.current = null
    aiTestFingerprintRef.current = null
    setIsTestingAI(false)
    setStatusMessage(null)
    if (aiTestResultVisibleRef.current) {
      aiTestResultVisibleRef.current = false
      setServiceSettingsError(null)
    }
  }

  useEffect(() => {
    // 挂载组件不会随弹窗关闭而卸载；每次开关都清理上一次的瞬态结果。
    resetAIConnectionTest()
    return () => {
      aiTestAbortRef.current?.abort()
    }
  }, [snap.isOpen])

  if (!snap.isOpen) return null

  const activePlugin = aiServiceSettingsState.pluginName || pluginName
  const formKey = [
    activePlugin,
    snap.isLoading ? "loading" : "ready",
    snap.initialAI.apiKey.length,
    snap.initialAI.apiUrl,
    snap.initialAI.model,
    snap.initialAI.enableNativeWebSearch ? "web1" : "web0",
    snap.initialAI.reasoningEffort,
    snap.initialChapterQuiz.questionCount,
    snap.initialChapterQuiz.language,
    snap.initialIRSelectionToolbar.actions.extract ? "e1" : "e0",
    snap.initialIRSelectionToolbar.actions.cloze ? "c1" : "c0",
    snap.initialIRSelectionToolbar.actions.explain ? "x1" : "x0",
    snap.initialIRSelectionToolbar.actions.aiMenu ? "a1" : "a0",
    snap.initialIRSelectionToolbar.actions.tts ? "t1" : "t0",
    // 格式组须进入 remount key，避免异步 hydrate 后草稿仍停留在旧默认
    ...IR_NATIVE_FORMAT_GROUP_IDS.map(
      (id) =>
        `${id}:${snap.initialIRSelectionToolbar.formatGroups[id] ? "1" : "0"}`
    ),
    snap.initialTts.apiKey.length,
    snap.initialTts.region,
    snap.initialTts.endpoint,
    snap.initialTts.voice,
    snap.initialTts.rate,
    snap.initialTts.pitch,
    snap.initialReview.newCardsPerDay,
    snap.initialReview.reviewCardsPerDay,
    snap.initialReview.requestRetention,
    snap.initialReview.passFailButtons ? "pf1" : "pf0",
    snap.initialReview.showNextReviewTime ? "t1" : "t0",
    snap.reviewLoadWarning ? "review-warn" : "review-ok"
  ].join(":")

  const handleSave = async (draft: ServiceSettingsDraft) => {
    setServiceSettingsError(null)
    setStatusMessage(null)

    // 先严格校验复习可见三项：非法则整包中止，绝不先写入 AI/Firecrawl 等
    const reviewParsed = parseReviewServiceSettingsDraftStrict(draft.review)
    if (!reviewParsed.ok) {
      setServiceSettingsError(reviewParsed.message)
      orca.notify("error", reviewParsed.message, { title: "服务设置" })
      return
    }

    setServiceSettingsSaving(true)
    try {
      await saveAISettings(activePlugin, draft.ai)
      await saveWebImportSettings(activePlugin, draft.firecrawl)
      await saveQuickCardPrefs(activePlugin, draft.quickCard)
      await saveChapterQuizPrefs(activePlugin, draft.chapterQuiz)
      await saveIRSelectionToolbarSettings(
        activePlugin,
        draft.irSelectionToolbar
      )
      await saveTtsSettings(activePlugin, draft.tts)
      // 写回复习页可见项（额度 / 保留率 / 界面开关）并 clearFsrsRuntimeState（不写权重/最大间隔）
      await saveReviewServiceSettingsFromForm(activePlugin, draft.review)

      // 持久化已成功；立即刷新失败必须可见，不得静默宣称已即时生效
      let toolbarRefreshFailed = false
      try {
        notifyIRSelectionToolbarSettingsChanged(activePlugin)
      } catch (refreshError) {
        toolbarRefreshFailed = true
        console.error(
          "[AI ServiceSettings] 选区工具栏已保存但立即刷新失败:",
          refreshError
        )
        const detail =
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError)
        orca.notify(
          "warn",
          `选区工具栏设置已保存，但未能立即应用（${detail}）。可重开渐进阅读会话或重载插件后再试。`,
          { title: "服务设置" }
        )
      }

      if (!toolbarRefreshFailed) {
        orca.notify("success", "服务设置已保存", { title: "服务设置" })
      } else {
        orca.notify("success", "服务设置已保存（选区工具栏待重载后生效）", {
          title: "服务设置"
        })
      }
      resetAIConnectionTest()
      closeAIServiceSettings()
    } catch (error) {
      console.error("[AI ServiceSettings] 保存失败:", error)
      const message =
        error instanceof Error ? error.message : "保存失败，请重试"
      setServiceSettingsError(message)
      orca.notify("error", message, { title: "服务设置" })
    } finally {
      setServiceSettingsSaving(false)
    }
  }

  const handleFetchModels = async (draft: ServiceSettingsDraft) => {
    modelsAbortRef.current?.abort()
    const controller = new AbortController()
    modelsAbortRef.current = controller
    setIsFetchingModels(true)
    setModelsError(null)
    setStatusMessage(null)
    try {
      const result = await fetchCompatibleModels({
        apiKey: draft.ai.apiKey,
        apiUrl: draft.ai.apiUrl,
        signal: controller.signal
      })
      if (controller.signal.aborted) return
      if (!result.success) {
        setModelsError(result.error)
        setModelOptions([])
        orca.notify("error", result.error, { title: "拉取模型" })
        return
      }
      setModelOptions(result.models)
      setCompatibleModelsCache(activePlugin, result.models, draft.ai.apiUrl)
      setStatusMessage(`已拉取 ${result.models.length} 个模型`)
      orca.notify("success", `已拉取 ${result.models.length} 个模型`, {
        title: "拉取模型"
      })
    } catch (error) {
      if (controller.signal.aborted) return
      const message =
        error instanceof Error ? error.message : "拉取模型失败"
      setModelsError(message)
      console.error("[AI ServiceSettings] 拉取模型失败:", error)
      orca.notify("error", message, { title: "拉取模型" })
    } finally {
      if (modelsAbortRef.current === controller) {
        modelsAbortRef.current = null
      }
      setIsFetchingModels(false)
    }
  }

  const handleTestAI = async (draft: ServiceSettingsDraft) => {
    aiTestAbortRef.current?.abort()
    const controller = new AbortController()
    const fingerprint = createAIConnectionConfigFingerprint(draft.ai)
    aiTestAbortRef.current = controller
    aiTestFingerprintRef.current = fingerprint
    aiTestResultVisibleRef.current = false
    setIsTestingAI(true)
    setStatusMessage(null)
    setServiceSettingsError(null)
    try {
      const result = await testAIConfigWithDetails(
        activePlugin,
        draft.ai,
        controller.signal
      )
      if (
        !isCurrentAIConnectionTestResult(
          controller,
          fingerprint,
          aiTestAbortRef.current,
          aiTestFingerprintRef.current
        )
      ) {
        return
      }
      aiTestResultVisibleRef.current = true
      if (result.success) {
        setStatusMessage(result.message)
        orca.notify("success", result.message, { title: "AI 连接测试" })
      } else {
        setServiceSettingsError(result.message)
        orca.notify("error", result.message, { title: "AI 连接测试失败" })
      }
    } catch (error) {
      if (
        !isCurrentAIConnectionTestResult(
          controller,
          fingerprint,
          aiTestAbortRef.current,
          aiTestFingerprintRef.current
        )
      ) {
        return
      }
      console.error("[AI ServiceSettings] 测试失败:", error)
      const message =
        error instanceof Error ? error.message : "测试失败"
      aiTestResultVisibleRef.current = true
      setServiceSettingsError(message)
      orca.notify("error", message, { title: "AI 连接测试" })
    } finally {
      if (aiTestAbortRef.current === controller) {
        aiTestAbortRef.current = null
        setIsTestingAI(false)
      }
    }
  }

  const handleAIConnectionChange = (settings: AIConnectionConfigSnapshot) => {
    const fingerprint = createAIConnectionConfigFingerprint(settings)
    if (aiTestFingerprintRef.current === fingerprint) return

    aiTestFingerprintRef.current = fingerprint
    aiTestAbortRef.current?.abort()
    aiTestAbortRef.current = null
    setIsTestingAI(false)
    if (aiTestResultVisibleRef.current) {
      aiTestResultVisibleRef.current = false
      setStatusMessage(null)
      setServiceSettingsError(null)
    }
  }

  const handleTestTts = async (draft: ServiceSettingsDraft) => {
    ttsTestAbortRef.current?.abort()
    const controller = new AbortController()
    ttsTestAbortRef.current = controller
    setIsTestingTts(true)
    setStatusMessage(null)
    setServiceSettingsError(null)

    const cleaned = normalizeTtsSettings(draft.tts)
    const previous = getTtsSettings(activePlugin)
    // 试听用草稿，不落盘；finally 恢复缓存
    setTtsSettingsCache(activePlugin, cleaned)

    try {
      if (!cleaned.apiKey) {
        const message = "请先填写 Azure TTS API Key"
        setServiceSettingsError(message)
        orca.notify("error", message, { title: "TTS 试听" })
        return
      }
      const result = await synthesizeSpeech({
        settings: cleaned,
        text: TTS_PREVIEW_TEXT,
        signal: controller.signal
      })
      if (controller.signal.aborted) return

      // 生成 blob URL 试听（不写入仓库 assets）
      const blob = new Blob([result.audio], {
        type: result.contentType || "audio/mpeg"
      })
      const url = URL.createObjectURL(blob)
      try {
        await playTtsAudio({ playUrl: url })
      } finally {
        // 延迟 revoke，避免播放中途失效
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }

      const message = `TTS 试听成功（${result.byteLength} 字节，${cleaned.voice}）`
      setStatusMessage(message)
      orca.notify("success", message, { title: "TTS 试听" })
    } catch (error) {
      if (controller.signal.aborted) return
      const raw =
        error instanceof Error ? error.message : "TTS 试听失败"
      const message = sanitizePublicError(raw, cleaned.apiKey)
      console.error("[AI ServiceSettings] TTS 试听失败:", message)
      setServiceSettingsError(message)
      orca.notify("error", message, { title: "TTS 试听失败" })
    } finally {
      setTtsSettingsCache(activePlugin, previous)
      if (ttsTestAbortRef.current === controller) {
        ttsTestAbortRef.current = null
      }
      setIsTestingTts(false)
    }
  }

  return (
    <AIServiceSettingsDialog
      visible={snap.isOpen}
      isLoading={snap.isLoading}
      isSaving={snap.isSaving}
      errorMessage={snap.errorMessage}
      formKey={formKey}
      initialAI={snap.initialAI as AISettings}
      initialFirecrawl={snap.initialFirecrawl as WebImportSettings}
      initialQuickCard={snap.initialQuickCard as QuickCardPrefs}
      initialChapterQuiz={snap.initialChapterQuiz as ChapterQuizPrefs}
      initialIRSelectionToolbar={
        snap.initialIRSelectionToolbar as IRSelectionToolbarSettings
      }
      initialTts={snap.initialTts as TtsSettings}
      initialReview={snap.initialReview as ReviewServiceSettingsDraft}
      reviewLoadWarning={snap.reviewLoadWarning}
      modelOptions={modelOptions}
      isFetchingModels={isFetchingModels}
      isTestingAI={isTestingAI}
      isTestingTts={isTestingTts}
      modelsError={modelsError}
      statusMessage={statusMessage}
      onClose={() => {
        resetAIConnectionTest()
        modelsAbortRef.current?.abort()
        ttsTestAbortRef.current?.abort()
        closeAIServiceSettings()
      }}
      onSave={(draft) => {
        void handleSave(draft)
      }}
      onAIConnectionChange={handleAIConnectionChange}
      onTestAI={(draft) => {
        void handleTestAI(draft)
      }}
      onTestTts={(draft) => {
        void handleTestTts(draft)
      }}
      onFetchModels={(draft) => {
        void handleFetchModels(draft)
      }}
    />
  )
}
