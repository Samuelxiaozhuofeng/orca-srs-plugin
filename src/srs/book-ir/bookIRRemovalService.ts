/**
 * Chapter / whole-book IR removal. Preserves notes, assets, epub.* provenance.
 * Never deletes book/chapter blocks or uses batchId as book identity.
 */

import type { Block, DbId } from "../../orca.d.ts"
import type { BookIRMutationResult, BookIRPlanV1 } from "../../importers/epub/types"
import { completeIRCard } from "../irSessionActions"
import {
  clearBookIRPlan,
  loadBookIRPlan,
  saveBookIRPlan
} from "./bookIRPlanRepository"
import { EPUB_PROP } from "../../importers/epub/types"
import { getImportedChaptersFromManifest } from "../../importers/epub/epubManifestChapters"
import { isCardTag } from "../tagUtils"

async function getBlock(blockId: DbId): Promise<Block | undefined> {
  return (
    (orca.state.blocks?.[blockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)
  )
}

/**
 * Clear IR/SRS card state from a chapter while preserving epub.* and content.
 */
export async function stripChapterIR(
  chapterId: DbId,
  pluginName: string
): Promise<void> {
  // completeIRCard removes #card, srs.*, ir.*, and IR index — content/epub.* remain
  try {
    await completeIRCard(chapterId, pluginName)
  } catch (error) {
    // If block has no IR state, treat as success only when no card tag either
    const block = await getBlock(chapterId)
    const hasCard = block?.refs?.some((r) => r.type === 2 && isCardTag(r.alias)) ?? false
    const hasIr = block?.properties?.some((p) => p.name.startsWith("ir.")) ?? false
    if (hasCard || hasIr) {
      throw error
    }
  }
}

export async function removeChaptersFromIR(
  bookBlockId: DbId,
  chapterIds: DbId[],
  options: {
    pluginName?: string
    /**
     * When true and the active sequential chapter is among targets,
     * do NOT auto-advance; mark sequence paused.
     */
    pauseSequenceIfActiveRemoved?: boolean
  } = {}
): Promise<BookIRMutationResult> {
  const pluginName = options.pluginName || "orca-srs"
  const plan = await loadBookIRPlan(bookBlockId)
  const uniqueIds = Array.from(new Set(chapterIds.filter((id) => typeof id === "number")))

  const results = await Promise.allSettled(
    uniqueIds.map(async (id) => {
      await stripChapterIR(id, pluginName)
      return id
    })
  )

  const success: DbId[] = []
  const failed: BookIRMutationResult["failed"] = []

  results.forEach((result, index) => {
    const id = uniqueIds[index]
    if (result.status === "fulfilled") {
      success.push(id)
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      failed.push({ chapterId: id, ok: false, error: message })
    }
  })

  let nextPlan: BookIRPlanV1 | null = plan
  let sequentialPaused = false

  if (plan) {
    nextPlan = {
      ...plan,
      outcomes: { ...plan.outcomes },
      lastError: failed.length > 0 ? `部分移出失败 ${failed.length}` : plan.lastError
    }
    for (const id of success) {
      nextPlan.outcomes[String(id)] = "removed"
    }

    if (
      plan.mode === "sequential"
      && plan.activeChapterId != null
      && success.includes(plan.activeChapterId)
    ) {
      // Ordinary batch removal does not silently advance
      nextPlan.activeChapterId = null
      sequentialPaused = true
    }

    // If all selected chapters removed and no failures, clear plan
    const remainingActive = plan.selectedChapterIds.some((id) => {
      if (success.includes(id)) return false
      const o = nextPlan!.outcomes[String(id)]
      return o !== "removed" && o !== "completed" && o !== "skipped"
    })

    if (!remainingActive && failed.length === 0) {
      await clearBookIRPlan(bookBlockId)
      nextPlan = null
      sequentialPaused = false
    } else {
      await saveBookIRPlan(bookBlockId, nextPlan)
    }
  }

  return {
    kind: failed.length === 0 ? "removed" : "partial",
    bookBlockId,
    plan: nextPlan,
    success,
    failed,
    sequentialPaused,
    message:
      failed.length === 0
        ? sequentialPaused
          ? `已移出 ${success.length} 章；顺序阅读已暂停（未自动解锁下一章）`
          : `已移出 ${success.length} 章，笔记内容已保留`
        : `移出成功 ${success.length}，失败 ${failed.length}`
  }
}

/**
 * Remove whole book from IR using stable bookBlockId + plan (not batchId).
 */
export async function removeBookFromIR(
  bookBlockId: DbId,
  pluginName = "orca-srs"
): Promise<BookIRMutationResult> {
  const plan = await loadBookIRPlan(bookBlockId)

  // Resolve all chapter targets from plan, or fall back to epub.bookId property scan
  let targets: DbId[] = []
  if (plan) {
    targets = plan.selectedChapterIds.filter((id) => {
      const o = plan.outcomes[String(id)]
      return o !== "removed"
    })
  } else {
    targets = await findChapterIdsForBook(bookBlockId)
  }

  if (targets.length === 0) {
    if (plan) {
      await clearBookIRPlan(bookBlockId)
    }
    return {
      kind: "removed",
      bookBlockId,
      plan: null,
      success: [],
      failed: [],
      message: "没有需要移出的章节"
    }
  }

  const results = await Promise.allSettled(
    targets.map(async (id) => {
      await stripChapterIR(id, pluginName)
      return id
    })
  )

  const success: DbId[] = []
  const failed: BookIRMutationResult["failed"] = []
  results.forEach((result, index) => {
    const id = targets[index]
    if (result.status === "fulfilled") success.push(id)
    else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      failed.push({ chapterId: id, ok: false, error: message })
    }
  })

  if (failed.length === 0) {
    await clearBookIRPlan(bookBlockId)
    return {
      kind: "removed",
      bookBlockId,
      plan: null,
      success,
      failed: [],
      message: `已将整本书移出渐进阅读（${success.length} 章），笔记已保留`
    }
  }

  // Partial: keep plan with failure details
  let nextPlan = plan
  if (plan) {
    nextPlan = {
      ...plan,
      outcomes: { ...plan.outcomes },
      lastError: `整本移出部分失败: ${failed.map((f) => f.chapterId).join(",")}`,
      activeChapterId:
        plan.activeChapterId != null && success.includes(plan.activeChapterId)
          ? null
          : plan.activeChapterId
    }
    for (const id of success) {
      nextPlan.outcomes[String(id)] = "removed"
    }
    await saveBookIRPlan(bookBlockId, nextPlan)
  }

  return {
    kind: "partial",
    bookBlockId,
    plan: nextPlan,
    success,
    failed,
    message: `整本移出成功 ${success.length}，失败 ${failed.length}，可重试失败项`
  }
}

async function findChapterIdsForBook(bookBlockId: DbId): Promise<DbId[]> {
  const book = await getBlock(bookBlockId)
  const hasManifest = book?.properties?.some((p) => p.name === EPUB_PROP.manifest) ?? false
  if (hasManifest) {
    const { chapters } = await getImportedChaptersFromManifest(bookBlockId)
    return chapters.map((chapter) => chapter.blockId)
  }

  const ids: DbId[] = []
  const blocks = orca.state.blocks ?? {}
  for (const key of Object.keys(blocks)) {
    const block = blocks[key as unknown as number] as Block | undefined
    if (!block) continue
    const owner = block.properties?.find((p) => p.name === EPUB_PROP.bookId)?.value
    if (owner === bookBlockId) {
      ids.push(block.id)
    }
  }
  return ids
}

/**
 * Retry only previously failed chapter ids for book removal.
 */
export async function retryRemoveChaptersFromIR(
  bookBlockId: DbId,
  failedChapterIds: DbId[],
  pluginName = "orca-srs"
): Promise<BookIRMutationResult> {
  return removeChaptersFromIR(bookBlockId, failedChapterIds, { pluginName })
}
