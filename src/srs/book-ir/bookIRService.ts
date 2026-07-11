/**
 * Book IR initialization: distributed and sequential modes.
 */

import type { DbId } from "../../orca.d.ts"
import type {
  BookIRMutationResult,
  BookIRPlanV1,
  InitializeBookIRRequest
} from "../../importers/epub/types"
import { calculateChapterDueDates } from "../bookIRCreator"
import { initializeChapterAsTopicIR } from "./bookIRChapterInit"
import { loadBookIRPlan, saveBookIRPlan } from "./bookIRPlanRepository"
import { retrySequentialActivation } from "./bookIRProgression"

function createIRBatchId(): string {
  return `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function initializeBookIR(
  request: InitializeBookIRRequest
): Promise<BookIRMutationResult> {
  const chapterIds = Array.isArray(request.chapterIds)
    ? request.chapterIds.filter((id) => typeof id === "number")
    : []

  if (chapterIds.length === 0) {
    return {
      kind: "initialized",
      bookBlockId: request.bookBlockId,
      plan: null,
      success: [],
      failed: [],
      message: "未选择章节，保持普通笔记"
    }
  }

  const pluginName = request.pluginName || "orca-srs"
  const outcomes: BookIRPlanV1["outcomes"] = {}
  for (const id of chapterIds) {
    outcomes[String(id)] = "pending"
  }

  const plan: BookIRPlanV1 = {
    version: 1,
    bookBlockId: request.bookBlockId,
    mode: request.mode,
    priority: request.priority,
    totalDays: request.totalDays,
    selectedChapterIds: [...chapterIds],
    activeChapterId: null,
    outcomes,
    lastError: null
  }

  const success: DbId[] = []
  const failed: BookIRMutationResult["failed"] = []
  const positionBase = Date.now()
  const batchId = createIRBatchId()
  const batchCreatedAt = new Date()

  if (request.mode === "distributed") {
    const dueDates = calculateChapterDueDates(chapterIds.length, request.totalDays)
    for (let i = 0; i < chapterIds.length; i++) {
      const blockId = chapterIds[i]
      try {
        await initializeChapterAsTopicIR(blockId, {
          pluginName,
          sourceBookId: request.bookBlockId,
          sourceBookTitle: request.bookTitle,
          priority: request.priority,
          due: dueDates[i] ?? new Date(),
          position: positionBase + i,
          batchId,
          batchCreatedAt
        })
        outcomes[String(blockId)] = "active"
        success.push(blockId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[BookIR] distributed init failed:", blockId, error)
        failed.push({ chapterId: blockId, ok: false, error: message })
      }
    }
    plan.activeChapterId = success[0] ?? null
  } else {
    const firstId = chapterIds[0]
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      await initializeChapterAsTopicIR(firstId, {
        pluginName,
        sourceBookId: request.bookBlockId,
        sourceBookTitle: request.bookTitle,
        priority: request.priority,
        due: today,
        position: positionBase,
        batchId,
        batchCreatedAt
      })
      outcomes[String(firstId)] = "active"
      plan.activeChapterId = firstId
      success.push(firstId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failed.push({ chapterId: firstId, ok: false, error: message })
      plan.lastError = message
    }
  }

  await saveBookIRPlan(request.bookBlockId, plan)

  return {
    kind: failed.length === 0 ? "initialized" : "partial",
    bookBlockId: request.bookBlockId,
    plan,
    success,
    failed,
    message:
      failed.length === 0
        ? request.mode === "sequential"
          ? `已创建顺序解锁计划，当前章节 #${plan.activeChapterId}`
          : `已初始化 ${success.length} 个章节（分散排期）`
        : `成功 ${success.length}，失败 ${failed.length}（可重试失败项）`
  }
}

/**
 * Retry only chapters still pending (or never activated) on an existing plan.
 * Does NOT replace the plan or drop successful outcomes.
 */
export async function retryFailedBookIRInit(
  bookBlockId: DbId,
  bookTitle: string,
  _plan?: BookIRPlanV1 | null,
  pluginName = "orca-srs"
): Promise<BookIRMutationResult> {
  // Always reload the checkpoint. UI snapshots can be stale after another action or restart.
  const current = await loadBookIRPlan(bookBlockId)
  if (!current) {
    return {
      kind: "partial",
      bookBlockId,
      plan: null,
      success: [],
      failed: [],
      message: "没有可重试的阅读计划"
    }
  }

  if (current.mode === "sequential") {
    if (current.activeChapterId != null) {
      return {
        kind: "initialized",
        bookBlockId,
        plan: current,
        success: [],
        failed: [],
        message: "顺序模式已有激活章节"
      }
    }
    // First pending may never have been activated, or next activation failed
    return retrySequentialActivation(bookBlockId, pluginName)
  }

  // Distributed: init only still-pending selected chapters; keep existing outcomes
  const pendingIds = current.selectedChapterIds.filter((id) => {
    const outcome = current.outcomes[String(id)]
    return outcome === "pending" || outcome === undefined
  })

  if (pendingIds.length === 0) {
    return {
      kind: "initialized",
      bookBlockId,
      plan: current,
      success: [],
      failed: [],
      message: "没有待重试章节"
    }
  }

  const nextPlan: BookIRPlanV1 = {
    ...current,
    outcomes: { ...current.outcomes },
    lastError: null
  }
  const success: DbId[] = []
  const failed: BookIRMutationResult["failed"] = []
  const positionBase = Date.now()
  const batchId = createIRBatchId()
  const batchCreatedAt = new Date()
  const dueDates = calculateChapterDueDates(pendingIds.length, current.totalDays)

  for (let i = 0; i < pendingIds.length; i++) {
    const blockId = pendingIds[i]
    try {
      await initializeChapterAsTopicIR(blockId, {
        pluginName,
        sourceBookId: bookBlockId,
        sourceBookTitle: bookTitle,
        priority: current.priority,
        due: dueDates[i] ?? new Date(),
        position: positionBase + i,
        batchId,
        batchCreatedAt
      })
      nextPlan.outcomes[String(blockId)] = "active"
      success.push(blockId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failed.push({ chapterId: blockId, ok: false, error: message })
    }
  }

  if (nextPlan.activeChapterId == null && success.length > 0) {
    nextPlan.activeChapterId = success[0]
  }
  if (failed.length > 0) {
    nextPlan.lastError = `重试仍有 ${failed.length} 章失败`
  }

  await saveBookIRPlan(bookBlockId, nextPlan)

  return {
    kind: failed.length === 0 ? "initialized" : "partial",
    bookBlockId,
    plan: nextPlan,
    success,
    failed,
    message:
      failed.length === 0
        ? `重试成功 ${success.length} 章`
        : `重试成功 ${success.length}，仍失败 ${failed.length}`
  }
}
