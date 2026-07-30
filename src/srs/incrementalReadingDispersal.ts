import type { DbId } from "../orca.d.ts"

export type IRDispersalCardType = "topic" | "extracts"

export const DAY_MS = 24 * 60 * 60 * 1000

/** Priority at/above this uses the tighter high-priority dispersal window. */
export const HIGH_IR_PRIORITY_THRESHOLD = 80

export function computeDueFromIntervalDays(baseDate: Date, intervalDays: number): Date {
  return new Date(baseDate.getTime() + intervalDays * DAY_MS)
}

export type DispersalOffsetParams = {
  blockId: DbId
  cardType: IRDispersalCardType
  baseDate: Date
  baseIntervalDays: number
  isNew: boolean
  /** 0–100; non-finite → 50. Affects window size only, not the RNG seed. */
  priority?: number
  /** Stable per-review counter (typically `readCount` before the write). */
  scheduleOrdinal?: number
  seedSalt?: string
}

type CompatDispersalParams = {
  blockId: DbId
  cardType: IRDispersalCardType
  baseDate: Date
  baseIntervalDays: number
  isNew: boolean
  /**
   * @deprecated Due-only sibling offset. Must not be applied inside this function.
   * Callers that still pass it are ignored so `intervalDays` stays intentional cadence.
   * Apply queue delay only when computing first `due` (see `computeDispersedSchedule`).
   */
  queueDelayDays?: number
  seedSalt?: string
  priority?: number
  scheduleOrdinal?: number
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

function normalizeDispersalPriority(priority: number | undefined): number {
  if (typeof priority !== "number" || !Number.isFinite(priority)) return 50
  return Math.min(100, Math.max(0, priority))
}

/**
 * New-card forward window (days). High priority converges; normal expands slightly.
 * Production uses this only as a **due** offset — never written into `ir.intervalDays`.
 */
export function getNewForwardMaxDays(
  cardType: IRDispersalCardType,
  baseIntervalDays: number,
  priority: number
): number {
  const base = Math.max(0, baseIntervalDays)
  const p = normalizeDispersalPriority(priority)
  const high = p >= HIGH_IR_PRIORITY_THRESHOLD
  if (cardType === "topic") {
    return high ? Math.min(1, base * 0.25) : Math.min(3, base * 0.35)
  }
  return high ? Math.min(1, base * 0.35) : Math.min(3, base * 0.5)
}

/**
 * Non-new max absolute offset (days). Symmetric ± window around intentional base.
 */
export function getNonNewMaxAbsDays(
  cardType: IRDispersalCardType,
  baseIntervalDays: number,
  priority: number
): number {
  const base = Math.max(0, baseIntervalDays)
  const p = normalizeDispersalPriority(priority)
  const high = p >= HIGH_IR_PRIORITY_THRESHOLD
  if (cardType === "topic") {
    return high ? Math.min(0.75, base * 0.15) : Math.min(2, base * 0.2)
  }
  return high ? Math.min(1, base * 0.2) : Math.min(3, base * 0.35)
}

/**
 * Due-only dispersal offset (days). Random must **not** enter `ir.intervalDays`.
 *
 * - new: `offset = rand * maxForward` (always ≥ 0)
 * - non-new: `offset = (rand * 2 - 1) * maxAbs`
 * - seed: FNV-1a of
 *   `blockId:localDayStartMs:cardType:scheduleOrdinal:salt`
 *   then mulberry32; priority is **not** in the seed (window size only)
 */
export function computeDispersalOffsetDays(params: DispersalOffsetParams): number {
  const base = Number.isFinite(params.baseIntervalDays) ? params.baseIntervalDays : 1
  const priority = normalizeDispersalPriority(params.priority)
  const ordinal = Number.isFinite(params.scheduleOrdinal as number)
    ? Math.floor(params.scheduleOrdinal as number)
    : 0
  const salt =
    params.seedSalt
    ?? (params.isNew ? "ir:dispersal:new" : "ir:dispersal:revisit")
  const dayStartMs = getLocalDayStartMs(params.baseDate)
  const seed = hashStringToUint32(
    `${params.blockId}:${dayStartMs}:${params.cardType}:${ordinal}:${salt}`
  )
  const rand = mulberry32(seed)()

  if (params.isNew) {
    const maxForward = getNewForwardMaxDays(params.cardType, base, priority)
    return rand * maxForward
  }

  const maxAbs = getNonNewMaxAbsDays(params.cardType, base, priority)
  return (rand * 2 - 1) * maxAbs
}

/**
 * Compat: intentional cadence only. Returns `baseIntervalDays` (finite fallback 1);
 * **no random**. Production scheduling uses `computeDispersalOffsetDays` +
 * `computeDispersedSchedule` so jitter lands only on `due`.
 *
 * Still ignores `queueDelayDays` if passed.
 */
export function computeDispersedIntervalDays(params: CompatDispersalParams): number {
  void params.queueDelayDays
  void params.blockId
  void params.cardType
  void params.baseDate
  void params.isNew
  void params.seedSalt
  void params.priority
  void params.scheduleOrdinal
  return Number.isFinite(params.baseIntervalDays) ? params.baseIntervalDays : 1
}
