/**
 * AI 提示词库：Headbar 挂载 + 增删改 / 恢复默认
 */

import {
  aiPromptManagerState,
  applyManagerItems,
  backToListMode,
  closeAIPromptManager,
  enterCreateMode,
  enterEditMode,
  setManagerError,
  setManagerSaving
} from "../srs/ai/aiPromptManagerState"
import {
  resetToolbarAIPromptsToDefault,
  saveToolbarAIPrompts,
  type ToolbarAIPromptItem
} from "../srs/ai/aiToolbarPromptStore"
import {
  getAISettings,
  hydrateAISettings
} from "../srs/ai/aiSettingsSchema"
import { fetchCompatibleModels } from "../srs/ai/aiModelsFetch"
import {
  getCompatibleModelsCache,
  setCompatibleModelsCache
} from "../srs/ai/aiModelsCache"
import { AIPromptManagerDialog } from "./AIPromptManagerDialog"

const { Valtio } = window
const { useSnapshot } = Valtio
const { useState, useEffect, useRef, useCallback } = window.React

interface AIPromptManagerMountProps {
  pluginName: string
}

function itemsToPayload(
  items: readonly {
    label: string
    prompt: string
    includeBlockContext: boolean
    insertBelowOnComplete: boolean
    model?: string
  }[]
): ToolbarAIPromptItem[] {
  return items.map((i) => ({
    label: i.label,
    prompt: i.prompt,
    includeBlockContext: i.includeBlockContext,
    insertBelowOnComplete: i.insertBelowOnComplete,
    model: typeof i.model === "string" ? i.model.trim() : ""
  }))
}

