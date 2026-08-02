/**
 * Flash Home 批量 TTS：过滤 / 去重 / 有界并发 / 取消。
 */

import type { ReviewCard } from "../types"
import {
  cardKeyFromReviewCard,
  inferCardType
} from "../cardIdentity"
import {
  generateTtsAudio,
  TtsGenerateError,
  type GenerateTtsAudioOptions,
  type TtsGenerateResult
} from "./ttsGenerate"

/** 批量默认并发（F0 额度友好） */
export const TTS_BATCH_CONCURRENCY = 2

export type TtsBatchItemStatus =
  | "pending"
  | "running"
  | "success"
  | "skipped"
  | "failed"
  | "cancelled"

export type TtsBatchItem = {
  cardKey: string
  blockId: number
  front: string
  status: TtsBatchItemStatus
  error?: string
  result?: TtsGenerateResult
}

export type TtsBatchProgress = {
  total: number
  success: number
  skipped: number
  failed: number
  cancelled: number
  remaining: number
  items: readonly TtsBatchItem[]
}

export type TtsBatchFilterResult = {
  eligible: ReviewCard[]
  skippedNonBasic: number
  skippedEmptyFront: number
  /** cardKey 去重后丢弃的重复数 */
  skippedDuplicate: number
}

/**
 * 仅 Basic 卡可批量；按 cardKey 去重；空 front 跳过。
 */
export function filterBasicCardsForTtsBatch(
  cards: ReadonlyArray<ReviewCard>
): TtsBatchFilterResult {
  let skippedNonBasic = 0
  let skippedEmptyFront = 0
  let skippedDuplicate = 0
  const seen = new Set<string>()
  const eligible: ReviewCard[] = []

  for (const card of cards) {
    const type = inferCardType(card)
    if (type !== "basic") {
      skippedNonBasic += 1
      continue
    }
    const front = (card.front ?? "").trim()
    if (!front) {
      skippedEmptyFront += 1
      continue
    }
    let key: string
    try {
      key = cardKeyFromReviewCard(card)
    } catch (error) {
      // 身份不完整视为不可处理，计入 non-basic 侧统计并可见
      console.warn("[TTS Batch] 无法生成 cardKey，跳过:", error)
      skippedNonBasic += 1
      continue
    }
    if (seen.has(key)) {
      skippedDuplicate += 1
      continue
    }
    seen.add(key)
    eligible.push(card)
  }

  return {
    eligible,
    skippedNonBasic,
    skippedEmptyFront,
    skippedDuplicate
  }
}

export function buildBatchItems(
  cards: ReadonlyArray<ReviewCard>
): TtsBatchItem[] {
  return cards.map((card) => ({
    cardKey: cardKeyFromReviewCard(card),
    blockId: Number(card.id),
    front: (card.front ?? "").trim(),
    status: "pending" as const
  }))
}

export function summarizeBatchProgress(
  items: ReadonlyArray<TtsBatchItem>
): TtsBatchProgress {
  let success = 0
  let skipped = 0
  let failed = 0
  let cancelled = 0
  let remaining = 0
  for (const item of items) {
    switch (item.status) {
      case "success":
        success += 1
        break
      case "skipped":
        skipped += 1
        break
      case "failed":
        failed += 1
        break
      case "cancelled":
        cancelled += 1
        break
      case "pending":
      case "running":
        remaining += 1
        break
    }
  }
  return {
    total: items.length,
    success,
    skipped,
    failed,
    cancelled,
    remaining,
    items
  }
}

export type RunTtsBatchOptions = {
  pluginName: string
  items: TtsBatchItem[]
  mode?: "skip_existing" | "regenerate"
  concurrency?: number
  signal?: AbortSignal
  onProgress?: (progress: TtsBatchProgress) => void
  /** 透传 generate 测试钩子 */
  generateOptions?: Partial<
    Pick<
      GenerateTtsAudioOptions,
      | "fetchImpl"
      | "uploadAsset"
      | "insertAudioBlock"
      | "loadBlock"
      | "settingsOverride"
    >
  >
}

/**
 * 有界 worker pool 跑批量 TTS。
 * - 取消：未开始的 pending → cancelled；已完成保留
 * - 禁止对全部 items 做无界 Promise.all
 */
export async function runTtsBatch(
  options: RunTtsBatchOptions
): Promise<TtsBatchProgress> {
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? TTS_BATCH_CONCURRENCY, 4)
  )
  const items = options.items
  const emit = () => {
    options.onProgress?.(summarizeBatchProgress(items))
  }

  if (options.signal?.aborted) {
    for (const item of items) {
      if (item.status === "pending") item.status = "cancelled"
    }
    emit()
    return summarizeBatchProgress(items)
  }

  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (true) {
      if (options.signal?.aborted) {
        // 标记剩余 pending
        for (let i = nextIndex; i < items.length; i++) {
          if (items[i].status === "pending") {
            items[i].status = "cancelled"
          }
        }
        emit()
        return
      }

      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return

      const item = items[index]
      if (item.status !== "pending") continue

      item.status = "running"
      emit()

      try {
        const result = await generateTtsAudio({
          pluginName: options.pluginName,
          targetBlockId: item.blockId,
          targetKey: item.cardKey,
          text: item.front,
          insertAfterBlockId: item.blockId,
          mode: options.mode ?? "skip_existing",
          signal: options.signal,
          ...options.generateOptions
        })
        item.result = result
        if (result.status === "skipped") {
          item.status = "skipped"
        } else {
          item.status = "success"
        }
      } catch (error) {
        if (options.signal?.aborted) {
          item.status = "cancelled"
          item.error = "已取消"
        } else {
          item.status = "failed"
          item.error =
            error instanceof TtsGenerateError
              ? `[${error.step}] ${error.message}`
              : error instanceof Error
                ? error.message
                : String(error)
        }
      }
      emit()
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    () => worker()
  )
  await Promise.all(workers)

  // 二次确保：abort 后仍 pending 的标记 cancelled
  if (options.signal?.aborted) {
    for (const item of items) {
      if (item.status === "pending" || item.status === "running") {
        item.status = "cancelled"
      }
    }
  }

  emit()
  return summarizeBatchProgress(items)
}

/**
 * 仅重试 failed 项：重置为 pending 后再次 run。
 */
export async function retryFailedTtsBatch(
  options: RunTtsBatchOptions
): Promise<TtsBatchProgress> {
  for (const item of options.items) {
    if (item.status === "failed") {
      item.status = "pending"
      item.error = undefined
      item.result = undefined
    }
  }
  return runTtsBatch(options)
}
