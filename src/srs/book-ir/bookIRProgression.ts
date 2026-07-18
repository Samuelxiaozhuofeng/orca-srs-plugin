/**
 * Sequential book progression: complete / skip current chapter and unlock next.
 * Read / postpone / priority must NEVER call this service.
 *
 * State machine (checkpointed) — activate-before-strip:
 * 1. Validate active chapter against plan
 * 2. Find next pending chapter (if any)
 * 3. Initialize next as the sole future IR Topic card (if any)
 * 4. Persist plan: current outcome recorded, activeChapterId = next (or null)
 * 5. Strip current chapter IR identity
 *
 * Why not strip first: sequential mode keeps only one live IR card. Completing the
 * current chapter before next activation leaves a zero-IR window; if next init then
 * fails, the book vanishes from the review queue and library discovery (which
 * depends on live sourceBookId cards). Activate-before-strip keeps at least one
 * IR card for the book whenever a next chapter exists.
 *
 * If step 4 fails after step 3, next has IR but plan may lag —
 * retrySequentialActivation detects that and repairs the plan.
 * If step 5 fails after step 4, plan already points at next; current strip can be
 * retried via plain completeIRCard (activeChapterId !== current → not sequential).
 */

import type { Block, DbId } from "../../orca.d.ts"
import type {
  AdvanceSequentialBookRequest,
  BookIRMutationResult,
  BookIRPlanV1,
  NextChapterSchedule
} from "../../importers/epub/types"
import { completeIRCard } from "../irSessionActions"
import { loadBookIRPlan, saveBookIRPlan } from "./bookIRPlanRepository"
import {
  ensureChapterCardTag,
  initializeChapterAsTopicIR
} from "./bookIRChapterInit"
import { EpubValidationError } from "../../importers/epub/types"
import { isCardTag } from "../tagUtils"

/**
 * Resolve next-chapter due date for sequential unlock.
 * - today: start of local today (immediately due / in today's IR queue)
 * - tomorrow: start of local tomorrow (active in plan, not due today)
 */
export function resolveNextChapterDue(
  schedule: NextChapterSchedule = "today",
  now: Date = new Date()
): Date {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (schedule === "tomorrow") {
    due.setDate(due.getDate() + 1)
  }
  return due
}

/**
 * Complete or skip the active sequential chapter and activate the next pending one.
 */
