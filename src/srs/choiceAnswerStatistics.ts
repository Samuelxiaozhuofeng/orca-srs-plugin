/**
 * 选择题答题统计：entry 构造、正确性判定、复习提交回调（FC-08）
 *
 * 纯逻辑 + 可注入 save，便于单测；不引入第二套 UI 门闩（防重复依赖 choiceSubmitGate）。
 */

import type { DbId } from "../orca.d.ts"
import type { ChoiceMode, ChoiceOption, ChoiceStatisticsEntry, Grade } from "./types"
import { calculateAutoGrade } from "./choiceUtils"
import { saveChoiceStatistics } from "./choiceStatisticsStorage"

/** 保存失败时展示给用户的明确文案（产品允许继续评分） */
export const CHOICE_STATISTICS_SAVE_FAILURE_MESSAGE =
  "选择题统计保存失败，本次答题仍可继续评分"

/**
 * 统计正确性（isCorrect）：
 * - 题目必须至少有一个正确选项；空正确集合始终 false
 *   （与 calculateAutoGrade 在 correctIds 为空时返回 null 对齐，不得记 true）
 * - 在此前提下 selected/correct 集合完全相等（无错选且无漏选，顺序无关）才为 true
 * - 正常 single/multiple：good ⇔ isCorrect true
 */
export function areChoiceAnswerSetsEqual(
  selectedBlockIds: readonly DbId[],
  correctBlockIds: readonly DbId[]
): boolean {
  const selected = new Set(selectedBlockIds)
  const correct = new Set(correctBlockIds)
  // 无正确选项时永远不算“答对”（避免 []/[] → true 与自动评分 null 不一致）
  if (correct.size === 0) return false
  if (selected.size !== correct.size) return false
  for (const id of selected) {
    if (!correct.has(id)) return false
  }
  return true
}

/**
 * 从选项列表提取正确选项 ID（乱序不影响结果）。
 */
export function extractCorrectBlockIds(
  options: readonly Pick<ChoiceOption, "blockId" | "isCorrect">[]
): DbId[] {
  return options.filter(opt => opt.isCorrect).map(opt => opt.blockId)
}

/**
 * 构造一条 ChoiceStatisticsEntry。
 * isCorrect：至少有一个正确选项且 selected/correct 集合完全相等
 * （与 ChoiceCardReviewRenderer / calculateAutoGrade 的 good 一致；无正确项时 false）。
 */
export function buildChoiceStatisticsEntry(
  selectedBlockIds: readonly DbId[],
  correctBlockIds: readonly DbId[],
  timestamp: number = Date.now()
): ChoiceStatisticsEntry {
  return {
    timestamp,
    selectedBlockIds: [...selectedBlockIds],
    correctBlockIds: [...correctBlockIds],
    isCorrect: areChoiceAnswerSetsEqual(selectedBlockIds, correctBlockIds)
  }
}

/**
 * 与 ChoiceCardReviewRenderer 自动评分规则一致的 pure helper：
 * - single：正确 = good，否则 again
 * - multiple：有错选 = again，无错但漏选 = hard，完全相等 = good
 * - undefined / 无正确项 = null
 */
export function suggestChoiceGrade(
  selectedBlockIds: readonly DbId[],
  correctBlockIds: readonly DbId[],
  mode: ChoiceMode
): Grade | null {
  return calculateAutoGrade(
    [...selectedBlockIds],
    [...correctBlockIds],
    mode
  )
}

export type SaveChoiceStatisticsFn = (
  blockId: DbId,
  entry: ChoiceStatisticsEntry
) => Promise<void>

export type ChoiceAnswerNotifyFn = (
  type: "info" | "success" | "warn" | "error",
  message: string
) => void

export interface RecordChoiceAnswerStatisticsOptions {
  blockId: DbId
  selectedBlockIds: readonly DbId[]
  correctBlockIds: readonly DbId[]
  timestamp?: number
  /** 可注入，默认 saveChoiceStatistics */
  save?: SaveChoiceStatisticsFn
  /** 可注入，默认 orca.notify */
  notify?: ChoiceAnswerNotifyFn
  /** 可注入日志，默认 console */
  logError?: (...args: unknown[]) => void
  logWarn?: (...args: unknown[]) => void
}

