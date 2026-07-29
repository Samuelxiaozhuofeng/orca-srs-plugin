/**
 * 新卡首次 due（Initial Due）策略
 *
 * 只决定「第一次写入 due」；不改 FSRS 评分、不写 srs.interval。
 * - standard / legacy：保持各 creator 既有分天/现在 due
 * - ir_item + dispersed：Topic/Extract 源生记忆卡，按 priority 在 1..14 天内稳定分散
 *
 * 仅影响升级后的新初始化；已有 srs.* 属性的卡不会被 ensure 覆盖。
 */

import type { CardIdentity } from "./cardIdentity"
import { buildCardKey } from "./cardIdentity"

export const INITIAL_DUE_POLICY_VERSION = 1 as const

/** IR Item 分散窗口（用户拍板：1..14 天） */
export const IR_ITEM_DISPERSED_MIN_DAYS = 1
export const IR_ITEM_DISPERSED_MAX_DAYS = 14

export type InitialDueOrigin = "standard" | "ir_item"

/**
 * IR Item 可用模式。
 * standard 路径固定走 legacyDue，不读此设置。
 */
export type IrItemInitialDueMode = "dispersed" | "today" | "tomorrow"

export type InitialDueMode = "legacy" | IrItemInitialDueMode

export type InitialDueResolution = {
  due: Date
  effectiveMode: InitialDueMode
  /** 相对 createdAt 的天数偏移（诊断 / toast） */
  delayDays: number
  policyVersion: typeof INITIAL_DUE_POLICY_VERSION
}

export type ResolveInitialDueInput = {
  origin: InitialDueOrigin
  /** ir_item 时生效；standard 忽略并强制 legacy */
  mode: IrItemInitialDueMode
  identity: CardIdentity
  createdAt: Date
  /** 兼容路径已算好的 due（cloze n-1、basic now 等） */
  legacyDue: Date
  /** 0..100，数值越大越优先；仅 dispersed 使用 */
  priority?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 本地自然日 YYYY-MM-DD（与 IR 队列 seed 一致） */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addLocalDays(base: Date, days: number): Date {
  const d = startOfLocalDay(base)
  d.setDate(d.getDate() + days)
  return d
}

/** legacy：今天 + 整天偏移（零点） */
export function computeLegacyDueFromDaysOffset(
  createdAt: Date,
  daysOffset: number
): Date {
  const offset = Number.isFinite(daysOffset) ? Math.max(0, Math.floor(daysOffset)) : 0
  return addLocalDays(createdAt, offset)
}

export function isIrItemSourceCardType(cardType: string): boolean {
  return cardType === "topic" || cardType === "extracts"
}

/**
 * Topic / Extract 上制卡，或 keep_extract 后仍带 live IR 的块上继续挖空。
 */
export function shouldUseIrItemInitialDue(
  cardType: string,
  hasLiveIR: boolean
): boolean {
  if (isIrItemSourceCardType(cardType)) return true
  return hasLiveIR === true
}

/** FNV-1a 32-bit → [0, 1) */
export function stableHash01(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 4294967296
}

export function clampPriority(priority: number | undefined): number {
  if (priority == null || !Number.isFinite(priority)) return 50
  return Math.min(100, Math.max(0, priority))
}

/**
 * priority 100 → 恰好 1 天；priority 0 → [1, 14] 天；中间二次收缩。
 * q = (1-p)^2 使高优先更贴近日 1，低优先拉宽。
 */
export function computeDispersedDelayDays(params: {
  priority: number
  cardKey: string
  createdAt: Date
}): number {
  const p = clampPriority(params.priority) / 100
  const q = (1 - p) ** 2
  const minDays =
    IR_ITEM_DISPERSED_MIN_DAYS
    + (4 - IR_ITEM_DISPERSED_MIN_DAYS) * q
  const maxDays =
    IR_ITEM_DISPERSED_MIN_DAYS
    + (IR_ITEM_DISPERSED_MAX_DAYS - IR_ITEM_DISPERSED_MIN_DAYS) * q
  const lo = Math.min(minDays, maxDays)
  const hi = Math.max(minDays, maxDays)
  const dateKey = formatLocalDateKey(params.createdAt)
  const u = stableHash01(
    `srs-initial-due:v${INITIAL_DUE_POLICY_VERSION}|${params.cardKey}|${dateKey}`
  )
  const delay = lo + u * (hi - lo)
  // 硬保证 ≥ 1 天，且不超过窗口上沿
  return Math.min(
    IR_ITEM_DISPERSED_MAX_DAYS,
    Math.max(IR_ITEM_DISPERSED_MIN_DAYS, delay)
  )
}

/**
 * 解析首次 due。standard 一律 legacyDue；ir_item 按 mode。
 * seed 仅经 buildCardKey(identity)，禁止外部 salt。
 */
export function resolveInitialDue(
  input: ResolveInitialDueInput
): InitialDueResolution {
  if (input.origin === "standard") {
    return {
      due: new Date(input.legacyDue.getTime()),
      effectiveMode: "legacy",
      delayDays: delayDaysBetween(input.createdAt, input.legacyDue),
      policyVersion: INITIAL_DUE_POLICY_VERSION
    }
  }

  const mode = input.mode
  if (mode === "today") {
    const due = startOfLocalDay(input.createdAt)
    return {
      due,
      effectiveMode: "today",
      delayDays: 0,
      policyVersion: INITIAL_DUE_POLICY_VERSION
    }
  }
  if (mode === "tomorrow") {
    const due = addLocalDays(input.createdAt, 1)
    return {
      due,
      effectiveMode: "tomorrow",
      delayDays: 1,
      policyVersion: INITIAL_DUE_POLICY_VERSION
    }
  }

  // dispersed
  const cardKey = buildCardKey(input.identity)
  const delayDays = computeDispersedDelayDays({
    priority: clampPriority(input.priority),
    cardKey,
    createdAt: input.createdAt
  })
  // 用毫秒偏移保留小数天，避免全部落到整点自然日
  const due = new Date(input.createdAt.getTime() + delayDays * DAY_MS)
  return {
    due,
    effectiveMode: "dispersed",
    delayDays,
    policyVersion: INITIAL_DUE_POLICY_VERSION
  }
}

function delayDaysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS
}

/** toast / 列表用的人类可读首次学习提示 */
export function formatInitialDueHint(
  resolution: Pick<InitialDueResolution, "delayDays" | "due" | "effectiveMode">,
  now: Date = new Date()
): string {
  if (resolution.effectiveMode === "legacy") {
    if (resolution.delayDays < 0.5) return "今天可学"
    if (resolution.delayDays < 1.5) return "明天可学"
    return `约 ${Math.round(resolution.delayDays)} 天后可学`
  }
  if (resolution.effectiveMode === "today") return "今天可学"
  if (resolution.effectiveMode === "tomorrow") return "明天可学"
  const days = Math.max(1, Math.round(resolution.delayDays))
  const month = resolution.due.getMonth() + 1
  const day = resolution.due.getDate()
  if (resolution.due.getTime() <= now.getTime()) {
    return "今天可学"
  }
  return `首次学习约 ${days} 天后（${month}月${day}日）`
}
