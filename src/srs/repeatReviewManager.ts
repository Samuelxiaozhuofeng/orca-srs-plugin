/**
 * 重复复习会话管理器
 * 
 * 管理重复复习模式的会话状态
 * 允许用户在同一会话中多次复习卡片，不受常规复习队列的到期时间限制
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"

/**
 * 重复复习会话接口
 */
export interface RepeatReviewSession {
  /** 当前复习队列中的卡片 */
  cards: ReviewCard[]
  /** 原始卡片列表（用于重置） */
  originalCards: ReviewCard[]
  /** 当前轮次（从 1 开始） */
  currentRound: number
  /** 总轮次数 */
  totalRounds: number
  /** 是否为重复复习模式 */
  isRepeatMode: true
  /** 来源块 ID */
  sourceBlockId: DbId
  /** 来源类型：查询块或子块 */
  sourceType: 'query' | 'children'
}

/** 当前活跃的重复复习会话 */
let currentSession: RepeatReviewSession | null = null

/**
 * 创建重复复习会话
 * 
 * @param cards - 要复习的卡片列表
 * @param sourceBlockId - 来源块 ID
 * @param sourceType - 来源类型（'query' 或 'children'）
 * @returns 新创建的重复复习会话
 */
export function createRepeatReviewSession(
  cards: ReviewCard[],
  sourceBlockId: DbId,
  sourceType: 'query' | 'children'
): RepeatReviewSession {
  // 先清理旧会话（如果存在）
  if (currentSession !== null) {
    console.log(`[repeatReviewManager] 清理旧的重复复习会话，来源块ID: ${currentSession.sourceBlockId}`)
    currentSession = null
  }
  
  // 深拷贝卡片列表作为原始卡片
  const originalCards = cards.map(card => ({ ...card }))
  
  const session: RepeatReviewSession = {
    cards: [...cards],
    originalCards,
    currentRound: 1,
    totalRounds: 1,
    isRepeatMode: true,
    sourceBlockId,
    sourceType
  }
  
  // 保存为当前会话
  currentSession = session
  
  console.log(`[repeatReviewManager] 创建重复复习会话，卡片数: ${cards.length}, 来源: ${sourceType}, 块ID: ${sourceBlockId}`)
  
  return session
}

/**
 * 重置当前轮次（再复习一轮）
 * 
 * 将卡片队列重置为原始卡片列表，并增加轮次计数
 * 
 * @param session - 当前重复复习会话
 * @returns 重置后的会话
 */
export function resetCurrentRound(session: RepeatReviewSession): RepeatReviewSession {
  // 深拷贝原始卡片列表
  const resetCards = session.originalCards.map(card => ({ ...card }))
  
  const updatedSession: RepeatReviewSession = {
    ...session,
    cards: resetCards,
    currentRound: session.currentRound + 1,
    totalRounds: session.totalRounds + 1
  }
  
  // 更新当前会话
  currentSession = updatedSession
  
  return updatedSession
}

/**
 * 获取当前重复复习会话
 * 
 * @returns 当前会话，如果没有则返回 null
 */
export function getRepeatReviewSession(): RepeatReviewSession | null {
  console.log(`[repeatReviewManager] 获取重复复习会话，当前会话: ${currentSession ? `存在，卡片数 ${currentSession.cards.length}` : '不存在'}`)
  return currentSession
}

/**
 * 清除当前重复复习会话
 */
export function clearRepeatReviewSession(): void {
  console.log(`[repeatReviewManager] 清除重复复习会话`)
  currentSession = null
}

/**
 * 检查是否有活跃的重复复习会话
 * 
 * @returns 是否有活跃会话
 */
export function hasActiveRepeatSession(): boolean {
  return currentSession !== null
}
