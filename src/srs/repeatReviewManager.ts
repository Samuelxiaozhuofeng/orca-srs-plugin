/**
 * 重复复习会话管理器（F2-01）
 *
 * 按 sessionId 隔离会话数据。Renderer 通过 retain/release 引用计数共享同一
 * sessionId 的内存载荷：多面板打开同一会话块时，关闭其中一个不得删除另一个
 * 仍在使用的 payload。
 *
 * 创建 payload ≠ retain；仅成功绑定 fixed/repeat 的 Renderer 调用 retain。
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"

/**
 * 重复复习会话接口
 */
export interface RepeatReviewSession {
  /** 与 ReviewSessionDescriptor.sessionId 对齐 */
  sessionId: string
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
  sourceType: "query" | "children"
}

/** 按 sessionId 索引的活跃重复复习载荷（内存；完整断点恢复见 F2-09） */
const sessionsById = new Map<string, RepeatReviewSession>()

/** Renderer 使用者引用计数；仅 retain/release 维护，create 不增加 */
const retainCountById = new Map<string, number>()

/**
 * 创建重复复习会话并与 sessionId 绑定。
 * 不增加 retain 计数；替换同 id 旧载荷时重置计数为 0。
 */
export function createRepeatReviewSession(
  cards: ReviewCard[],
  sourceBlockId: DbId,
  sourceType: "query" | "children",
  sessionId: string
): RepeatReviewSession {
  if (sessionId == null || String(sessionId).trim() === "") {
    throw new Error(
      "createRepeatReviewSession 需要非空 sessionId（与 ReviewSessionDescriptor 对齐）"
    )
  }
  const id = String(sessionId)

  if (sessionsById.has(id)) {
    console.log(
      `[repeatReviewManager] 替换同 sessionId 的重复复习会话: ${id}`
    )
  }

  const originalCards = cards.map((card) => ({ ...card }))

  const session: RepeatReviewSession = {
    sessionId: id,
    cards: [...cards],
    originalCards,
    currentRound: 1,
    totalRounds: 1,
    isRepeatMode: true,
    sourceBlockId,
    sourceType
  }

  sessionsById.set(id, session)
  // 新载荷：引用从 0 起，须由 Renderer 成功绑定后再 retain
  retainCountById.set(id, 0)

  console.log(
    `[repeatReviewManager] 创建重复复习会话 sessionId=${id}, 卡片数: ${cards.length}, 来源: ${sourceType}, 块ID: ${sourceBlockId}`
  )

  return session
}

/**
 * Renderer 成功绑定 fixed/repeat 描述后调用一次。
 * 无对应 payload 时抛错（不得静默）。
 */
export function retainRepeatReviewSession(sessionId: string): void {
  const id = String(sessionId)
  if (!sessionsById.has(id)) {
    throw new Error(
      `retainRepeatReviewSession: 无 sessionId=${id} 的载荷，无法 retain`
    )
  }
  const next = (retainCountById.get(id) ?? 0) + 1
  retainCountById.set(id, next)
  console.log(
    `[repeatReviewManager] retain sessionId=${id} count=${next}`
  )
}

/**
 * Renderer effect cleanup / 换代释放时调用一次。
 * 仅当引用降为 0 时删除 payload。
 * 重复 release（计数已 0）只 warn，不负计数、不误删新会话。
 */
export function releaseRepeatReviewSession(sessionId: string): void {
  const id = String(sessionId)
  const current = retainCountById.get(id) ?? 0
  if (current <= 0) {
    console.warn(
      `[repeatReviewManager] release 时引用已为 0，忽略 sessionId=${id}（不负计数、不误删）`
    )
    return
  }
  if (current === 1) {
    retainCountById.delete(id)
    const existed = sessionsById.delete(id)
    console.log(
      `[repeatReviewManager] release 至 0，删除载荷 sessionId=${id} existed=${existed}`
    )
    return
  }
  const next = current - 1
  retainCountById.set(id, next)
  console.log(
    `[repeatReviewManager] release sessionId=${id} count=${next}`
  )
}

/** 当前 retain 计数（测试/诊断） */
export function getRepeatReviewRetainCount(sessionId: string): number {
  return retainCountById.get(String(sessionId)) ?? 0
}

/**
 * 重置当前轮次（再复习一轮）
 */
export function resetCurrentRound(
  session: RepeatReviewSession
): RepeatReviewSession {
  const resetCards = session.originalCards.map((card) => ({ ...card }))

  const updatedSession: RepeatReviewSession = {
    ...session,
    cards: resetCards,
    currentRound: session.currentRound + 1,
    totalRounds: session.totalRounds + 1
  }

  if (session.sessionId) {
    sessionsById.set(session.sessionId, updatedSession)
  }

  return updatedSession
}

/**
 * 按 sessionId 获取重复复习会话（推荐）
 */
export function getRepeatReviewSessionById(
  sessionId: string
): RepeatReviewSession | null {
  if (sessionId == null || sessionId === "") {
    return null
  }
  return sessionsById.get(String(sessionId)) ?? null
}

/**
 * @deprecated 使用 getRepeatReviewSessionById(sessionId)。
 */
export function getRepeatReviewSession(): RepeatReviewSession | null {
  console.warn(
    "[repeatReviewManager] getRepeatReviewSession() 已废弃：请使用 getRepeatReviewSessionById(sessionId)"
  )
  return null
}

/**
 * 强制清除指定 sessionId（无视引用计数）。
 * Renderer 生命周期应使用 releaseRepeatReviewSession，避免多面板误删。
 * 未传 sessionId 时不清空全部。
 */
export function clearRepeatReviewSession(sessionId?: string): void {
  if (sessionId == null || sessionId === "") {
    console.warn(
      "[repeatReviewManager] clearRepeatReviewSession 未提供 sessionId，已忽略（不会清空其他会话）"
    )
    return
  }
  const id = String(sessionId)
  sessionsById.delete(id)
  retainCountById.delete(id)
  console.log(
    `[repeatReviewManager] 强制清除重复复习会话 sessionId=${id}`
  )
}

/**
 * 测试辅助：清空全部内存会话与引用计数
 */
export function clearAllRepeatReviewSessionsForTests(): void {
  sessionsById.clear()
  retainCountById.clear()
}

/**
 * 是否存在指定 sessionId 的会话；无参时表示是否有任意活跃会话。
 */
export function hasActiveRepeatSession(sessionId?: string): boolean {
  if (sessionId != null && sessionId !== "") {
    return sessionsById.has(String(sessionId))
  }
  return sessionsById.size > 0
}

/** 当前内存中会话数量（测试/诊断） */
export function getActiveRepeatSessionCount(): number {
  return sessionsById.size
}