/**
 * 构造 entry 并持久化。
 * 保存失败：console.error/warn + notify warn，**不抛出**（不阻断后续 FSRS 评分）。
 * 成功：静默，不打扰用户。
 *
 * @returns 是否保存成功；测试可断言。失败时 entry 仍返回便于调试。
 */
export async function recordChoiceAnswerStatistics(
  options: RecordChoiceAnswerStatisticsOptions
): Promise<{ ok: boolean; entry: ChoiceStatisticsEntry; error?: unknown }> {
  const entry = buildChoiceStatisticsEntry(
    options.selectedBlockIds,
    options.correctBlockIds,
    options.timestamp
  )
  const save = options.save ?? saveChoiceStatistics
  const notify =
    options.notify ??
    ((type, message) => {
      orca.notify(type, message)
    })
  const logError = options.logError ?? ((...args) => console.error(...args))
  const logWarn = options.logWarn ?? ((...args) => console.warn(...args))

  try {
    await save(options.blockId, entry)
    return { ok: true, entry }
  } catch (error) {
    logError(
      `[SRS] 选择题统计保存失败 (blockId: ${options.blockId}):`,
      error
    )
    logWarn(
      `[SRS] ${CHOICE_STATISTICS_SAVE_FAILURE_MESSAGE} (blockId: ${options.blockId})`
    )
    try {
      notify("warn", CHOICE_STATISTICS_SAVE_FAILURE_MESSAGE)
    } catch (notifyError) {
      logWarn("[SRS] 选择题统计失败提示 notify 异常:", notifyError)
    }
    return { ok: false, entry, error }
  }
}

/**
 * 供 SrsCardDemo 等挂到 ChoiceCardReviewRenderer.onAnswer 的工厂。
 * 防重复依赖调用方 + choiceSubmitGate，本函数本身不二次门闩。
 */
export function createChoiceAnswerHandler(args: {
  blockId: DbId
  /** 当前选项（含 isCorrect）；正确 ID 由此提取，乱序无关 */
  options: readonly Pick<ChoiceOption, "blockId" | "isCorrect">[]
  save?: SaveChoiceStatisticsFn
  notify?: ChoiceAnswerNotifyFn
  now?: () => number
}): (selectedIds: DbId[]) => void {
  const correctBlockIds = extractCorrectBlockIds(args.options)
  return (selectedIds: DbId[]) => {
    void recordChoiceAnswerStatistics({
      blockId: args.blockId,
      selectedBlockIds: selectedIds,
      correctBlockIds,
      timestamp: args.now?.() ?? Date.now(),
      save: args.save,
      notify: args.notify
    })
  }
}

/**
 * 集成层可测：在门闩已 accept 的前提下记录一次提交。
 * 用于证明「快速重复 begin 只 accept 一次 → 只产生一条统计」。
 */
export function submitChoiceAnswerOnce(args: {
  accepted: boolean
  blockId: DbId
  selectedBlockIds: readonly DbId[]
  correctBlockIds: readonly DbId[]
  timestamp?: number
  save?: SaveChoiceStatisticsFn
  notify?: ChoiceAnswerNotifyFn
  onAnswer?: (selectedIds: DbId[]) => void
}): Promise<{ recorded: boolean; result?: Awaited<ReturnType<typeof recordChoiceAnswerStatistics>> }> {
  if (!args.accepted) {
    return Promise.resolve({ recorded: false })
  }
  args.onAnswer?.([...args.selectedBlockIds])
  return recordChoiceAnswerStatistics({
    blockId: args.blockId,
    selectedBlockIds: args.selectedBlockIds,
    correctBlockIds: args.correctBlockIds,
    timestamp: args.timestamp,
    save: args.save,
    notify: args.notify
  }).then(result => ({ recorded: true, result }))
}
