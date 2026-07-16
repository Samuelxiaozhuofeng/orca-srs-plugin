/**
 * AI 闪卡弹窗状态（Valtio）
 */

import type {
  AICardDraft,
  AICardType,
  MaxCardsOption,
  RejectedDraftItem
} from "./aiDraftTypes"

const { proxy } = window.Valtio

export type AIDialogPhase = "config" | "review"

export interface AIDialogState {
  isOpen: boolean
  phase: AIDialogPhase
  sourceText: string
  sourceBlockId: number | null
  cardType: AICardType
  maxCards: MaxCardsOption
  drafts: AICardDraft[]
  selectedIds: string[]
  rejected: RejectedDraftItem[]
  truncatedCount: number
  errorMessage: string | null
  infoMessage: string | null
  isGenerating: boolean
  isSaving: boolean
}

export const aiDialogState = proxy({
  isOpen: false,
  phase: "config" as AIDialogPhase,
  sourceText: "",
  sourceBlockId: null as number | null,
  cardType: "basic" as AICardType,
  maxCards: 3 as MaxCardsOption,
  drafts: [] as AICardDraft[],
  selectedIds: [] as string[],
  rejected: [] as RejectedDraftItem[],
  truncatedCount: 0,
  errorMessage: null as string | null,
  infoMessage: null as string | null,
  isGenerating: false,
  isSaving: false
}) as AIDialogState

/**
 * Whether the dialog is busy or holds review work that must not be replaced.
 */
export function isAIDialogBusyOrInReview(): boolean {
  return aiDialogState.isOpen
}

/**
 * 打开弹窗并载入源文本（尚未请求 AI）
 */
export function openAIDialog(sourceText: string, sourceBlockId: number): void {
  aiDialogState.sourceText = sourceText
  aiDialogState.sourceBlockId = sourceBlockId
  aiDialogState.phase = "config"
  aiDialogState.cardType = "basic"
  aiDialogState.maxCards = 3
  aiDialogState.drafts = []
  aiDialogState.selectedIds = []
  aiDialogState.rejected = []
  aiDialogState.truncatedCount = 0
  aiDialogState.errorMessage = null
  aiDialogState.infoMessage = null
  aiDialogState.isGenerating = false
  aiDialogState.isSaving = false
  aiDialogState.isOpen = true
}

/**
 * 关闭弹窗；延迟清空字段以免关闭动画期间闪空
 */
export function closeAIDialog(): void {
  aiDialogState.isOpen = false
  aiDialogState.isGenerating = false
  aiDialogState.isSaving = false
  setTimeout(() => {
    if (aiDialogState.isOpen) return
    aiDialogState.phase = "config"
    aiDialogState.sourceText = ""
    aiDialogState.sourceBlockId = null
    aiDialogState.drafts = []
    aiDialogState.selectedIds = []
    aiDialogState.rejected = []
    aiDialogState.truncatedCount = 0
    aiDialogState.errorMessage = null
    aiDialogState.infoMessage = null
  }, 300)
}

export function setDialogError(message: string | null): void {
  aiDialogState.errorMessage = message
}

export function setDialogInfo(message: string | null): void {
  aiDialogState.infoMessage = message
}

export function setGenerating(value: boolean): void {
  aiDialogState.isGenerating = value
}

export function setSaving(value: boolean): void {
  aiDialogState.isSaving = value
}

export function applyGenerationSuccess(
  drafts: AICardDraft[],
  rejected: RejectedDraftItem[],
  truncatedCount: number
): void {
  aiDialogState.drafts = drafts
  aiDialogState.selectedIds = drafts.map(d => d.id)
  aiDialogState.rejected = rejected
  aiDialogState.truncatedCount = truncatedCount
  aiDialogState.phase = "review"
  aiDialogState.errorMessage = null

  if (rejected.length > 0 || truncatedCount > 0) {
    const parts: string[] = []
    if (rejected.length > 0) {
      parts.push(`已过滤 ${rejected.length} 项无效/重复草稿`)
    }
    if (truncatedCount > 0) {
      parts.push(`因上限另有 ${truncatedCount} 张合法草稿未纳入`)
    }
    aiDialogState.infoMessage = parts.join("；")
  } else {
    aiDialogState.infoMessage = null
  }
}

export function updateDraft(id: string, patch: Partial<AICardDraft>): void {
  const index = aiDialogState.drafts.findIndex(d => d.id === id)
  if (index < 0) return
  const current = aiDialogState.drafts[index]
  aiDialogState.drafts[index] = {
    ...current,
    ...patch,
    id: current.id,
    type: current.type
  } as AICardDraft
}

export function removeDraft(id: string): void {
  aiDialogState.drafts = aiDialogState.drafts.filter(d => d.id !== id)
  aiDialogState.selectedIds = aiDialogState.selectedIds.filter(x => x !== id)
}

export function setDraftSelected(id: string, selected: boolean): void {
  const set = new Set(aiDialogState.selectedIds)
  if (selected) set.add(id)
  else set.delete(id)
  aiDialogState.selectedIds = Array.from(set)
}

export function backToConfig(): void {
  aiDialogState.phase = "config"
  aiDialogState.errorMessage = null
}
