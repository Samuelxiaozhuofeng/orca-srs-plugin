/**
 * 单卡复习评分逻辑（供混合会话与独立复习复用）
 */

import type { Grade, CardState, ReviewCard, ReviewLogEntry } from "./types"
import {
  ensureCardSrsStateWithInitialDue,
  invalidateBlockCache,
  updateSrsState,
  updateClozeSrsState,
  updateDirectionSrsState
} from "./storage"
import { postponeCard, suspendCard } from "./cardStatusUtils"
import { emitCardGraded, emitCardPostponed, emitCardSuspended } from "./srsEvents"
import { saveAndFlushReviewLog, createReviewLogId } from "./reviewLogStorage"
import {
  compatibleCardId,
  identityFieldsForLog,
  identityFromReviewCard
} from "./cardIdentity"
import {
  computeReviewTiming,
  type ReviewTiming
} from "./sessionProgressTracker"

/** 评分成功（含 FC-10 timing；日志失败仍带 timing） */
export type ReviewGradeSuccess = {
  ok: true
  updatedCard: ReviewCard
  logMessage: string
  warning?: string
  /**
   * 与日志同源的一次评分 timing。
   * 日志失败时仍返回，供会话进度使用同一 effectiveDuration。
   */
  timing: ReviewTiming
}

/** 推迟 / 暂停成功（无时长） */
export type ReviewStatusActionSuccess = {
  ok: true
  updatedCard: ReviewCard
  logMessage: string
  warning?: string
}

export type ReviewGradeFailure = {
  ok: false
  error: unknown
}

export type ReviewGradeResult = ReviewGradeSuccess | ReviewGradeFailure
export type ReviewStatusActionResult = ReviewStatusActionSuccess | ReviewGradeFailure

export type GradeReviewCardOptions = {
  /** 独立复习会话会自行展开 List 后续条目，因此只需共享核心评分。 */
  updateListProgression?: boolean
  /**
   * FC-10：注入评分时刻（固定 number 或单次调用的函数）。
   * 只读取一次，同时生成 timestamp / rawDuration / effectiveDuration。
   */
  now?: number | (() => number)
}

function resolveGradeNow(nowOption: GradeReviewCardOptions["now"]): number {
  if (typeof nowOption === "function") {
    return nowOption()
  }
  if (typeof nowOption === "number" && Number.isFinite(nowOption)) {
    return nowOption
  }
  return Date.now()
}

function cardLabel(card: ReviewCard): string {
  if (card.clozeNumber) return ` [c${card.clozeNumber}]`
  if (card.directionType) return ` [${card.directionType === "forward" ? "→" : "←"}]`
  if (card.listItemIndex && card.listItemIds) {
    return ` [L${card.listItemIndex}/${card.listItemIds.length}]`
  }
  return ""
}

function formatSimpleDate(date: Date): string {
  return `${date.getMonth() + 1}-${date.getDate()}`
}

function getTomorrowMidnight(): Date {
  const tomorrow = new Date()
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

async function setListItemDue(itemId: ReviewCard["id"], due: Date): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [itemId],
    [{ name: "srs.due", type: 5, value: due }]
  )
  invalidateBlockCache(itemId)
}

/**
 * 保留现有 List 卡的解锁/推后语义，但混合会话使用固定快照，不追加后续条目。
 */
async function updateListProgression(card: ReviewCard, grade: Grade): Promise<void> {
  if (!card.listItemIds || !card.listItemIndex) return

  const currentIndex = card.listItemIndex - 1
  const tomorrow = getTomorrowMidnight()
  const laterItemIds = card.listItemIds.slice(currentIndex + 1)

  if (grade === "good" || grade === "easy") {
    const nextItemId = laterItemIds[0]
    if (nextItemId == null) return
    await ensureCardSrsStateWithInitialDue(nextItemId, tomorrow)
    await setListItemDue(nextItemId, new Date())
    return
  }

  for (const itemId of laterItemIds) {
    const state = await ensureCardSrsStateWithInitialDue(itemId, tomorrow)
    if (state.due.getTime() < tomorrow.getTime()) {
      await setListItemDue(itemId, tomorrow)
    }
  }
}

