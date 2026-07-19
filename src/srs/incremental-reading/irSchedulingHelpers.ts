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

/**
 * 已有卡 priority 改变后的 interval 比例修正（单一真相）。
 * factor 限制在 0.6..1.6；最终走卡种 clamp（Extract 1..30 / Topic 1..60）。
 */
export function adjustIntervalForPriorityChange(
  cardType: string,
  currentInterval: number,
  oldPriority: number,
  newPriority: number
): number {
  const oldP = Math.min(100, Math.max(0, oldPriority))
  const newP = Math.min(100, Math.max(0, newPriority))
  // 优先级升高 → 间隔略缩短；降低 → 略拉长
  const rawFactor = 1 + (oldP - newP) / 200
  const factor = Math.min(1.6, Math.max(0.6, rawFactor))
  const base = typeof currentInterval === "number" && Number.isFinite(currentInterval)
    ? currentInterval
    : 1
  const next = Math.max(1, base * factor)
  const rounded = Math.round(next * 100) / 100
  return clampIntervalDays(cardType, rounded)
}

export function isNewCard(state: Pick<IRState, "readCount" | "lastRead">): boolean {
  return state.readCount === 0 && !state.lastRead
}

/**
 * 分散排期：intentional `intervalDays` 与首次 `due` 分离。
 * - `intervalDays` = base 抖动后的长期节奏（不含 sibling queueDelay）
 * - `due` = now + intervalDays + queueDelayDays（queueDelay 仅推远首次 due）
 */
export function computeDispersedSchedule(
  blockId: DbId,
  cardType: string,
  baseDate: Date,
  baseIntervalDays: number,
  options: { isNew: boolean; queueDelayDays?: number }
): { intervalDays: number; due: Date; queueDelayDays: number } {
  const dispersalCardType = cardType === "extracts" ? "extracts" : "topic"
  const dispersed = computeDispersedIntervalDays({
    blockId,
    cardType: dispersalCardType,
    baseDate,
    baseIntervalDays,
    isNew: options.isNew
  })
  const intervalDays = clampIntervalDays(cardType, dispersed)
  const queueDelayDays = Number.isFinite(options.queueDelayDays)
    ? Math.max(0, options.queueDelayDays as number)
    : 0
  const due = computeDueFromIntervalDays(baseDate, intervalDays + queueDelayDays)
  return { intervalDays, due, queueDelayDays }
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

/** Nested Extract 扫描：Topic → 正文块 → Extract 深度约 2；留余量到 3。硬上限。 */
export const EXTRACT_SIBLING_SCAN_MAX_DEPTH = 3
/** 有界扫描：禁止对整库/无限子树 Promise.all。硬上限。 */
export const EXTRACT_SIBLING_SCAN_MAX_BLOCKS = 200
export const EXTRACT_SIBLING_SCAN_CONCURRENCY = 4

/** 将扫描参数钳制到 [1, hardMax]；NaN/Infinity/负数安全回退 defaultValue。 */
export function clampSiblingScanLimit(
  value: unknown,
  defaultValue: number,
  hardMax: number
): number {
  const max = Number.isFinite(hardMax) && hardMax >= 1 ? Math.floor(hardMax) : 1
  const fallbackRaw = Number.isFinite(defaultValue) && defaultValue >= 1
    ? Math.floor(defaultValue)
    : 1
  const fallback = Math.min(Math.max(1, fallbackRaw), max)
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback
  }
  const floored = Math.floor(value)
  if (floored < 1) return fallback
  return Math.min(floored, max)
}

/**
 * 解析 Extract 来源 Topic：优先 `ir.sourceTopicId`；缺失时仅回退直接 parent Topic。
 * 真实数据：Extract 常嵌套在普通正文块下，不能假设 parent 即 Topic。
 */
export async function resolveExtractSourceTopicId(
  blockId: DbId,
  block: Block
): Promise<DbId | null> {
  const fromProp = parseOptionalNumber(readProp(block, "ir.sourceTopicId"))
  if (fromProp !== null) {
    dropIrBlockCacheEntry(fromProp as DbId)
    const topic = await getBlockCached(fromProp as DbId)
    if (topic && extractCardType(topic) === "topic") {
      return fromProp as DbId
    }
    console.warn("[IR] Extract sourceTopicId does not point to a Topic", {
      blockId,
      sourceTopicId: fromProp
    })
    // 属性损坏/指向非 Topic：事实已可见，再尝试兼容 legacy direct-parent 形状。
  }

  const parentId = block.parent
  if (!parentId) return null
  dropIrBlockCacheEntry(parentId)
  const parent = await getBlockCached(parentId)
  if (parent && extractCardType(parent) === "topic") {
    return parentId
  }
  return null
}

/**
 * 是否计为当前 source Topic 的同源 sibling Extract：
 * - 有 ir.sourceTopicId → 必须等于 sourceTopicId
 * - 缺失 → 仅允许 direct parent 就是 source Topic（legacy 直接 child 兼容）
 */
