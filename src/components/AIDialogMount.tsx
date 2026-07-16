/**
 * AI 闪卡弹窗挂载：Headbar 特洛伊木马 + 生成 / 保存编排
 *
 * Generation uses a request-token guard so cancelled/stale responses
 * cannot overwrite a newer request's state.
 */

import {
  aiDialogState,
  closeAIDialog,
  applyGenerationSuccess,
  setDialogError,
  setDialogInfo,
  setGenerating,
  setSaving,
  updateDraft,
  removeDraft,
  setDraftSelected,
  backToConfig
} from "../srs/ai/aiDialogState"
import { AICardGenerationDialog } from "./AICardGenerationDialog"
import { generateFlashcardDrafts } from "../srs/ai/aiService"
import { writeAICardDrafts } from "../srs/ai/aiCardWriter"
import { createRequestTokenGuard } from "../srs/ai/aiRequestToken"
import type { AICardDraft, AICardType, MaxCardsOption } from "../srs/ai/aiDraftTypes"
import { validateEditableDraft } from "../srs/ai/aiDraftParseValidate"

const { Valtio } = window
const { useSnapshot } = Valtio
const { useRef } = window.React

interface AIDialogMountProps {
  pluginName: string
}

export function AIDialogMount({ pluginName }: AIDialogMountProps) {
  const snap = useSnapshot(aiDialogState)
  const abortRef = useRef<AbortController | null>(null)
  const tokenGuardRef = useRef(createRequestTokenGuard())

  const handleGenerate = async () => {
    if (!snap.sourceBlockId || !snap.sourceText.trim()) {
      setDialogError("缺少源文本，请关闭后重试")
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const token = tokenGuardRef.current.next()

    setGenerating(true)
    setDialogError(null)
    setDialogInfo(null)

    try {
      const result = await generateFlashcardDrafts({
        pluginName,
        sourceText: snap.sourceText,
        cardType: snap.cardType,
        maxCards: snap.maxCards,
        signal: controller.signal
      })

      if (!tokenGuardRef.current.isCurrent(token)) {
        return
      }

      if (controller.signal.aborted) {
        setDialogInfo("已取消生成")
        return
      }

      if (!result.success) {
        if (result.error.code === "CANCELLED") {
          setDialogInfo(result.error.message)
          return
        }
        setDialogError(result.error.message)
        orca.notify("error", result.error.message, { title: "AI 生成闪卡" })
        return
      }

      applyGenerationSuccess(
        result.cards,
        result.rejected,
        result.truncatedCount
      )
    } catch (error) {
      if (!tokenGuardRef.current.isCurrent(token)) {
        return
      }
      const message =
        error instanceof Error ? error.message : "生成失败，请重试"
      setDialogError(message)
      orca.notify("error", message, { title: "AI 生成闪卡" })
    } finally {
      if (tokenGuardRef.current.isCurrent(token)) {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setGenerating(false)
      }
    }
  }

  const handleCancelGenerate = () => {
    tokenGuardRef.current.invalidate()
    abortRef.current?.abort()
    abortRef.current = null
    setDialogInfo("已取消生成")
    setGenerating(false)
  }

  const handleSave = async () => {
    if (!snap.sourceBlockId) {
      setDialogError("源块丢失，无法保存")
      return
    }

    const sourceText = aiDialogState.sourceText
    const selected = (aiDialogState.drafts as AICardDraft[]).filter(d =>
      aiDialogState.selectedIds.includes(d.id)
    )

    if (selected.length === 0) {
      setDialogError("请至少选择一张卡片")
      return
    }

    const invalid = selected
      .map(d => ({ id: d.id, err: validateEditableDraft(d, sourceText) }))
      .filter(x => x.err != null)

    if (invalid.length > 0) {
      setDialogError(
        `有 ${invalid.length} 张已选草稿未通过校验，请修正后再保存`
      )
      return
    }

    setSaving(true)
    setDialogError(null)

    try {
      const result = await writeAICardDrafts({
        pluginName,
        sourceBlockId: snap.sourceBlockId,
        drafts: selected
      })

      if (!result.success) {
        let msg = result.error.message
        if (result.orphanBlockIds && result.orphanBlockIds.length > 0) {
          msg += `\n\n残留块 ID（请手动检查并删除）: ${result.orphanBlockIds.join(", ")}`
        }
        setDialogError(msg)
        orca.notify("error", msg, { title: "AI 生成闪卡" })
        return
      }

      orca.notify("success", `已保存 ${result.createdBlockIds.length} 张卡片`, {
        title: "AI 生成闪卡"
      })
      closeAIDialog()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存失败"
      setDialogError(message)
      orca.notify("error", message, { title: "AI 生成闪卡" })
    } finally {
      setSaving(false)
    }
  }

  if (!snap.isOpen) return null

  return (
    <AICardGenerationDialog
      visible={snap.isOpen}
      phase={snap.phase}
      sourceText={snap.sourceText}
      cardType={snap.cardType}
      maxCards={snap.maxCards}
      drafts={snap.drafts as AICardDraft[]}
      selectedIds={snap.selectedIds as string[]}
      errorMessage={snap.errorMessage}
      infoMessage={snap.infoMessage}
      isGenerating={snap.isGenerating}
      isSaving={snap.isSaving}
      onClose={() => {
        if (snap.isGenerating) {
          handleCancelGenerate()
        }
        if (!snap.isSaving) {
          closeAIDialog()
        }
      }}
      onCardTypeChange={(type: AICardType) => {
        if (!aiDialogState.isGenerating) {
          aiDialogState.cardType = type
        }
      }}
      onMaxCardsChange={(n: MaxCardsOption) => {
        if (!aiDialogState.isGenerating) {
          aiDialogState.maxCards = n
        }
      }}
      onGenerate={handleGenerate}
      onCancelGenerate={handleCancelGenerate}
      onBack={backToConfig}
      onToggleSelect={setDraftSelected}
      onUpdateDraft={(id, patch) => updateDraft(id, patch)}
      onRemoveDraft={removeDraft}
      onSave={handleSave}
    />
  )
}
