/**
 * 渐进阅读排期计算辅助（间隔、分散 due、新 Extract 排队延迟、SAC）
 *
 * Sequential Active Cadence（SAC）：
 * - 仅对顺序 Book IR 的当前 activeChapterId 章节启用
 * - 用短节奏推进当前章，而不是 Topic 记忆型 ×1.25 增长
 * - 1/2/3 天为产品启发式，不是学习科学固定最优值
 */

import type { Block, DbId } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"
import {
  computeDispersedIntervalDays,
  computeDueFromIntervalDays
} from "../incrementalReadingDispersal"
import {
  DEFAULT_IR_PRIORITY,
  getExtractBaseIntervalDays,
  getSequentialActiveBaseIntervalDays,
  getTopicBaseIntervalDays,
  normalizePriority,
  SAC_MAX_INTERVAL_DAYS
} from "../incrementalReadingScheduler"
import { dropIrBlockCacheEntry, getBlockCached } from "./irBlockCache"
import {
  getBlockCreatedDate,
  getLocalDayStartMs,
  parseOptionalNumber,
  readProp
} from "./irPropertyCodec"
import type { IRReadingBreakpoint, IRStage, IRState } from "./irTypes"

// Re-export pure SAC helpers so existing call sites keep working.
export { getSequentialActiveBaseIntervalDays, SAC_MAX_INTERVAL_DAYS }

export const DEFAULT_PRIORITY = DEFAULT_IR_PRIORITY
const TOPIC_MAX_INTERVAL_DAYS = 60
const EXTRACT_MAX_INTERVAL_DAYS = 30
const TOPIC_GROWTH_FACTOR = 1.25
const EXTRACT_GROWTH_FACTOR = 1.35

/** 每次连续无进展「下一篇」增加的间隔（天） */
export const SAC_STAGNANT_STEP_DAYS = 1

export function getMaxIntervalDays(cardType: string): number {
  if (cardType === "extracts") return EXTRACT_MAX_INTERVAL_DAYS
  return TOPIC_MAX_INTERVAL_DAYS
}

export function clampIntervalDays(cardType: string, raw: number): number {
  const fallback = cardType === "extracts" ? 2 : 5
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback
  const max = getMaxIntervalDays(cardType)
  return Math.min(max, Math.max(1, value))
}

export function isNewCard(state: Pick<IRState, "readCount" | "lastRead">): boolean {
  return state.readCount === 0 && !state.lastRead
}

export function computeDispersedSchedule(
  blockId: DbId,
  cardType: string,
  baseDate: Date,
  baseIntervalDays: number,
  options: { isNew: boolean; queueDelayDays?: number }
): { intervalDays: number; due: Date } {
  const dispersalCardType = cardType === "extracts" ? "extracts" : "topic"
  const dispersed = computeDispersedIntervalDays({
    blockId,
    cardType: dispersalCardType,
    baseDate,
    baseIntervalDays,
    isNew: options.isNew,
    queueDelayDays: options.queueDelayDays
  })
  const intervalDays = clampIntervalDays(cardType, dispersed)
  const due = computeDueFromIntervalDays(baseDate, intervalDays)
  return { intervalDays, due }
}

export function getInitialStage(cardType: string): IRStage {
  if (cardType === "extracts") return "extract.raw"
  return "topic.preview"
}

export function computeBaseIntervalDays(
  block: Block | undefined,
  numericPriority: number
): number {
  const normalizedPriority = normalizePriority(numericPriority)
  const cardType = block ? extractCardType(block) : "topic"

  if (cardType === "extracts") {
    return getExtractBaseIntervalDays(normalizedPriority)
  }

  return getTopicBaseIntervalDays(normalizedPriority)
}

export function growIntervalDays(
  cardType: string,
  currentIntervalDays: number
): number {
  const base = Math.max(1, currentIntervalDays)
  const factor = cardType === "extracts" ? EXTRACT_GROWTH_FACTOR : TOPIC_GROWTH_FACTOR
  return clampIntervalDays(cardType, base * factor)
}

export function clampSacIntervalDays(raw: number): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : 2
  return Math.min(SAC_MAX_INTERVAL_DAYS, Math.max(1, value))
}

/**
 * SAC 最终间隔：基线 + 停滞惩罚，上限 SAC_MAX_INTERVAL_DAYS。
 * stagnantCount：连续「下一篇」但阅读断点无实质变化的次数（首次有快照前为 0）。
 */
export function computeSacIntervalDays(
  priority: number,
  stagnantCount: number
): number {
  const base = getSequentialActiveBaseIntervalDays(priority)
  const n = Number.isFinite(stagnantCount) ? Math.max(0, Math.floor(stagnantCount)) : 0
  return clampSacIntervalDays(base + n * SAC_STAGNANT_STEP_DAYS)
}

/**
 * 阅读进度指纹：仅用现有 resumeBlockId / readingBreakpoint 可观测字段。
 * 故意不纳入 updatedAt（仅时间戳变化不算实质进展）。
 *
 * 局限：若用户阅读但从未写回断点/resume，指纹会保持空串，连续「下一篇」
 * 会被判为停滞——这是可解释的保守策略（空转章减速），与断点写入路径一致。
 */
