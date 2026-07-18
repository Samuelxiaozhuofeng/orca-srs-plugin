/**
 * Strict BookIRPlanV1 parse/write on the book block.
 *
 * Reads are backend-first so a load immediately after setProperties/deleteProperties
 * observes persisted truth rather than a stale orca.state.blocks snapshot.
 * Every successful plan property write invalidates IR/SRS block caches for the book.
 */

import type { Block, DbId } from "../../orca.d.ts"
import type { BookIRChapterOutcome, BookIRMode, BookIRPlanV1 } from "../../importers/epub/types"
import { EpubValidationError, IR_BOOK_PLAN_PROP } from "../../importers/epub/types"
import { invalidateIrBlockCache } from "../incrementalReadingStorage"
import { invalidateBlockCache } from "../storage"
import {
  registerSequentialBookId,
  unregisterSequentialBookId
} from "./sequentialBookRegistry"

const MODES = new Set<BookIRMode>(["distributed", "sequential"])
const OUTCOMES = new Set<BookIRChapterOutcome>([
  "pending",
  "active",
  "completed",
  "skipped",
  "removed"
])

/** Orca PropType.JSON — see plugin-docs/documents/Core-Editor-Commands.md */
const PROP_TYPE_JSON = 0

/**
 * Backend-first block load. Prefer get-block so post-write reads are not stuck
 * on a stale orca.state.blocks snapshot. State is only a fallback when backend
 * misses or fails (failure is logged; not swallowed as empty success).
 */
async function getBlock(blockId: DbId): Promise<Block | undefined> {
  try {
    const fromBackend = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
    if (fromBackend) return fromBackend
  } catch (error) {
    console.warn(
      `[BookIR] get-block #${blockId} failed while loading plan; falling back to orca.state:`,
      error
    )
  }
  return orca.state.blocks?.[blockId] as Block | undefined
}

function invalidateBookCaches(bookBlockId: DbId): void {
  invalidateIrBlockCache(bookBlockId)
  invalidateBlockCache(bookBlockId)
}

export function serializeBookIRPlan(plan: BookIRPlanV1): string {
  const validated = parseBookIRPlan(JSON.stringify(plan), plan.bookBlockId)
  return JSON.stringify(validated)
}