/**
 * 对单张复习卡评分并持久化 FSRS 状态（混合会话不追加后续条目到当前队列）
 */
export async function gradeReviewCard(
  card: ReviewCard,
  grade: Grade,
  pluginName: string,
  reviewStartedAt: number,
  options: GradeReviewCardOptions = {}
): Promise<ReviewGradeResult> {
  try {
    const isListCard = !!card.listItemId && !!card.listItemIndex && !!card.listItemIds
    const previousInterval = card.srs.interval
    const previousState: CardState = card.isNew
      ? "new"
      : (card.srs.interval < 1 ? "learning" : "review")

    let result
    if (card.clozeNumber) {
      result = await updateClozeSrsState(card.id, card.clozeNumber, grade, pluginName)
    } else if (card.directionType) {
      result = await updateDirectionSrsState(card.id, card.directionType, grade, pluginName)
    } else if (isListCard) {
      result = await updateSrsState(card.listItemId!, grade, pluginName)
    } else {
      result = await updateSrsState(card.id, grade, pluginName)
    }

    let warning: string | undefined
    if (isListCard && options.updateListProgression !== false) {
      try {
        await updateListProgression(card, grade)
      } catch (error) {
        warning = `当前条目已评分，但后续列表项排期更新失败：${error instanceof Error ? error.message : String(error)}`
        console.error("[SRS Review] List 卡后续排期更新失败:", error)
      }
    }

    const updatedCard: ReviewCard = {
      ...card,
      srs: result.state,
      isNew: false
    }

    const newState: CardState = grade === "again"
      ? "relearning"
      : (result.state.interval < 1 ? "learning" : "review")

    // FC-10：一次评分只读一次 now，timestamp / raw / effective 同源
    const nowMs = resolveGradeNow(options.now)
    const timing = computeReviewTiming(reviewStartedAt, nowMs)
    const identity = identityFromReviewCard(card)
    const identityFields = identityFieldsForLog(identity)
    const logCardId = compatibleCardId(identity)

    const reviewLog: ReviewLogEntry = {
      id: createReviewLogId(timing.timestamp, identityFields.cardKey!),
      cardId: logCardId,
      ...identityFields,
      deckName: card.deck,
      timestamp: timing.timestamp,
      grade,
      /** 有效时长 0..60000 */
      duration: timing.effectiveDuration,
      /** 安全非负原始墙钟；异常为 0 */
      rawDuration: timing.rawDuration,
      previousInterval,
      newInterval: result.state.interval,
      previousState,
      newState
    }

    // 评分路径必须等待本条日志确认落盘；失败不回滚已成功的 FSRS 状态
    try {
      await saveAndFlushReviewLog(pluginName, reviewLog)
    } catch (logError) {
      const logWarning =
        "评分已保存，但统计日志保存失败"
      warning = warning ? `${warning}；${logWarning}` : logWarning
      console.error(
        "[SRS Review] 统计日志保存失败（评分状态已写入，pending 保留待重试）:",
        logError
      )
    }

    emitCardGraded(logCardId, grade, {
      cardKey: identityFields.cardKey,
      identity
    })

    const label = cardLabel(card)
    const logMessage = `评分 ${grade.toUpperCase()}${label} -> 下次 ${formatSimpleDate(result.state.due)}，间隔 ${result.state.interval} 天`

    return {
      ok: true,
      updatedCard,
      logMessage,
      warning,
      // 日志失败仍返回 timing，会话进度可用同一 effectiveDuration
      timing
    }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function postponeReviewCard(card: ReviewCard): Promise<ReviewStatusActionResult> {
  try {
    const postponeBlockId = card.listItemId ?? card.id
    await postponeCard(postponeBlockId, card.clozeNumber, card.directionType)
    emitCardPostponed(postponeBlockId)
    return {
      ok: true,
      updatedCard: card,
      logMessage: `已推迟${cardLabel(card)}，明天再复习`
    }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function suspendReviewCard(card: ReviewCard): Promise<ReviewStatusActionResult> {
  try {
    await suspendCard(card.id)
    emitCardSuspended(card.id)
    return {
      ok: true,
      updatedCard: card,
      logMessage: `已暂停${cardLabel(card)}`
    }
  } catch (error) {
    return { ok: false, error }
  }
}
