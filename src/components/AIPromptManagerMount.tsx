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
import { AIPromptManagerDialog } from "./AIPromptManagerDialog"

const { Valtio } = window
const { useSnapshot } = Valtio

interface AIPromptManagerMountProps {
  pluginName: string
}

function itemsToPayload(
  items: readonly {
    label: string
    prompt: string
    includeBlockContext: boolean
    insertBelowOnComplete: boolean
  }[]
): ToolbarAIPromptItem[] {
  return items.map((i) => ({
    label: i.label,
    prompt: i.prompt,
    includeBlockContext: i.includeBlockContext,
    insertBelowOnComplete: i.insertBelowOnComplete
  }))
}

export function AIPromptManagerMount({ pluginName }: AIPromptManagerMountProps) {
  const snap = useSnapshot(aiPromptManagerState)

  if (!snap.isOpen) return null

  const activePlugin = aiPromptManagerState.pluginName || pluginName

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
      errorMessage={snap.errorMessage}
      isSaving={snap.isSaving}
      isLoadingItems={snap.isLoadingItems}
      onClose={() => {
        closeAIPromptManager()
      }}
      onCreate={enterCreateMode}
      onEdit={enterEditMode}
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
    />
  )
}