export async function advanceSequentialBook(
  request: AdvanceSequentialBookRequest
): Promise<BookIRMutationResult> {
  const pluginName = request.pluginName || "orca-srs"
  const nextChapterSchedule: NextChapterSchedule = request.nextChapterSchedule ?? "today"
  const plan = await loadBookIRPlan(request.bookBlockId)
  if (!plan) {
    throw new EpubValidationError(
      `Book #${request.bookBlockId} 没有 ir.bookPlan，无法顺序推进`,
      "plan_missing",
      request.bookBlockId
    )
  }

  if (plan.mode !== "sequential") {
    throw new EpubValidationError(
      `Book #${request.bookBlockId} 不是顺序解锁模式`,
      "plan_mode",
      request.bookBlockId
    )
  }

  if (plan.activeChapterId !== request.chapterId) {
    throw new EpubValidationError(
      `章节 #${request.chapterId} 不是当前激活章（active=${plan.activeChapterId}）`,
      "not_active",
      request.bookBlockId
    )
  }

  const nextId = plan.selectedChapterIds.find((id) => {
    if (id === request.chapterId) return false
    const o = plan.outcomes[String(id)]
    return o === "pending" || o === undefined
  })

  // Activate next BEFORE stripping current — avoids zero-IR window for the book.
  if (nextId != null) {
    try {
      const due = resolveNextChapterDue(nextChapterSchedule)
      const sourceBookTitle = await resolveSequentialBookTitle(
        request.bookBlockId,
        request.chapterId
      )
      await initializeChapterAsTopicIR(nextId, {
        pluginName,
        sourceBookId: request.bookBlockId,
        sourceBookTitle,
        priority: plan.priority,
        due,
        position: Date.now()
      })
    } catch (error) {
      // No plan mutation and current chapter untouched — surface failure clearly.
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `激活下一章 #${nextId} 失败，当前章未完成清理: ${message}`
      )
    }
  }

  const afterAdvance: BookIRPlanV1 = {
    ...plan,
    outcomes: {
      ...plan.outcomes,
      [String(request.chapterId)]: request.outcome,
      ...(nextId != null ? { [String(nextId)]: "active" as const } : {})
    },
    activeChapterId: nextId ?? null,
    lastError: null
  }

  try {
    await saveBookIRPlan(request.bookBlockId, afterAdvance)
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : String(saveError)
    if (nextId != null) {
      // Next is already in IR queue; clear active so retrySequentialActivation can
      // reconcile (it only repairs when activeChapterId == null + next has live IR).
      // Current chapter outcome stays "active" until a successful strip path.
      const broken: BookIRPlanV1 = {
        ...plan,
        outcomes: {
          ...plan.outcomes,
          [String(nextId)]: "pending"
        },
        activeChapterId: null,
        lastError: `下一章已激活但计划保存失败: ${message}`
      }
      try {
        await saveBookIRPlan(request.bookBlockId, broken)
      } catch {
        // best-effort error record; still surface partial
      }
      return {
        kind: "partial",
        bookBlockId: request.bookBlockId,
        plan: broken,
        success: [nextId],
        failed: [{ chapterId: nextId, ok: false, error: message }],
        message: `下一章已写入 IR，但计划保存失败，请重试激活。当前章尚未清理: ${message}`
      }
    }
    throw saveError
  }

  // Strip current chapter card/SRS/IR (epub.* retained). Only this chapterId.
  try {
    await completeIRCard(request.chapterId, pluginName)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedPlan: BookIRPlanV1 = {
      ...afterAdvance,
      lastError: `下一章已激活但清理当前章失败: ${message}`
    }
    try {
      await saveBookIRPlan(request.bookBlockId, failedPlan)
    } catch (recordError) {
      console.error("[BookIR] failed to record strip failure on plan:", recordError)
    }
    return {
      kind: "partial",
      bookBlockId: request.bookBlockId,
      plan: failedPlan,
      success: nextId != null ? [nextId] : [],
      failed: [{ chapterId: request.chapterId, ok: false, error: message }],
      message:
        nextId != null
          ? `已解锁下一章 #${nextId}，但清理当前章失败: ${message}`
          : `计划已更新，但清理当前章失败: ${message}`
    }
  }

  if (nextId != null) {
    try {
      // Orca may lose the newly inserted same-name tag when the previous chapter's
      // #card is removed immediately afterwards. Verify the final persisted state.
      await ensureChapterCardTag(nextId, pluginName)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedPlan: BookIRPlanV1 = {
        ...afterAdvance,
        lastError: `下一章 IR 已写入但 #card 校验失败: ${message}`
      }
      try {
        await saveBookIRPlan(request.bookBlockId, failedPlan)
      } catch (recordError) {
        console.error("[BookIR] failed to record next-card verification failure:", recordError)
      }
      return {
        kind: "partial",
        bookBlockId: request.bookBlockId,
        plan: failedPlan,
        success: [request.chapterId],
        failed: [{ chapterId: nextId, ok: false, error: message }],
        message: `下一章已安排，但 #card 未能持久化: ${message}`
      }
    }
  }

  if (nextId == null) {
    return {
      kind: "advanced",
      bookBlockId: request.bookBlockId,
      plan: afterAdvance,
      success: [request.chapterId],
      failed: [],
      message: request.outcome === "completed" ? "本书已全部完成" : "本书已全部跳过/完成"
    }
  }

  return {
    kind: "advanced",
    bookBlockId: request.bookBlockId,
    plan: afterAdvance,
    success: [request.chapterId, nextId],
    failed: [],
    message:
      request.outcome === "completed"
        ? `已完成本章，已解锁 #${nextId}`
        : `已跳过本章，已解锁 #${nextId}`
  }
}

/**
 * Retry activating the next pending chapter when last activation failed,
 * or repair plan when next chapter already has live IR state.
 */
