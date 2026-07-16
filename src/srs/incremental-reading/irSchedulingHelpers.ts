/**
 * 渐进阅读排期计算辅助（间隔、分散 due、新 Extract 排队延迟）
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
  getTopicBaseIntervalDays,
  normalizePriority
} from "../incrementalReadingScheduler"
import { dropIrBlockCacheEntry, getBlockCached } from "./irBlockCache"
import {
  getBlockCreatedDate,
  getLocalDayStartMs
} from "./irPropertyCodec"
import type { IRStage, IRState } from "./irTypes"

export const DEFAULT_PRIORITY = DEFAULT_IR_PRIORITY
const TOPIC_MAX_INTERVAL_DAYS = 60
const EXTRACT_MAX_INTERVAL_DAYS = 30
const TOPIC_GROWTH_FACTOR = 1.25
const EXTRACT_GROWTH_FACTOR = 1.35

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
