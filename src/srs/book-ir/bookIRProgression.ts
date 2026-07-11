/**
 * Sequential book progression: complete / skip current chapter and unlock next.
 * Read / postpone / priority must NEVER call this service.
 *
 * State machine (checkpointed):
 * 1. Validate active chapter against plan
 * 2. Persist plan: outcome recorded, activeChapterId = null (current done, none active)
 * 3. Strip current chapter IR identity
 * 4. Initialize next pending chapter (if any)
 * 5. Persist plan with new activeChapterId
 *
 * If step 5 fails after step 4, next has IR but plan may still have active=null —
 * retrySequentialActivation detects that and repairs the plan.
 */

import type { Block, DbId } from "../../orca.d.ts"
import type {
  AdvanceSequentialBookRequest,
  BookIRMutationResult,
  BookIRPlanV1
} from "../../importers/epub/types"
import { completeIRCard } from "../irSessionActions"
import { loadBookIRPlan, saveBookIRPlan } from "./bookIRPlanRepository"
import { initializeChapterAsTopicIR } from "./bookIRChapterInit"
import { EpubValidationError } from "../../importers/epub/types"
import { isCardTag } from "../tagUtils"

/**
 * Complete or skip the active sequential chapter and activate the next pending one.
 */
export async function advanceSequentialBook(
  request: AdvanceSequentialBookRequest
): Promise<BookIRMutationResult> {
  const pluginName = request.pluginName || "orca-srs"
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

  // Checkpoint A: record outcome and clear active before mutating cards
  const afterOutcome: BookIRPlanV1 = {
    ...plan,
    outcomes: {
      ...plan.outcomes,
      [String(request.chapterId)]: request.outcome
    },
    activeChapterId: null,
    lastError: null
  }
  await saveBookIRPlan(request.bookBlockId, afterOutcome)

  // Strip current chapter card/SRS/IR (epub.* retained)
  try {
    await completeIRCard(request.chapterId, pluginName)
  } catch (error) {
    // Compensation: restore previous active so UI can retry
    try {
      await saveBookIRPlan(request.bookBlockId, plan)
    } catch (restoreError) {
      console.error("[BookIR] failed to restore plan after completeIRCard failure:", restoreError)
    }
    throw error
  }

  const nextId = afterOutcome.selectedChapterIds.find((id) => {
    const o = afterOutcome.outcomes[String(id)]
    return o === "pending" || o === undefined
  })

  if (nextId == null) {
    return {
      kind: "advanced",
      bookBlockId: request.bookBlockId,
      plan: afterOutcome,
      success: [request.chapterId],
      failed: [],
      message: request.outcome === "completed" ? "本书已全部完成" : "本书已全部跳过/完成"
    }
  }

  // Activate next
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await initializeChapterAsTopicIR(nextId, {
      pluginName,
      sourceBookId: request.bookBlockId,
      sourceBookTitle: null,
      priority: plan.priority,
      due: today,
      position: Date.now()
    })

    const withNext: BookIRPlanV1 = {
      ...afterOutcome,
      outcomes: {
        ...afterOutcome.outcomes,
        [String(nextId)]: "active"
      },
      activeChapterId: nextId,
      lastError: null
    }

    try {
      await saveBookIRPlan(request.bookBlockId, withNext)
    } catch (saveError) {
      // Next is already in IR queue; plan may lag — record error for retry repair
      const message = saveError instanceof Error ? saveError.message : String(saveError)
      const broken: BookIRPlanV1 = {
        ...afterOutcome,
        outcomes: {
          ...afterOutcome.outcomes,
          // Keep next as pending in plan so retry can reconcile with live IR state
          [String(nextId)]: "pending"
        },
        activeChapterId: null,
        lastError: `下一章已激活但计划保存失败: ${message}`
      }
      try {
        await saveBookIRPlan(request.bookBlockId, broken)
      } catch {
        // best-effort
      }
      return {
        kind: "partial",
        bookBlockId: request.bookBlockId,
        plan: broken,
        success: [request.chapterId],
        failed: [{ chapterId: nextId, ok: false, error: message }],
        message: `已${request.outcome === "completed" ? "完成" : "跳过"}本章并解锁下一章，但计划保存失败，请重试激活`
      }
    }

    return {
      kind: "advanced",
      bookBlockId: request.bookBlockId,
      plan: withNext,
      success: [request.chapterId, nextId],
      failed: [],
      message:
        request.outcome === "completed"
          ? `已完成本章，已解锁 #${nextId}`
          : `已跳过本章，已解锁 #${nextId}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedPlan: BookIRPlanV1 = {
      ...afterOutcome,
      lastError: message
    }
    await saveBookIRPlan(request.bookBlockId, failedPlan)
    return {
      kind: "partial",
      bookBlockId: request.bookBlockId,
      plan: failedPlan,
      success: [request.chapterId],
      failed: [{ chapterId: nextId, ok: false, error: message }],
      message: `已记录${request.outcome === "completed" ? "完成" : "跳过"}，但激活下一章失败: ${message}`
    }
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
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await initializeChapterAsTopicIR(nextId, {
      pluginName,
      sourceBookId: bookBlockId,
      sourceBookTitle: null,
      priority: plan.priority,
      due: today,
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

async function chapterHasIRScheduling(chapterId: DbId): Promise<boolean> {
  const block =
    (orca.state.blocks?.[chapterId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", chapterId)) as Block | undefined)
  if (!block) return false
  const hasDue = block.properties?.some((p) => p.name === "ir.due")
  const hasCard = block.refs?.some((r) => r.type === 2 && isCardTag(r.alias))
  return Boolean(hasDue || hasCard)
}