export async function retrySequentialActivation(
  bookBlockId: DbId,
  pluginName = "orca-srs"
): Promise<BookIRMutationResult> {
  const plan = await loadBookIRPlan(bookBlockId)
  if (!plan || plan.mode !== "sequential") {
    throw new EpubValidationError(
      `Book #${bookBlockId} 没有顺序计划`,
      "plan_missing",
      bookBlockId
    )
  }
  if (plan.activeChapterId != null) {
    return {
      kind: "advanced",
      bookBlockId,
      plan,
      success: [],
      failed: [],
      message: "已有激活章节"
    }
  }

  const nextId = plan.selectedChapterIds.find((id) => {
    const o = plan.outcomes[String(id)]
    return o === "pending" || o === undefined
  })
  if (nextId == null) {
    return {
      kind: "advanced",
      bookBlockId,
      plan,
      success: [],
      failed: [],
      message: "没有待激活章节"
    }
  }

  // Repair: if next already has IR scheduling (save failed after init), just fix plan
  if (await chapterHasIRScheduling(nextId)) {
    const repaired: BookIRPlanV1 = {
      ...plan,
      outcomes: { ...plan.outcomes, [String(nextId)]: "active" },
      activeChapterId: nextId,
      lastError: null
    }
    await saveBookIRPlan(bookBlockId, repaired)
    return {
      kind: "advanced",
      bookBlockId,
      plan: repaired,
      success: [nextId],
      failed: [],
      message: `已修复计划并确认激活 #${nextId}`
    }
  }

  const nextPlan: BookIRPlanV1 = { ...plan, outcomes: { ...plan.outcomes }, lastError: null }
  try {
    // Retry path defaults to today so a failed activation can re-enter the queue immediately
    const due = resolveNextChapterDue("today")
    const sourceBookTitle = await resolveSequentialBookTitle(bookBlockId, null)
    await initializeChapterAsTopicIR(nextId, {
      pluginName,
      sourceBookId: bookBlockId,
      sourceBookTitle,
      priority: plan.priority,
      due,
      position: Date.now()
    })
    nextPlan.outcomes[String(nextId)] = "active"
    nextPlan.activeChapterId = nextId
    await saveBookIRPlan(bookBlockId, nextPlan)
    return {
      kind: "advanced",
      bookBlockId,
      plan: nextPlan,
      success: [nextId],
      failed: [],
      message: `已激活 #${nextId}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    nextPlan.lastError = message
    await saveBookIRPlan(bookBlockId, nextPlan)
    return {
      kind: "partial",
      bookBlockId,
      plan: nextPlan,
      success: [],
      failed: [{ chapterId: nextId, ok: false, error: message }],
      message
    }
  }
}

async function resolveSequentialBookTitle(
  bookBlockId: DbId,
  currentChapterId: DbId | null
): Promise<string | null> {
  if (currentChapterId != null) {
    const current = await getBlockForProgression(currentChapterId)
    const storedTitle = unwrapSingleStringProperty(
      current?.properties?.find((p) => p.name === "ir.sourceBookTitle")?.value
    )
    if (storedTitle) return storedTitle
  }

  const book = await getBlockForProgression(bookBlockId)
  const alias = book?.aliases?.find((value) => typeof value === "string" && value.trim())
  return alias?.trim() || book?.text?.trim() || null
}

async function getBlockForProgression(blockId: DbId): Promise<Block | undefined> {
  const cached = orca.state.blocks?.[blockId] as Block | undefined
  if (cached) return cached
  try {
    return (await orca.invokeBackend("get-block", blockId)) as Block | undefined
  } catch (error) {
    console.warn(`[BookIR] 读取标题来源块 #${blockId} 失败，将不写入书名:`, error)
    return undefined
  }
}

function unwrapSingleStringProperty(value: unknown): string | null {
  const unwrapped = Array.isArray(value) && value.length === 1 ? value[0] : value
  return typeof unwrapped === "string" && unwrapped.trim() ? unwrapped.trim() : null
}

async function chapterHasIRScheduling(chapterId: DbId): Promise<boolean> {
  const block =
    (orca.state.blocks?.[chapterId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", chapterId)) as Block | undefined)
  if (!block) return false
  const hasDue = block.properties?.some((p) => p.name === "ir.due")
  const hasCard = block.refs?.some((r) => r.type === 2 && isCardTag(r.alias))
  return Boolean(hasDue || hasCard)
}