export function parseBookIRPlan(raw: unknown, bookBlockId?: DbId): BookIRPlanV1 {
  if (raw == null || raw === "") {
    throw new EpubValidationError(
      `Missing ir.bookPlan${bookBlockId != null ? ` for book #${bookBlockId}` : ""}`,
      "plan_missing",
      bookBlockId
    )
  }

  // Legacy writes used PropType.BlockRefs (2). Orca may return those text
  // values as a single-element array, e.g. ['{"version":1,...}'].
  const legacyValue = Array.isArray(raw) && raw.length === 1 && typeof raw[0] === "string"
    ? raw[0]
    : raw

  let value: unknown = legacyValue
  if (typeof legacyValue === "string") {
    try {
      value = JSON.parse(legacyValue)
    } catch {
      throw new EpubValidationError(
        `Malformed ir.bookPlan JSON${bookBlockId != null ? ` (book #${bookBlockId})` : ""}. Recovery: clear ir.bookPlan after verifying notes, then re-initialize.`,
        "plan_json",
        bookBlockId
      )
    }
  }

  if (Array.isArray(value)) {
    throw new EpubValidationError(
      `ir.bookPlan is an invalid BlockRefs array${bookBlockId != null ? ` (book #${bookBlockId})` : ""}. Recovery: clear ir.bookPlan after verifying notes, then re-initialize.`,
      "plan_corrupted_blockrefs",
      bookBlockId
    )
  }

  if (!isRecord(value)) {
    throw new EpubValidationError("ir.bookPlan must be an object", "plan_shape", bookBlockId)
  }
  if (value.version !== 1) {
    throw new EpubValidationError(
      `Unsupported ir.bookPlan version ${String(value.version)}${bookBlockId != null ? ` (book #${bookBlockId})` : ""}`,
      "plan_version",
      bookBlockId
    )
  }
  if (typeof value.bookBlockId !== "number" || !Number.isFinite(value.bookBlockId)) {
    throw new EpubValidationError("ir.bookPlan.bookBlockId must be a number", "plan_bookBlockId", bookBlockId)
  }
  if (typeof value.mode !== "string" || !MODES.has(value.mode as BookIRMode)) {
    throw new EpubValidationError("ir.bookPlan.mode must be distributed|sequential", "plan_mode", bookBlockId)
  }
  if (typeof value.priority !== "number" || !Number.isFinite(value.priority)) {
    throw new EpubValidationError("ir.bookPlan.priority must be a number", "plan_priority", bookBlockId)
  }
  if (typeof value.totalDays !== "number" || !Number.isFinite(value.totalDays)) {
    throw new EpubValidationError("ir.bookPlan.totalDays must be a number", "plan_totalDays", bookBlockId)
  }
  if (!Array.isArray(value.selectedChapterIds) || !value.selectedChapterIds.every((id) => typeof id === "number")) {
    throw new EpubValidationError("ir.bookPlan.selectedChapterIds must be number[]", "plan_selected", bookBlockId)
  }
  if (!(value.activeChapterId === null || typeof value.activeChapterId === "number")) {
    throw new EpubValidationError("ir.bookPlan.activeChapterId must be number|null", "plan_active", bookBlockId)
  }
  if (!isRecord(value.outcomes)) {
    throw new EpubValidationError("ir.bookPlan.outcomes must be an object", "plan_outcomes", bookBlockId)
  }

  const outcomes: Record<string, BookIRChapterOutcome> = {}
  for (const [key, outcome] of Object.entries(value.outcomes)) {
    if (typeof outcome !== "string" || !OUTCOMES.has(outcome as BookIRChapterOutcome)) {
      throw new EpubValidationError(
        `ir.bookPlan.outcomes[${key}] invalid: ${String(outcome)}`,
        "plan_outcome",
        bookBlockId
      )
    }
    outcomes[key] = outcome as BookIRChapterOutcome
  }

  let lastError: string | null | undefined
  if ("lastError" in value) {
    if (!(value.lastError === null || typeof value.lastError === "string" || value.lastError === undefined)) {
      throw new EpubValidationError("ir.bookPlan.lastError must be string|null", "plan_lastError", bookBlockId)
    }
    lastError = value.lastError as string | null | undefined
  }

  // Always materialize plain JSON data. Values read from orca.state.blocks may be
  // reactive Proxies; passing those to invokeEditorCommand causes
  // "An object could not be cloned." (structured clone / IPC).
  // Deduplicate selectedChapterIds (first occurrence wins) so outcomes/order stay stable.
  const selectedChapterIds = dedupeChapterIds(
    Array.from(value.selectedChapterIds as DbId[], (id) => id as DbId)
  )

  return {
    version: 1,
    bookBlockId: value.bookBlockId as DbId,
    mode: value.mode as BookIRMode,
    priority: value.priority,
    totalDays: value.totalDays,
    selectedChapterIds,
    activeChapterId: value.activeChapterId as DbId | null,
    outcomes: { ...outcomes },
    lastError: lastError ?? null
  }
}

/** Order-preserving unique DbId list (first occurrence wins). */
export function dedupeChapterIds(ids: DbId[]): DbId[] {
  const seen = new Set<DbId>()
  const result: DbId[] = []
  for (const id of ids) {
    if (typeof id !== "number" || !Number.isFinite(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/**
 * Deep plain JSON clone suitable for Orca editor commands / structured clone.
 * Throws if value is not JSON-serializable (surfaces problems instead of silent loss).
 */
export function toPlainJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function loadBookIRPlan(bookBlockId: DbId): Promise<BookIRPlanV1 | null> {
  const block = await getBlock(bookBlockId)
  if (!block) return null
  const raw = block.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value
  if (raw == null || raw === "") return null
  return parseBookIRPlan(raw, bookBlockId)
}

export async function saveBookIRPlan(bookBlockId: DbId, plan: BookIRPlanV1): Promise<void> {
  const validated = parseBookIRPlan({ ...plan, bookBlockId }, bookBlockId)
  // Re-validate after plain clone so editor args never carry Proxies / non-cloneables
  const plain = parseBookIRPlan(toPlainJsonValue(validated), bookBlockId)
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [bookBlockId],
    [{ name: IR_BOOK_PLAN_PROP, value: plain, type: PROP_TYPE_JSON }]
  )
  invalidateBookCaches(bookBlockId)
  if (plain.mode === "sequential") {
    // Best-effort discovery index; plan write already succeeded.
    registerSequentialBookId(plain.bookBlockId)
  }
}

export async function clearBookIRPlan(bookBlockId: DbId): Promise<void> {
  const block = await getBlock(bookBlockId)
  const has = block?.properties?.some((p) => p.name === IR_BOOK_PLAN_PROP)
  if (!has) return
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [bookBlockId],
    [IR_BOOK_PLAN_PROP]
  )
  invalidateBookCaches(bookBlockId)
  unregisterSequentialBookId(bookBlockId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