export function computeReadingProgressKey(state: {
  resumeBlockId: DbId | null
  readingBreakpoint?: IRReadingBreakpoint | null
}): string {
  const resume = state.resumeBlockId ?? ""
  const bp = state.readingBreakpoint
  const preview = bp?.previewBlockId ?? ""
  const sel = bp?.selection
  const selKey = sel
    ? [
        sel.rootBlockId,
        sel.anchor.blockId,
        sel.anchor.index,
        sel.anchor.offset,
        sel.focus.blockId,
        sel.focus.index,
        sel.focus.offset,
        sel.isForward ? 1 : 0
      ].join(":")
    : ""
  return `r=${resume}|p=${preview}|s=${selKey}`
}

export type SacStagnationUpdate = {
  stagnantCount: number
  progressKey: string
}

/**
 * 根据上次进度指纹与当前进度，更新停滞计数。
 * - 无历史指纹（旧数据/首次 SAC next）：不惩罚，写入当前指纹
 * - 指纹相同：stagnantCount + 1
 * - 指纹变化：重置为 0
 */
export function nextSacStagnation(
  previousProgressKey: string | null | undefined,
  currentProgressKey: string,
  previousStagnantCount: number | null | undefined
): SacStagnationUpdate {
  const prevCount = Number.isFinite(previousStagnantCount as number)
    ? Math.max(0, Math.floor(previousStagnantCount as number))
    : 0

  // null/undefined = 无历史快照（旧数据或首次 SAC next）：不惩罚，写入当前指纹
  // 空字符串 "" 表示「已有快照且当时无断点/resume」——再次相同则计停滞
  if (previousProgressKey == null) {
    return { stagnantCount: 0, progressKey: currentProgressKey }
  }

  if (currentProgressKey === previousProgressKey) {
    return { stagnantCount: prevCount + 1, progressKey: currentProgressKey }
  }
  return { stagnantCount: 0, progressKey: currentProgressKey }
}

/**
 * 判断 block 是否为顺序 Book IR 的当前激活章。
 * 依赖 ir.sourceBookId + 书籍 ir.bookPlan（mode/activeChapterId）；
 * plan 缺失 → false；plan 损坏 → 抛出（不静默吞错）。
 */
export async function isSequentialActiveChapter(
  blockId: DbId,
  block?: Block | null
): Promise<boolean> {
  const resolved =
    block
    ?? (await getBlockCached(blockId))
    ?? null
  if (!resolved) return false

  const sourceBookId = parseOptionalNumber(readProp(resolved, "ir.sourceBookId"))
  if (sourceBookId === null) return false

  const { loadBookIRPlan } = await import("../book-ir/bookIRPlanRepository")
  const plan = await loadBookIRPlan(sourceBookId)
  if (!plan) return false
  return plan.mode === "sequential" && plan.activeChapterId === blockId
}

const buildDefaultState = (priority: number, lastRead: Date | null): IRState => {
  const normalizedPriority = normalizePriority(priority)
  const cardType = "topic"
  const baseDate = new Date()
  const intervalDays = clampIntervalDays(cardType, getTopicBaseIntervalDays(normalizedPriority))
  return {
    priority: normalizedPriority,
    lastRead,
    readCount: 0,
    due: computeDueFromIntervalDays(baseDate, intervalDays),
    intervalDays,
    postponeCount: 0,
    stage: getInitialStage(cardType),
    lastAction: "init",
    position: null,
    resumeBlockId: null,
    readingBreakpoint: null,
    autoPostponeBatchId: null
  }
}

export async function computeNewExtractQueueDelayDays(
  blockId: DbId,
  block: Block,
  baseIntervalDays: number
): Promise<number> {
  const parentId = block.parent
  if (!parentId) return 0

  // Parent's `children` list is time-sensitive during rapid extract creation.
  // Avoid using a potentially stale cached parent here, otherwise all extracts
  // may see the same empty/old children list and end up with queueDelay=0.
  dropIrBlockCacheEntry(parentId)
  const parent = await getBlockCached(parentId)
  if (!parent) return 0
  if (extractCardType(parent) !== "topic") return 0

  const created = getBlockCreatedDate(block)
  if (!created) return 0
  const dayStartMs = getLocalDayStartMs(created)
  const createdMs = created.getTime()

  const children = Array.isArray(parent.children) ? parent.children : []
  if (children.length === 0) return 0

  const siblingBlocks = await Promise.all(
    children.map(async id => (await getBlockCached(id as DbId)) ?? null)
  )

  let index = 0
  for (const sibling of siblingBlocks) {
    if (!sibling || sibling.id === blockId) continue
    const siblingCreated = getBlockCreatedDate(sibling)
    if (!siblingCreated) continue
    if (getLocalDayStartMs(siblingCreated) !== dayStartMs) continue

    const siblingMs = siblingCreated.getTime()
    if (siblingMs < createdMs || (siblingMs === createdMs && sibling.id < blockId)) {
      index++
    }
  }

  // Per-extract queue spreading:
  // - Keep it modest for short-base (high-priority) cards
  // - Cap at 0.5 day per step so it doesn't explode too fast
  const stepDays = Math.min(0.5, Math.max(0.15, baseIntervalDays * 0.2))
  return index * stepDays
}
