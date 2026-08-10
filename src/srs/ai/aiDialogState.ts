/**
 * AI 闪卡弹窗状态（Valtio）
 */

import {
  type AICardDraft,
  type AICardLanguage,
  type AICardType,
  type AIDetailLevel,
  type RejectedDraftItem,
  DEFAULT_AI_CARD_LANGUAGE,
  DEFAULT_AI_DETAIL_LEVEL
} from "./aiDraftTypes"

const { proxy } = window.Valtio

export type AIDialogPhase = "config" | "review"

export interface AIDialogState {
  isOpen: boolean
  phase: AIDialogPhase
  sourceText: string
  sourceBlockId: number | null
  cardTypes: AICardType[]
  detailLevel: AIDetailLevel
  cardLanguage: AICardLanguage
  customInstruction: string
  /** 保存时把卡片写成待激活，不立即排期 */
  startPending: boolean
  drafts: AICardDraft[]
  selectedIds: string[]
  rejected: RejectedDraftItem[]
  truncatedCount: number
  errorMessage: string | null
  /** 当前错误是否允许显式切换到连接设置。 */
  canOpenConnectionSettings: boolean
  infoMessage: string | null
  isGenerating: boolean
  isSaving: boolean
  /** 「再生成一批」进行中；与首次生成区分，UI 不清空已有草稿 */
  isGeneratingMore: boolean
}

export const aiDialogState = proxy({
  isOpen: false,
  phase: "config" as AIDialogPhase,
  sourceText: "",
  sourceBlockId: null as number | null,
  cardTypes: ["basic"] as AICardType[],
  detailLevel: DEFAULT_AI_DETAIL_LEVEL as AIDetailLevel,
  cardLanguage: DEFAULT_AI_CARD_LANGUAGE as AICardLanguage,
  customInstruction: "",
  startPending: false,
  drafts: [] as AICardDraft[],
  selectedIds: [] as string[],
  rejected: [] as RejectedDraftItem[],
  truncatedCount: 0,
  errorMessage: null as string | null,
  canOpenConnectionSettings: false,
  infoMessage: null as string | null,
  isGenerating: false,
  isSaving: false,
  isGeneratingMore: false
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
  aiDialogState.cardTypes = ["basic"]
  aiDialogState.detailLevel = DEFAULT_AI_DETAIL_LEVEL
  aiDialogState.cardLanguage = DEFAULT_AI_CARD_LANGUAGE
  aiDialogState.customInstruction = ""
  aiDialogState.startPending = false
  aiDialogState.drafts = []
  aiDialogState.selectedIds = []
  aiDialogState.rejected = []
  aiDialogState.truncatedCount = 0
  aiDialogState.errorMessage = null
  aiDialogState.canOpenConnectionSettings = false
  aiDialogState.infoMessage = null
  aiDialogState.isGenerating = false
  aiDialogState.isGeneratingMore = false
  aiDialogState.isSaving = false
  aiDialogState.isOpen = true
}

/**
 * 关闭弹窗；延迟清空字段以免关闭动画期间闪空
 */
export function closeAIDialog(): void {
  aiDialogState.isOpen = false
  aiDialogState.isGenerating = false
  aiDialogState.isGeneratingMore = false
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
    aiDialogState.canOpenConnectionSettings = false
    aiDialogState.infoMessage = null
  }, 300)
}

export function setDialogError(
  message: string | null,
  canOpenConnectionSettings = false
): void {
  aiDialogState.errorMessage = message
  aiDialogState.canOpenConnectionSettings =
    message != null && canOpenConnectionSettings
}

export function setDialogInfo(message: string | null): void {
  aiDialogState.infoMessage = message
}

export function setGenerating(value: boolean): void {
  aiDialogState.isGenerating = value
  if (value) aiDialogState.canOpenConnectionSettings = false
}

export function setGeneratingMore(value: boolean): void {
  aiDialogState.isGeneratingMore = value
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
  aiDialogState.canOpenConnectionSettings = false

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
  aiDialogState.canOpenConnectionSettings = false
}

/**
 * 取草稿的去重/排除线索。
 * basic 用题干，cloze 用挖空目标 + 上下文首段。
 */
export function draftExclusionSummary(draft: AICardDraft): string {
  if (draft.type === "basic" || draft.type === "choice") return draft.question
  return `${draft.clozeText}（出自：${draft.text.slice(0, 60)}）`
}

function normalizeForDedupe(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * 追加「再生成一批」的结果。
 *
 * 两件必须做的事：
 * 1. **重新分配 id**：草稿 id 由本地按批次分配（draft_1…），
 *    直接 concat 会与上一批撞号，导致勾选/编辑串卡。
 * 2. **跨批去重**：prompt 里给了排除清单也只是软约束，模型仍可能重复，
 *    重复项计入 rejected 让用户看得见，而不是静默丢弃。
 */
export function appendGenerationSuccess(
  incoming: AICardDraft[],
  rejected: RejectedDraftItem[],
  truncatedCount: number
): { added: number; duplicates: number } {
  const existing = aiDialogState.drafts as AICardDraft[]
  const seen = new Set(
    existing.map((d) => normalizeForDedupe(draftExclusionSummary(d)))
  )

  // 不能用 existing.length 起编号：用户删掉中间某张后再追加会与幸存卡撞号，
  // 造成编辑串卡、removeDraft 一次删两张。改为取现有最大序号继续往上排。
  let nextIndex = existing.reduce((max, draft) => {
    const parsed = /^draft_(\d+)$/.exec(draft.id)
    if (!parsed) return max
    return Math.max(max, Number(parsed[1]))
  }, 0)
  const added: AICardDraft[] = []
  let duplicates = 0

  for (const draft of incoming) {
    const key = normalizeForDedupe(draftExclusionSummary(draft))
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    nextIndex += 1
    added.push({ ...draft, id: `draft_${nextIndex}` } as AICardDraft)
  }

  aiDialogState.drafts = [...existing, ...added]
  aiDialogState.selectedIds = [
    ...aiDialogState.selectedIds,
    ...added.map((d) => d.id)
  ]
  aiDialogState.rejected = [...aiDialogState.rejected, ...rejected]
  aiDialogState.truncatedCount += truncatedCount
  aiDialogState.errorMessage = null
  aiDialogState.canOpenConnectionSettings = false

  const parts: string[] = []
  parts.push(added.length > 0 ? `新增 ${added.length} 张` : "没有新增卡片")
  if (duplicates > 0) parts.push(`跳过 ${duplicates} 张与已有重复`)
  if (rejected.length > 0) parts.push(`过滤 ${rejected.length} 项无效草稿`)
  if (truncatedCount > 0) parts.push(`另有 ${truncatedCount} 张因上限未纳入`)
  aiDialogState.infoMessage = parts.join("；")

  return { added: added.length, duplicates }
}

/**
 * 切换某个卡型的启用状态。
 * 至少保留一种：全部关掉会让「生成」变成必然失败的空请求。
 */
export function toggleCardType(type: AICardType): void {
  const current = aiDialogState.cardTypes as AICardType[]
  if (current.includes(type)) {
    if (current.length === 1) return
    aiDialogState.cardTypes = current.filter((t) => t !== type)
    return
  }
  aiDialogState.cardTypes = [...current, type]
}
