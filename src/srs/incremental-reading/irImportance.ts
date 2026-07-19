/**
 * IR importance: user-facing tiers + mid-reading nudges.
 * Storage remains continuous `ir.priority` 0–100 (higher = more important).
 * Absolute tiers reuse `tierToPriority` / `priorityToTier` (20 / 50 / 80).
 */

import { DEFAULT_IR_PRIORITY, normalizePriority } from "../incrementalReadingScheduler"
import { priorityToTier, tierToPriority } from "./irQueuePolicy"
import type { IRPriorityTier } from "./irTypes"

/** Mid-reading nudge step (product decision). */
export const IR_IMPORTANCE_NUDGE_STEP = 15

export type ImportanceNudgeDirection = "down" | "up" | "reset"

export type ImportanceNudgeResult = {
  nextPriority: number
  previousPriority: number
  changed: boolean
  /** True when already at floor/ceiling and direction could not apply. */
  blockedAtBound: boolean
  tier: IRPriorityTier
}

/** Absolute setup options (import / book create). */
export const IMPORTANCE_SETUP_TIERS: readonly IRPriorityTier[] = ["low", "medium", "high"]

export function importanceFromTier(tier: IRPriorityTier): number {
  return tierToPriority(tier)
}

export function importanceToTier(priority: number): IRPriorityTier {
  return priorityToTier(priority)
}

/** Scene-oriented short label for tier (no raw numbers). */
export function formatImportanceTierLabel(tier: IRPriorityTier): string {
  if (tier === "high") return "很重要"
  if (tier === "medium") return "正常"
  return "想读但不急"
}

/** One-character / compact toolbar label. */
export function formatImportanceTierCompact(tier: IRPriorityTier): string {
  if (tier === "high") return "高"
  if (tier === "medium") return "中"
  return "低"
}

export function formatImportanceTierLabelFromPriority(priority: number): string {
  return formatImportanceTierLabel(importanceToTier(priority))
}

/**
 * Apply mid-reading importance change.
 * - down/up: ± IR_IMPORTANCE_NUDGE_STEP, clamped 0–100
 * - reset: DEFAULT_IR_PRIORITY (50)
 */
export function applyImportanceNudge(
  currentPriority: number,
  direction: ImportanceNudgeDirection
): ImportanceNudgeResult {
  const previousPriority = normalizePriority(currentPriority)

  if (direction === "reset") {
    const nextPriority = DEFAULT_IR_PRIORITY
    return {
      nextPriority,
      previousPriority,
      changed: nextPriority !== previousPriority,
      blockedAtBound: false,
      tier: importanceToTier(nextPriority)
    }
  }

  const delta = direction === "up" ? IR_IMPORTANCE_NUDGE_STEP : -IR_IMPORTANCE_NUDGE_STEP
  const raw = previousPriority + delta
  const nextPriority = normalizePriority(raw)
  const blockedAtBound = nextPriority === previousPriority
  return {
    nextPriority,
    previousPriority,
    changed: !blockedAtBound,
    blockedAtBound,
    tier: importanceToTier(nextPriority)
  }
}

export function importanceSetupOptions(): Array<{
  tier: IRPriorityTier
  priority: number
  title: string
  scene: string
  recommended?: boolean
}> {
  return [
    {
      tier: "low",
      priority: tierToPriority("low"),
      title: "想读，但不急",
      scene: "收藏了，慢慢看"
    },
    {
      tier: "medium",
      priority: tierToPriority("medium"),
      title: "正常阅读",
      scene: "多数书用这个",
      recommended: true
    },
    {
      tier: "high",
      priority: tierToPriority("high"),
      title: "近期要啃完 / 很重要",
      scene: "主读、考试、工作相关"
    }
  ]
}

export { DEFAULT_IR_PRIORITY }
