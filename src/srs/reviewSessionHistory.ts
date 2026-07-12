/**
 * 复习会话历史与只读回看（FC-06）
 *
 * 第一阶段：不做真正撤销。对已执行会改变状态/进度的动作，
 * 返回该卡时只能只读回看，不得再次评分/推迟/暂停，
 * 也不得再次触发 List 推进、日志或会话统计。
 *
 * 规则：
 * - 锁定动作（再次返回只读）：正式评分、重复模式评分、列表辅助预览评分、推迟、暂停
 * - 跳过不锁定：返回被跳过卡片后允许正常评分
 * - 只读判定依赖稳定 cardKey + 永久 outcomes，不依赖当前 index / 对象引用
 * - 导航栈可 pop/push；outcomes 不随返回删除，故继续/再返回不丢只读语义
 */

import type { Grade, ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"

/** 会话历史动作种类 */
export type ReviewHistoryActionKind =
  | "grade"
  | "repeat_grade"
  | "auxiliary_grade"
  | "postpone"
  | "suspend"
  | "skip"

/** 单条会话历史记录（导航 + 展示信息） */
export type ReviewSessionHistoryEntry = {
  /** 稳定身份：cardKeyFromReviewCard / getReviewCardKey */
  cardKey: string
  actionKind: ReviewHistoryActionKind
  /** 评分类动作的 grade */
  grade?: Grade
  /** 动作发生时的队列位置（仅展示/调试，定位优先用 cardKey） */
  originalIndex: number
  /** 如 [c1]、[L1/3] */
  cardLabel?: string
  /** 简短摘要（日志/UI） */
  summary: string
}

/**
 * 会话历史状态
 * - stack：返回上一张用的导航栈
 * - outcomesByKey：锁定动作的永久结果（只读判定来源；不随 previous pop 删除）
 */
export type ReviewSessionHistoryState = {
  readonly stack: readonly ReviewSessionHistoryEntry[]
  readonly outcomesByKey: Readonly<Record<string, ReviewSessionHistoryEntry>>
}

export const READONLY_ACTION_BLOCKED_MESSAGE =
  "当前为只读回看，不能再次评分、推迟或暂停"

export function createEmptyHistory(): ReviewSessionHistoryState {
  return { stack: [], outcomesByKey: {} }
}

/** 会锁定卡片为只读的动作（skip 除外） */
export function isLockingAction(kind: ReviewHistoryActionKind): boolean {
  return kind !== "skip"
}

export function isCardReadOnly(
  cardKey: string,
  state: ReviewSessionHistoryState
): boolean {
  const outcome = state.outcomesByKey[cardKey]
  return outcome != null && isLockingAction(outcome.actionKind)
}

export function getCardOutcome(
  cardKey: string,
  state: ReviewSessionHistoryState
): ReviewSessionHistoryEntry | undefined {
  return state.outcomesByKey[cardKey]
}

export function canGoPrevious(state: ReviewSessionHistoryState): boolean {
  return state.stack.length > 0
}

export function buildHistoryEntry(params: {
  cardKey: string
  actionKind: ReviewHistoryActionKind
  originalIndex: number
  grade?: Grade
  cardLabel?: string
}): ReviewSessionHistoryEntry {
  const { cardKey, actionKind, originalIndex, grade, cardLabel = "" } = params
  let summary: string
  switch (actionKind) {
    case "grade":
      summary = `评分 ${grade?.toUpperCase() ?? "?"}${cardLabel}`
      break
    case "repeat_grade":
      summary = `评分 ${grade?.toUpperCase() ?? "?"}${cardLabel} (专项训练)`
      break
    case "auxiliary_grade":
      summary = `评分 ${grade?.toUpperCase() ?? "?"}${cardLabel}（辅助预览）`
      break
    case "postpone":
      summary = `已推迟${cardLabel}`
      break
    case "suspend":
      summary = `已暂停${cardLabel}`
      break
    case "skip":
      summary = `已跳过${cardLabel}`
      break
    default: {
      const _exhaustive: never = actionKind
      summary = String(_exhaustive)
    }
  }
  return {
    cardKey,
    actionKind,
    originalIndex,
    grade,
    cardLabel: cardLabel || undefined,
    summary
  }
}

/**
 * 记录动作：推入导航栈；锁定动作同时写入 outcomesByKey（覆盖同 key 的旧 outcome）
 */
export function recordHistoryAction(
  state: ReviewSessionHistoryState,
  entry: ReviewSessionHistoryEntry
): ReviewSessionHistoryState {
  const stack = [...state.stack, entry]
  if (!isLockingAction(entry.actionKind)) {
    return { stack, outcomesByKey: state.outcomesByKey }
  }
  return {
    stack,
    outcomesByKey: {
      ...state.outcomesByKey,
      [entry.cardKey]: entry
    }
  }
}

export function findQueueIndexByCardKey(
  queue: readonly ReviewCard[],
  cardKey: string,
  getKey: (card: ReviewCard) => string = cardKeyFromReviewCard
): number {
  return queue.findIndex((card) => getKey(card) === cardKey)
}

export type NavigatePreviousResult =
  | {
      ok: true
      index: number
      entry: ReviewSessionHistoryEntry
      state: ReviewSessionHistoryState
      /** 途中跳过的缺失历史项提示 */
      warnings: readonly string[]
    }
  | {
      ok: false
      reason: "empty_stack" | "all_missing"
      state: ReviewSessionHistoryState
      warnings: readonly string[]
      message: string
    }

/**
 * 返回上一张：按 cardKey 在当前队列定位。
 * 目标已删除/不在队列时 pop 该项、收集 warn，并继续尝试更早的历史；
 * 绝不跳到错误索引。
 */
export function navigatePrevious(
  state: ReviewSessionHistoryState,
  queue: readonly ReviewCard[],
  getKey: (card: ReviewCard) => string = cardKeyFromReviewCard
): NavigatePreviousResult {
  let current = state
  const warnings: string[] = []

  while (current.stack.length > 0) {
    const entry = current.stack[current.stack.length - 1]!
    const nextState: ReviewSessionHistoryState = {
      stack: current.stack.slice(0, -1),
      outcomesByKey: current.outcomesByKey
    }
    const index = findQueueIndexByCardKey(queue, entry.cardKey, getKey)
    if (index >= 0) {
      return {
        ok: true,
        index,
        entry,
        state: nextState,
        warnings
      }
    }
    const msg = `历史卡片已不在队列中（${entry.cardKey}），已跳过该历史项`
    warnings.push(msg)
    current = nextState
  }

  if (warnings.length > 0) {
    return {
      ok: false,
      reason: "all_missing",
      state: current,
      warnings,
      message: warnings[warnings.length - 1]!
    }
  }

  return {
    ok: false,
    reason: "empty_stack",
    state: current,
    warnings,
    message: "没有可返回的历史卡片"
  }
}

/**
 * 只读回看中的「继续」：把当前卡的 outcome（若有）重新压回导航栈，
 * 再前进到下一索引。不得写成 skip 覆盖 locking outcome。
 */
export function continueFromReadOnly(
  state: ReviewSessionHistoryState,
  cardKey: string,
  currentIndex: number
): { state: ReviewSessionHistoryState; nextIndex: number } {
  const outcome = state.outcomesByKey[cardKey]
  const entryToPush: ReviewSessionHistoryEntry = outcome ?? {
    cardKey,
    actionKind: "skip",
    originalIndex: currentIndex,
    summary: "继续"
  }
  return {
    state: {
      stack: [...state.stack, entryToPush],
      outcomesByKey: state.outcomesByKey
    },
    nextIndex: currentIndex + 1
  }
}

/** UI 用简短只读状态文案 */
export function formatReadOnlyStatus(
  entry: ReviewSessionHistoryEntry
): string {
  switch (entry.actionKind) {
    case "grade":
    case "repeat_grade":
    case "auxiliary_grade":
      return entry.grade
        ? `只读回看 / 上次评分 ${entry.grade.toUpperCase()}`
        : "只读回看 / 上次已评分"
    case "postpone":
      return "只读回看 / 上次动作：推迟"
    case "suspend":
      return "只读回看 / 上次动作：暂停"
    default:
      return "只读回看"
  }
}

/**
 * 副作用动作最终 guard（评分/推迟/暂停等）。
 * 返回 blocked 时调用方不得落盘、推进 List 或会话统计。
 */
export function guardSideEffectAction(
  cardKey: string,
  state: ReviewSessionHistoryState
): { allowed: true } | { allowed: false; message: string } {
  if (isCardReadOnly(cardKey, state)) {
    return { allowed: false, message: READONLY_ACTION_BLOCKED_MESSAGE }
  }
  return { allowed: true }
}
