import type { DbId } from "../orca.d.ts"

export type IRDispersalCardType = "topic" | "extracts"

export const DAY_MS = 24 * 60 * 60 * 1000

export function computeDueFromIntervalDays(baseDate: Date, intervalDays: number): Date {
  return new Date(baseDate.getTime() + intervalDays * DAY_MS)
}

type DispersalParams = {
  blockId: DbId
  cardType: IRDispersalCardType
  baseDate: Date
  baseIntervalDays: number
  isNew: boolean
  /**
   * Optional extra delay (in days) used to spread batches of newly created cards
   * (e.g., many extracts created under the same topic in a short period).
   */
  queueDelayDays?: number
  seedSalt?: string
}

function getLocalDayStartMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function hashStringToUint32(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function getDispersalSpec(cardType: IRDispersalCardType): { ratio: number; maxAbsDays: number } {
  if (cardType === "extracts") {
    return { ratio: 0.35, maxAbsDays: 3 }
  }
  return { ratio: 0.2, maxAbsDays: 2 }
}

function getNewCardForwardMaxDays(cardType: IRDispersalCardType, baseIntervalDays: number): number {
  const forward = Math.max(0, baseIntervalDays * 0.5)
  // Topic 的“精确性”要求更高一些：保持与旧版本一致（最多 1 天），避免新 Topic 被随机拖得太远。
  if (cardType === "topic") return Math.min(1, forward)
  // Extract 是阅读材料：允许更大的“只向后”分散，避免同日大量摘录扎堆。
  return forward
}

/**
 * 方案 1（B 选择）：抖动 intervalDays（而不是只抖动 due）
 *
 * - 通过 “按天稳定” 的 seed（blockId + dayStart）保证同一天重复触发不会反复改变
 * - 新卡：只向后（避免大量新摘录同日结块）
 * - 非新卡：±比例（Extract 更大、Topic 更小）
 */
export function computeDispersedIntervalDays(params: DispersalParams): number {
  const base = Number.isFinite(params.baseIntervalDays) ? params.baseIntervalDays : 1
  const salt = params.seedSalt ?? "ir:dispersal"
  const dayStartMs = getLocalDayStartMs(params.baseDate)
  const seed = hashStringToUint32(`${params.blockId}:${dayStartMs}:${params.cardType}:${salt}`)
  const rand = mulberry32(seed)()

  if (params.isNew) {
    const maxForward = getNewCardForwardMaxDays(params.cardType, base)
    const queueDelay = Number.isFinite(params.queueDelayDays) ? Math.max(0, params.queueDelayDays!) : 0
    return base + rand * maxForward + queueDelay
  }

  const spec = getDispersalSpec(params.cardType)
  const maxAbs = Math.min(spec.maxAbsDays, Math.max(0, base * spec.ratio))
  const delta = (rand * 2 - 1) * maxAbs
  return base + delta
}
