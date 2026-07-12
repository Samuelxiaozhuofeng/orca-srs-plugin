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
import { saveReviewLog, createReviewLogId } from "./reviewLogStorage"

export type ReviewGradeSuccess = {
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

export type GradeReviewCardOptions = {
  /** 独立复习会话会自行展开 List 后续条目，因此只需共享核心评分。 */
  updateListProgression?: boolean
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

    const reviewDuration = Date.now() - reviewStartedAt
    const timestamp = Date.now()
    const logCardId = isListCard ? card.listItemId! : card.id

    const reviewLog: ReviewLogEntry = {
      id: createReviewLogId(timestamp, logCardId),
      cardId: logCardId,
      deckName: card.deck,
      timestamp,
      grade,
      duration: reviewDuration,
      previousInterval,
      newInterval: result.state.interval,
      previousState,
      newState
    }

    void saveReviewLog(pluginName, reviewLog)
    emitCardGraded(logCardId, grade)

    const label = cardLabel(card)
    const logMessage = `评分 ${grade.toUpperCase()}${label} -> 下次 ${formatSimpleDate(result.state.due)}，间隔 ${result.state.interval} 天`

    return {
      ok: true,
      updatedCard,
      logMessage,
      warning
    }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function postponeReviewCard(card: ReviewCard): Promise<ReviewGradeResult> {
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

export async function suspendReviewCard(card: ReviewCard): Promise<ReviewGradeResult> {
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
