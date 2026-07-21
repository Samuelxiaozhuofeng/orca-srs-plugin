/**
 * AI / Firecrawl 服务设置挂载
 */

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
import { fetchCompatibleModels } from "../srs/ai/aiModelsFetch"
import { testAIConfigWithDetails } from "../srs/ai/aiConfigValidator"
import {
  AIServiceSettingsDialog,
  type ServiceSettingsDraft
} from "./AIServiceSettingsDialog"

const { Valtio } = window
const { useSnapshot } = Valtio
const { useState, useRef } = window.React

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
  const modelsAbortRef = useRef<AbortController | null>(null)

  if (!snap.isOpen) return null

  const activePlugin = aiServiceSettingsState.pluginName || pluginName
  const formKey = `${activePlugin}:${snap.isLoading ? "loading" : "ready"}:${snap.initialAI.apiKey.length}:${snap.initialAI.apiUrl}:${snap.initialAI.model}`

  const handleSave = async (draft: ServiceSettingsDraft) => {
    setServiceSettingsSaving(true)
    setServiceSettingsError(null)
    setStatusMessage(null)
    try {
      await saveAISettings(activePlugin, draft.ai)
      await saveWebImportSettings(activePlugin, draft.firecrawl)
      orca.notify("success", "服务设置已保存", { title: "服务设置" })
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
    setIsTestingAI(true)
    setStatusMessage(null)
    setServiceSettingsError(null)
    try {
      const result = await testAIConfigWithDetails(activePlugin, draft.ai)
      if (result.success) {
        setStatusMessage(result.message)
        orca.notify("success", result.message, { title: "AI 连接测试" })
      } else {
        setServiceSettingsError(result.message)
        orca.notify("error", result.message, { title: "AI 连接测试失败" })
      }
    } catch (error) {
      console.error("[AI ServiceSettings] 测试失败:", error)
      const message =
        error instanceof Error ? error.message : "测试失败"
      setServiceSettingsError(message)
      orca.notify("error", message, { title: "AI 连接测试" })
    } finally {
      setIsTestingAI(false)
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
      modelOptions={modelOptions}
      isFetchingModels={isFetchingModels}
      isTestingAI={isTestingAI}
      modelsError={modelsError}
      statusMessage={statusMessage}
      onClose={() => {
        modelsAbortRef.current?.abort()
        closeAIServiceSettings()
      }}
      onSave={(draft) => {
        void handleSave(draft)
      }}
      onTestAI={(draft) => {
        void handleTestAI(draft)
      }}
      onFetchModels={(draft) => {
        void handleFetchModels(draft)
      }}
    />
  )
}
