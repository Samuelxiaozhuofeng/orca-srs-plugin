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
 * 6. Re-verify next chapter is fully active (#card + IR scheduling)
 *
 * Fully active (live sequential IR card):
 * - Backend-verified #card tag, AND
 * - ir.due present, AND
 * - ir.sourceBookId matches the book
 *
 * Why not strip first: sequential mode keeps only one live IR card. Completing the
 * current chapter before next activation leaves a zero-IR window; if next init then
 * fails, the book vanishes from the review queue and library discovery.
 *
 * Failure recovery (retrySequentialActivation):
 * - Scans selected chapters for live sequential IR belonging to this book
 * - Promotes the intended next chapter, strips obsolete dual-live chapters
 * - Never silently wipes unrelated cards (different sourceBookId or non-selected)
 * - Plan-save / checkpoint failures stay visible and retryable
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
  initializeChapterAsTopicIR,
  type InitChapterIROptions
} from "./bookIRChapterInit"
import { EpubValidationError } from "../../importers/epub/types"
import { isCardTag } from "../tagUtils"
import { parseOptionalNumber } from "../incremental-reading/irPropertyCodec"

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
      await activateSequentialChapter(nextId, {
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
      // Next is already in IR; record a retryable checkpoint without claiming success.
      // Keep outcomes honest: next was initialized (live IR) but plan did not advance.
      const broken: BookIRPlanV1 = {
        ...plan,
        outcomes: {
          ...plan.outcomes,
          // current stays "active" in plan until a successful advance persists
          [String(nextId)]: "pending"
        },
        activeChapterId: null,
        lastError:
          `下一章已激活但计划保存失败（from=#${request.chapterId}, to=#${nextId}, ` +
          `outcome=${request.outcome}）: ${message}`
      }
      let checkpointPersisted = false
      let checkpointErrorMessage: string | null = null
      try {
        await saveBookIRPlan(request.bookBlockId, broken)
        checkpointPersisted = true
      } catch (checkpointError) {
        checkpointErrorMessage =
          checkpointError instanceof Error
            ? checkpointError.message
            : String(checkpointError)
        console.error(
          "[BookIR] plan-save failed after next init; checkpoint write also failed:",
          { saveError, checkpointError }
        )
      }
      const combinedMessage = checkpointPersisted
        ? `下一章已写入 IR，但计划保存失败，请重试激活。当前章尚未清理: ${message}`
        : `下一章已写入 IR，计划保存失败且检查点写入也失败（原错误: ${message}；检查点: ${checkpointErrorMessage}）。请重试修复；当前章尚未清理。`
      return {
        kind: "partial",
        bookBlockId: request.bookBlockId,
        plan: checkpointPersisted ? broken : plan,
        success: [nextId],
        failed: [{ chapterId: nextId, ok: false, error: message }],
        message: combinedMessage,
        currentChapterRemoved: false,
        planPersisted: checkpointPersisted
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
    let planPersisted = true
    try {
      await saveBookIRPlan(request.bookBlockId, failedPlan)
    } catch (recordError) {
      planPersisted = false
      const recordMessage =
        recordError instanceof Error ? recordError.message : String(recordError)
      console.error(
        "[BookIR] failed to record strip failure on plan:",
        { stripError: error, recordError }
      )
      failedPlan.lastError =
        `下一章已激活但清理当前章失败: ${message}；记录 lastError 也失败: ${recordMessage}`
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
          : `计划已更新，但清理当前章失败: ${message}`,
      currentChapterRemoved: false,
      planPersisted
    }
  }

  if (nextId != null) {
    try {
      // Orca may lose the newly inserted same-name tag when the previous chapter's
      // #card is removed immediately afterwards. Verify the final persisted state.
      await ensureChapterFullyActive(nextId, request.bookBlockId, pluginName)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedPlan: BookIRPlanV1 = {
        ...afterAdvance,
        lastError: `下一章 IR 已写入但完全激活校验失败: ${message}`
      }
      let planPersisted = true
      try {
        await saveBookIRPlan(request.bookBlockId, failedPlan)
      } catch (recordError) {
        planPersisted = false
        const recordMessage =
          recordError instanceof Error ? recordError.message : String(recordError)
        console.error(
          "[BookIR] failed to record next-card verification failure:",
          { verifyError: error, recordError }
        )
        failedPlan.lastError =
          `下一章 IR 已写入但完全激活校验失败: ${message}；记录 lastError 也失败: ${recordMessage}`
      }
      return {
        kind: "partial",
        bookBlockId: request.bookBlockId,
        plan: failedPlan,
        success: [request.chapterId],
        failed: [{ chapterId: nextId, ok: false, error: message }],
        message: `下一章已安排且当前章已清理，但 #card/调度校验失败: ${message}`,
        currentChapterRemoved: true,
        planPersisted
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
      message: request.outcome === "completed" ? "本书已全部完成" : "本书已全部跳过/完成",
      currentChapterRemoved: true,
      planPersisted: true
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
        : `已跳过本章，已解锁 #${nextId}`,
    currentChapterRemoved: true,
    planPersisted: true
  }
}

/**
 * Retry / reconcile sequential activation when plan lags or dual-live IR remains.
 *
 * Contract after success: at most one live sequential IR card for this book among
 * selectedChapterIds (fully active = #card + ir.due + matching sourceBookId).
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

  const liveByOrder = await listLiveSequentialChapters(plan.selectedChapterIds, bookBlockId)
  const partialByOrder = await listPartialSequentialChapters(
    plan.selectedChapterIds,
    bookBlockId,
    liveByOrder
  )

  // Prefer the last chapter in plan order that already has any IR for this book
  // (fully active or partial). Activate-before-strip leaves current then next; the
  // intended survivor after a failed advance is the later chapter (next), even when
  // current is still fully active and next is only due-only / card-only.
  const anyIrByOrder: DbId[] = []
  for (const id of plan.selectedChapterIds) {
    if (liveByOrder.includes(id) || partialByOrder.includes(id)) {
      anyIrByOrder.push(id)
    }
  }
  let targetId: DbId | null =
    anyIrByOrder.length > 0 ? anyIrByOrder[anyIrByOrder.length - 1]! : null

  if (targetId == null) {
    // No live IR — if plan already has an active pointer, re-init that chapter;
    // else activate first pending; else book is finished/paused.
    if (plan.activeChapterId != null) {
      targetId = plan.activeChapterId
    } else {
      const nextPending = plan.selectedChapterIds.find((id) => {
        const o = plan.outcomes[String(id)]
        return o === "pending" || o === undefined
      })
      if (nextPending == null) {
        return {
          kind: "advanced",
          bookBlockId,
          plan,
          success: [],
          failed: [],
          message: "没有待激活章节",
          currentChapterRemoved: false,
          planPersisted: true
        }
      }
      targetId = nextPending
    }
  }

  // Complete target to fully active if needed
  try {
    if (!(await isChapterFullyActive(targetId, bookBlockId))) {
      if (await hasConflictingCard(targetId, bookBlockId)) {
        const reason = await describeCardConflict(targetId, bookBlockId)
        return {
          kind: "partial",
          bookBlockId,
          plan: {
            ...plan,
            lastError: reason
          },
          success: [],
          failed: [{ chapterId: targetId, ok: false, error: reason }],
          message: reason,
          currentChapterRemoved: false,
          planPersisted: false
        }
      }
      const due = resolveNextChapterDue("today")
      const sourceBookTitle = await resolveSequentialBookTitle(bookBlockId, null)
      await activateSequentialChapter(targetId, {
        pluginName,
        sourceBookId: bookBlockId,
        sourceBookTitle,
        priority: plan.priority,
        due,
        position: Date.now()
      })
    } else {
      await ensureChapterFullyActive(targetId, bookBlockId, pluginName)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedPlan: BookIRPlanV1 = { ...plan, lastError: message }
    try {
      await saveBookIRPlan(bookBlockId, failedPlan)
    } catch (recordError) {
      console.error("[BookIR] retry activation failed; could not persist lastError:", {
        error,
        recordError
      })
      return {
        kind: "partial",
        bookBlockId,
        plan: failedPlan,
        success: [],
        failed: [{ chapterId: targetId, ok: false, error: message }],
        message: `${message}（记录 lastError 也失败）`,
        currentChapterRemoved: false,
        planPersisted: false
      }
    }
    return {
      kind: "partial",
      bookBlockId,
      plan: failedPlan,
      success: [],
      failed: [{ chapterId: targetId, ok: false, error: message }],
      message,
      currentChapterRemoved: false,
      planPersisted: true
    }
  }

  // Strip other selected chapters that still hold this book's sequential IR
  const stripFailed: BookIRMutationResult["failed"] = []
  const stripped: DbId[] = []
  for (const chapterId of plan.selectedChapterIds) {
    if (chapterId === targetId) continue
    const live = await isChapterFullyActive(chapterId, bookBlockId)
    const partial = await chapterHasAnyBookIR(chapterId, bookBlockId)
    if (!live && !partial) continue
    try {
      await completeIRCard(chapterId, pluginName)
      stripped.push(chapterId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      stripFailed.push({ chapterId, ok: false, error: message })
    }
  }

  // Re-scan: must be at most one fully active sequential card after strip
  const remainingLive = await listLiveSequentialChapters(plan.selectedChapterIds, bookBlockId)
  if (remainingLive.length > 1 || (remainingLive.length === 1 && remainingLive[0] !== targetId)) {
    const message =
      `顺序书 #${bookBlockId} 无法收敛到单卡：目标 #${targetId}，仍存活 ` +
      `[${remainingLive.join(", ")}]` +
      (stripFailed.length > 0
        ? `；清理失败: ${stripFailed.map((f) => `#${f.chapterId}:${f.error}`).join("; ")}`
        : "")
    const failedPlan: BookIRPlanV1 = { ...plan, lastError: message }
    try {
      await saveBookIRPlan(bookBlockId, failedPlan)
    } catch (recordError) {
      console.error("[BookIR] dual-live reconcile failed; lastError write failed:", recordError)
    }
    return {
      kind: "partial",
      bookBlockId,
      plan: failedPlan,
      success: stripped,
      failed: stripFailed.length > 0
        ? stripFailed
        : remainingLive
            .filter((id) => id !== targetId)
            .map((chapterId) => ({
              chapterId,
              ok: false,
              error: "仍为存活 IR 卡"
            })),
      message,
      currentChapterRemoved: false,
      planPersisted: true
    }
  }

  const outcomes: BookIRPlanV1["outcomes"] = { ...plan.outcomes }
  for (const id of stripped) {
    // Prefer completed if plan previously marked this chapter active (failed advance);
    // otherwise leave completed if already terminal; default completed for obsolete live.
    const prev = outcomes[String(id)]
    if (prev !== "skipped" && prev !== "removed" && prev !== "completed") {
      outcomes[String(id)] = "completed"
    }
  }
  outcomes[String(targetId)] = "active"

  const repaired: BookIRPlanV1 = {
    ...plan,
    outcomes,
    activeChapterId: targetId,
    lastError: stripFailed.length > 0
      ? `已激活 #${targetId}，但部分旧卡清理失败`
      : null
  }

  try {
    await saveBookIRPlan(bookBlockId, repaired)
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : String(saveError)
    console.error("[BookIR] reconcile plan save failed after live repair:", saveError)
    return {
      kind: "partial",
      bookBlockId,
      plan: { ...repaired, lastError: message },
      success: [targetId, ...stripped],
      failed: [{ chapterId: targetId, ok: false, error: message }],
      message: `已收敛 IR 卡到 #${targetId}，但计划保存失败，请重试: ${message}`,
      currentChapterRemoved: stripped.length > 0,
      planPersisted: false
    }
  }

  if (stripFailed.length > 0) {
    return {
      kind: "partial",
      bookBlockId,
      plan: repaired,
      success: [targetId, ...stripped],
      failed: stripFailed,
      message:
        `已修复并激活 #${targetId}，但清理旧章失败: ` +
        stripFailed.map((f) => `#${f.chapterId}: ${f.error}`).join("; "),
      currentChapterRemoved: stripped.length > 0,
      planPersisted: true
    }
  }

  return {
    kind: "advanced",
    bookBlockId,
    plan: repaired,
    success: [targetId, ...stripped],
    failed: [],
    message:
      stripped.length > 0
        ? `已修复计划并确认激活 #${targetId}（已清理旧卡 ${stripped.length} 章）`
        : `已修复计划并确认激活 #${targetId}`,
    currentChapterRemoved: stripped.length > 0,
    planPersisted: true
  }
}

/**
 * Activate a pending chapter as sequential Topic IR without wiping a compatible card.
 */
async function activateSequentialChapter(
  chapterId: DbId,
  options: InitChapterIROptions & { sourceBookId: DbId }
): Promise<void> {
  const bookId = options.sourceBookId
  if (await isChapterFullyActive(chapterId, bookId)) {
    await ensureChapterFullyActive(chapterId, bookId, options.pluginName || "orca-srs")
    return
  }
  if (await hasConflictingCard(chapterId, bookId)) {
    throw new Error(await describeCardConflict(chapterId, bookId))
  }
  await initializeChapterAsTopicIR(chapterId, options)
}

/**
 * Fully active sequential IR (strict backend get-block):
 * #card + ir.due + matching ir.sourceBookId.
 * Never falls back to orca.state; backend read failures propagate.
 * Property values may be primitives or single-element Orca arrays.
 */
export async function isChapterFullyActive(
  chapterId: DbId,
  bookBlockId: DbId
): Promise<boolean> {
  const block = await loadBackendBlockStrict(chapterId)
  if (!block) return false
  if (!hasCardTag(block)) return false
  if (!hasValidIrDue(block)) return false
  const source = readSourceBookIdProp(block)
  return source === bookBlockId
}

/**
 * Any IR identity for this book (including partial due-only / card-only).
 * Strict backend read — never treats stale orca.state as verified truth.
 * Only matches chapters that claim this book via ir.sourceBookId.
 */
export async function chapterHasAnyBookIR(
  chapterId: DbId,
  bookBlockId: DbId
): Promise<boolean> {
  const block = await loadBackendBlockStrict(chapterId)
  if (!block) return false
  const source = readSourceBookIdProp(block)
  if (source !== bookBlockId) return false
  const hasDue = hasValidIrDue(block)
  const hasCard = hasCardTag(block)
  return Boolean(hasDue || hasCard)
}

async function ensureChapterFullyActive(
  chapterId: DbId,
  bookBlockId: DbId,
  pluginName: string
): Promise<void> {
  await ensureChapterCardTag(chapterId, pluginName)
  if (!(await isChapterFullyActive(chapterId, bookBlockId))) {
    throw new Error(
      `章节 #${chapterId} 未完全激活（需要 #card + ir.due + ir.sourceBookId=#${bookBlockId}）`
    )
  }
}

async function listLiveSequentialChapters(
  selectedChapterIds: DbId[],
  bookBlockId: DbId
): Promise<DbId[]> {
  const live: DbId[] = []
  for (const id of selectedChapterIds) {
    if (await isChapterFullyActive(id, bookBlockId)) {
      live.push(id)
    }
  }
  return live
}

async function listPartialSequentialChapters(
  selectedChapterIds: DbId[],
  bookBlockId: DbId,
  excludeFullyActive: DbId[]
): Promise<DbId[]> {
  const exclude = new Set(excludeFullyActive)
  const partial: DbId[] = []
  for (const id of selectedChapterIds) {
    if (exclude.has(id)) continue
    if (await chapterHasAnyBookIR(id, bookBlockId)) {
      partial.push(id)
    }
  }
  return partial
}

/**
 * True when the chapter must not be overwritten by sequential Topic init.
 * - Foreign ir.sourceBookId → conflict
 * - Existing #card without proven same-book sourceBookId → conflict (unrelated card / orphan IR)
 * - Same-book sourceBookId (fully active or partial) → not conflict; caller reuses or completes
 * - No #card → not conflict (safe to init)
 */
async function hasConflictingCard(chapterId: DbId, bookBlockId: DbId): Promise<boolean> {
  const block = await loadBackendBlockStrict(chapterId)
  if (!block) return false
  const source = readSourceBookIdProp(block)
  if (source != null && source !== bookBlockId) return true
  // Proven same-book IR (partial or full) is compatible recovery material.
  if (source === bookBlockId) return false
  // source missing/null: any existing #card is not proven compatible — do not reset it.
  if (hasCardTag(block)) return true
  return false
}

async function describeCardConflict(chapterId: DbId, bookBlockId: DbId): Promise<string> {
  const block = await loadBackendBlockStrict(chapterId)
  const source = block ? readSourceBookIdProp(block) : null
  if (source != null && source !== bookBlockId) {
    return (
      `章节 #${chapterId} 已有属于书籍 #${source} 的 IR 进度，` +
      `无法作为书籍 #${bookBlockId} 的顺序激活章。请先移出原 IR 或更换章节。`
    )
  }
  if (source == null && block && hasCardTag(block)) {
    return (
      `章节 #${chapterId} 已有 #card，但缺少 ir.sourceBookId，` +
      `无法安全判定是否属于顺序书 #${bookBlockId}。请先处理该卡（移出 IR 或补全 sourceBookId）后再激活。`
    )
  }
  return `章节 #${chapterId} 存在冲突的卡片状态，无法安全激活为顺序 IR`
}

async function resolveSequentialBookTitle(
  bookBlockId: DbId,
  currentChapterId: DbId | null
): Promise<string | null> {
  // Title is best-effort only — may use state fallback; never used as active-card truth.
  if (currentChapterId != null) {
    const current = await loadBlockForTitleBestEffort(currentChapterId)
    const storedTitle = unwrapSingleStringProperty(
      current?.properties?.find((p) => p.name === "ir.sourceBookTitle")?.value
    )
    if (storedTitle) return storedTitle
  }

  const book = await loadBlockForTitleBestEffort(bookBlockId)
  const alias = book?.aliases?.find((value) => typeof value === "string" && value.trim())
  return alias?.trim() || book?.text?.trim() || null
}

/**
 * Strict backend read for fully-active / recovery predicates.
 * Propagates get-block failures; never returns orca.state as “backend-verified”.
 */
async function loadBackendBlockStrict(blockId: DbId): Promise<Block | undefined> {
  try {
    return (await orca.invokeBackend("get-block", blockId)) as Block | undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[BookIR] get-block #${blockId} failed (strict active check):`, error)
    throw new Error(`验证章节 #${blockId} 的后端状态失败: ${message}`)
  }
}

/**
 * Best-effort block load for non-authoritative fields (e.g. book title).
 * May fall back to orca.state after logging — must not be used for active-card truth.
 */
async function loadBlockForTitleBestEffort(blockId: DbId): Promise<Block | undefined> {
  try {
    const fromBackend = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
    if (fromBackend) return fromBackend
  } catch (error) {
    console.warn(`[BookIR] get-block #${blockId} failed for title (best-effort):`, error)
  }
  return orca.state.blocks?.[blockId] as Block | undefined
}

function hasCardTag(block: Block): boolean {
  return block.refs?.some((ref) => ref.type === 2 && isCardTag(ref.alias)) ?? false
}

/**
 * Normalize Orca property payloads: accept primitives or a single-element array.
 * Empty / multi-element arrays are invalid (not fully-active material).
 */
function unwrapScalarPropValue(value: unknown): unknown | undefined {
  if (value == null || value === "") return undefined
  if (Array.isArray(value)) {
    if (value.length !== 1) return undefined
    const only = value[0]
    if (only == null || only === "") return undefined
    return only
  }
  return value
}

function readSourceBookIdProp(block: Block): number | null {
  const raw = block.properties?.find((p) => p.name === "ir.sourceBookId")?.value
  const scalar = unwrapScalarPropValue(raw)
  if (scalar === undefined) return null
  return parseOptionalNumber(scalar)
}

function hasValidIrDue(block: Block): boolean {
  const raw = block.properties?.find((p) => p.name === "ir.due")?.value
  const scalar = unwrapScalarPropValue(raw)
  if (scalar === undefined) return false
  // Date objects, ISO strings, or timestamps all count as present scheduling due
  if (scalar instanceof Date) return !Number.isNaN(scalar.getTime())
  if (typeof scalar === "string" || typeof scalar === "number") {
    const parsed = new Date(scalar)
    return !Number.isNaN(parsed.getTime())
  }
  return false
}

function unwrapSingleStringProperty(value: unknown): string | null {
  const scalar = unwrapScalarPropValue(value)
  return typeof scalar === "string" && scalar.trim() ? scalar.trim() : null
}