export function AIPromptManagerMount({ pluginName }: AIPromptManagerMountProps) {
  const snap = useSnapshot(aiPromptManagerState)
  const [defaultServiceModel, setDefaultServiceModel] = useState("")
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const modelsAbortRef = useRef<AbortController | null>(null)
  const autoFetchedForOpenRef = useRef(false)

  const activePlugin = aiPromptManagerState.pluginName || pluginName

  const loadDefaultModelAndCache = useCallback(async (): Promise<void> => {
    try {
      const ai = await hydrateAISettings(activePlugin)
      setDefaultServiceModel(ai.model)
      const cached = getCompatibleModelsCache(activePlugin, ai.apiUrl)
      if (cached && cached.length > 0) {
        setModelOptions(cached)
      }
    } catch (error) {
      console.warn("[AI PromptManager] 读取服务设置模型失败:", error)
      const sync = getAISettings(activePlugin)
      setDefaultServiceModel(sync.model)
    }
  }, [activePlugin])

  const fetchModels = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      modelsAbortRef.current?.abort()
      const controller = new AbortController()
      modelsAbortRef.current = controller
      setIsFetchingModels(true)
      if (!opts?.silent) setModelsError(null)

      try {
        const ai = await hydrateAISettings(activePlugin)
        setDefaultServiceModel(ai.model)
        const result = await fetchCompatibleModels({
          apiKey: ai.apiKey,
          apiUrl: ai.apiUrl,
          signal: controller.signal
        })
        if (controller.signal.aborted) return
        if (!result.success) {
          setModelsError(result.error)
          if (!opts?.silent) {
            orca.notify("error", result.error, { title: "拉取模型" })
          }
          return
        }
        setModelOptions(result.models)
        setCompatibleModelsCache(activePlugin, result.models, ai.apiUrl)
        setModelsError(null)
      } catch (error) {
        if (controller.signal.aborted) return
        const message =
          error instanceof Error ? error.message : "拉取模型失败"
        setModelsError(message)
        console.error("[AI PromptManager] 拉取模型失败:", error)
        if (!opts?.silent) {
          orca.notify("error", message, { title: "拉取模型" })
        }
      } finally {
        if (modelsAbortRef.current === controller) {
          modelsAbortRef.current = null
        }
        setIsFetchingModels(false)
      }
    },
    [activePlugin]
  )

  // 打开面板时：同步默认 model + 缓存列表；无缓存则静默拉一次
  useEffect(() => {
    if (!snap.isOpen) {
      autoFetchedForOpenRef.current = false
      return
    }
    if (autoFetchedForOpenRef.current) return
    autoFetchedForOpenRef.current = true
    void (async () => {
      await loadDefaultModelAndCache()
      const ai = getAISettings(activePlugin)
      const cached = getCompatibleModelsCache(activePlugin, ai.apiUrl)
      if (!cached || cached.length === 0) {
        await fetchModels({ silent: true })
      }
    })()
  }, [snap.isOpen, activePlugin, loadDefaultModelAndCache, fetchModels])

  useEffect(() => {
    return () => {
      modelsAbortRef.current?.abort()
    }
  }, [])

  if (!snap.isOpen) return null

  const persist = async (next: ToolbarAIPromptItem[]): Promise<boolean> => {
    setManagerSaving(true)
    setManagerError(null)
    try {
      const saved = await saveToolbarAIPrompts(activePlugin, next)
      applyManagerItems(saved)
      return true
    } catch (error) {
      console.error("[AI PromptManager] 保存失败:", error)
      const message =
        error instanceof Error ? error.message : "保存失败，请重试"
      setManagerError(message)
      orca.notify("error", message, { title: "AI 提示词库" })
      return false
    } finally {
      setManagerSaving(false)
    }
  }

  const handleSaveDraft = async (entry: ToolbarAIPromptItem) => {
    if (!entry.label.trim()) {
      setManagerError("请填写名称")
      return
    }
    if (!entry.prompt.trim()) {
      setManagerError("请填写提示词")
      return
    }

    const base = itemsToPayload(aiPromptManagerState.items)
    const mode = aiPromptManagerState.mode
    const editIndex = aiPromptManagerState.editIndex

    let next: ToolbarAIPromptItem[]
    if (mode === "create") {
      next = [...base, entry]
    } else if (mode === "edit" && editIndex != null && editIndex >= 0) {
      next = base.map((item, i) => (i === editIndex ? entry : item))
    } else {
      setManagerError("无效的编辑状态")
      return
    }

    await persist(next)
  }

  const handleDelete = async (index: number) => {
    const item = aiPromptManagerState.items[index]
    if (!item) return
    const ok = window.confirm(`确定删除「${item.label}」？`)
    if (!ok) return

    const next = itemsToPayload(aiPromptManagerState.items).filter(
      (_, i) => i !== index
    )
    await persist(next)
  }

  const handleMove = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    const next = itemsToPayload(aiPromptManagerState.items)
    if (index < 0 || index >= next.length) return
    if (nextIndex < 0 || nextIndex >= next.length) return

    const [moved] = next.splice(index, 1)
    if (!moved) return
    next.splice(nextIndex, 0, moved)
    await persist(next)
  }

  const handleResetDefaults = async () => {
    const ok = window.confirm(
      "确定恢复为默认三项提示词？当前列表将被覆盖。"
    )
    if (!ok) return

    setManagerSaving(true)
    setManagerError(null)
    try {
      const saved = await resetToolbarAIPromptsToDefault(activePlugin)
      applyManagerItems(saved)
      orca.notify("success", "已恢复默认提示词", { title: "AI 提示词库" })
    } catch (error) {
      console.error("[AI PromptManager] 恢复默认失败:", error)
      const message =
        error instanceof Error ? error.message : "恢复默认失败，请重试"
      setManagerError(message)
      orca.notify("error", message, { title: "AI 提示词库" })
    } finally {
      setManagerSaving(false)
    }
  }

  return (
    <AIPromptManagerDialog
      visible={snap.isOpen}
      mode={snap.mode}
      editIndex={snap.editIndex}
      items={snap.items}
      initialLabel={snap.draftLabel}
      initialPrompt={snap.draftPrompt}
      initialIncludeBlockContext={snap.draftIncludeBlockContext}
      initialInsertBelowOnComplete={snap.draftInsertBelowOnComplete}
      initialModel={snap.draftModel}
      defaultServiceModel={defaultServiceModel}
      modelOptions={modelOptions}
      isFetchingModels={isFetchingModels}
      modelsError={modelsError}
      errorMessage={snap.errorMessage}
      isSaving={snap.isSaving}
      isLoadingItems={snap.isLoadingItems}
      onClose={() => {
        modelsAbortRef.current?.abort()
        closeAIPromptManager()
      }}
      onCreate={enterCreateMode}
      onEdit={enterEditMode}
      onMove={(index, direction) => {
        void handleMove(index, direction)
      }}
      onDelete={(index) => {
        void handleDelete(index)
      }}
      onResetDefaults={() => {
        void handleResetDefaults()
      }}
      onSaveDraft={(entry) => {
        void handleSaveDraft(entry)
      }}
      onCancelDraft={backToListMode}
      onRefreshModels={() => {
        void fetchModels({ silent: false })
      }}
    />
  )
}