function isSameSourceExtractSibling(
  block: Block,
  sourceTopicId: DbId
): boolean {
  const prop = parseOptionalNumber(readProp(block, "ir.sourceTopicId"))
  if (prop !== null) {
    return prop === sourceTopicId
  }
  return block.parent === sourceTopicId
}

/**
 * 有界 BFS：在 source Topic 子树内统计同日、更早创建的 **同源** Extract（不含 self）。
 * - maxDepth/maxBlocks/concurrency 硬 cap（含 NaN/Infinity）
 * - 初始 queue 与后续入队均不超过剩余 cap
 * - 嵌套另一 Topic 不继续深入其子树
 * - cap 截断时 console.warn（不静默伪装完整）
 */
export async function countEarlierSameDayExtractSiblings(params: {
  sourceTopicId: DbId
  selfId: DbId
  selfCreated: Date
  maxDepth?: number
  maxBlocks?: number
  concurrency?: number
}): Promise<number> {
  const maxDepth = clampSiblingScanLimit(
    params.maxDepth,
    EXTRACT_SIBLING_SCAN_MAX_DEPTH,
    EXTRACT_SIBLING_SCAN_MAX_DEPTH
  )
  const maxBlocks = clampSiblingScanLimit(
    params.maxBlocks,
    EXTRACT_SIBLING_SCAN_MAX_BLOCKS,
    EXTRACT_SIBLING_SCAN_MAX_BLOCKS
  )
  const concurrency = clampSiblingScanLimit(
    params.concurrency,
    EXTRACT_SIBLING_SCAN_CONCURRENCY,
    EXTRACT_SIBLING_SCAN_CONCURRENCY
  )

  const dayStartMs = getLocalDayStartMs(params.selfCreated)
  const createdMs = params.selfCreated.getTime()

  dropIrBlockCacheEntry(params.sourceTopicId)
  const root = await getBlockCached(params.sourceTopicId)
  if (!root) return 0

  const rootChildren = Array.isArray(root.children) ? root.children : []
  if (rootChildren.length === 0) return 0

  type QueueItem = { id: DbId; depth: number }
  // 初始 queue最多 maxBlocks，避免 children 超大时先占满内存/超限
  const queue: QueueItem[] = []
  let truncated = false
  for (let i = 0; i < rootChildren.length; i++) {
    if (queue.length >= maxBlocks) {
      truncated = true
      break
    }
    queue.push({ id: rootChildren[i] as DbId, depth: 1 })
  }

  let visited = 0
  let index = 0

  while (queue.length > 0 && visited < maxBlocks) {
    const batchSize = Math.min(concurrency, queue.length, maxBlocks - visited)
    const batch = queue.splice(0, batchSize)
    visited += batch.length

    const loaded = await Promise.all(
      batch.map(async item => {
        // 快速连续创建时 children 列表时效敏感：读前丢弃该节点缓存
        dropIrBlockCacheEntry(item.id)
        const b = (await getBlockCached(item.id)) ?? null
        return { ...item, block: b }
      })
    )

    for (const { id, depth, block } of loaded) {
      if (!block) continue

      const cardType = extractCardType(block)

      // 嵌套另一 Topic：不计入其子 Extract，也不深入其子树
      if (id !== params.sourceTopicId && cardType === "topic") {
        continue
      }

      if (
        id !== params.selfId
        && cardType === "extracts"
        && isSameSourceExtractSibling(block, params.sourceTopicId)
      ) {
        const siblingCreated = getBlockCreatedDate(block)
        if (siblingCreated && getLocalDayStartMs(siblingCreated) === dayStartMs) {
          const siblingMs = siblingCreated.getTime()
          if (
            siblingMs < createdMs
            || (siblingMs === createdMs && id < params.selfId)
          ) {
            index++
          }
        }
      }

      const kids = Array.isArray(block.children) ? block.children : []
      if (depth >= maxDepth) {
        if (kids.length > 0) truncated = true
        continue
      }
      for (const kid of kids) {
        if (visited + queue.length >= maxBlocks) {
          truncated = true
          break
        }
        queue.push({ id: kid as DbId, depth: depth + 1 })
      }
    }
  }

  // 仍有未访问队列节点 → cap 截断
  if (queue.length > 0) {
    truncated = true
  }

  if (truncated) {
    console.warn("[IR] sibling extract scan truncated", {
      sourceTopicId: params.sourceTopicId,
      selfId: params.selfId,
      maxDepth,
      maxBlocks,
      visited
    })
  }

  return index
}

export async function computeNewExtractQueueDelayDays(
  blockId: DbId,
  block: Block,
  baseIntervalDays: number
): Promise<number> {
  const sourceTopicId = await resolveExtractSourceTopicId(blockId, block)
  if (sourceTopicId === null) return 0

  const created = getBlockCreatedDate(block)
  if (!created) return 0

  const index = await countEarlierSameDayExtractSiblings({
    sourceTopicId,
    selfId: blockId,
    selfCreated: created
  })

  // Per-extract queue spreading:
  // - Keep it modest for short-base (high-priority) cards
  // - Cap at 0.5 day per step so it doesn't explode too fast
  const stepDays = Math.min(0.5, Math.max(0.15, baseIntervalDays * 0.2))
  return index * stepDays
}
