/**
 * AI 智能制卡弹窗状态管理
 * 
 * 使用 Valtio 管理弹窗的显示/隐藏状态和数据
 */

import type { KnowledgePoint } from "./aiKnowledgeExtractor"

const { proxy } = window.Valtio

export interface AIDialogState {
  isOpen: boolean
  knowledgePoints: KnowledgePoint[]
  originalContent: string
  sourceBlockId: number | null
}

// 创建响应式状态
export const aiDialogState = proxy({
  isOpen: false,
  knowledgePoints: [] as KnowledgePoint[],
  originalContent: "",
  sourceBlockId: null as number | null
}) as AIDialogState

/**
 * 打开 AI 智能制卡弹窗
 */
export function openAIDialog(
  knowledgePoints: KnowledgePoint[],
  originalContent: string,
  sourceBlockId: number
) {
  aiDialogState.knowledgePoints = knowledgePoints
  aiDialogState.originalContent = originalContent
  aiDialogState.sourceBlockId = sourceBlockId
  aiDialogState.isOpen = true
}

/**
 * 关闭 AI 智能制卡弹窗
 */
export function closeAIDialog() {
  aiDialogState.isOpen = false
  // 延迟清理数据，避免关闭动画期间数据消失
  setTimeout(() => {
    aiDialogState.knowledgePoints = []
    aiDialogState.originalContent = ""
    aiDialogState.sourceBlockId = null
  }, 300)
}
