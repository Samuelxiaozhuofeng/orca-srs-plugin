/**
 * 共享测试夹具（不计入生产包职责）
 */

import type { IRCard } from "../incrementalReadingCollector"
import { DEFAULT_QUEUE_POLICY } from "./irQueuePolicy"
import type { selectQueueWithPolicy } from "./irQueuePolicy"

export function card(
  partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">
): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType,
    priority: partial.priority ?? 50,
    position: partial.position ?? (partial.cardType === "topic" ? 1 : null),
    due: partial.due ?? new Date("2026-01-19T08:00:00"),
    intervalDays: partial.intervalDays ?? 5,
    postponeCount: partial.postponeCount ?? 0,
    stage: partial.cardType === "topic" ? "topic.preview" : "extract.raw",
    lastAction: "init",
    lastRead: partial.lastRead ?? null,
    readCount: partial.readCount ?? 0,
    isNew: partial.isNew ?? true,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

export function baseConfig(
  overrides: Partial<Parameters<typeof selectQueueWithPolicy>[1]> = {}
) {
  return {
    ...DEFAULT_QUEUE_POLICY,
    timeBudgetMinutes: 20,
    dailyLimit: 20,
    seed: "2026-01-20",
    ...overrides
  }
}

export const now = new Date("2026-01-20T12:00:00")
