/**
 * Strict BookIRPlanV1 parse/write on the book block.
 */

import type { Block, DbId } from "../../orca.d.ts"
import type { BookIRChapterOutcome, BookIRMode, BookIRPlanV1 } from "../../importers/epub/types"
import { EpubValidationError, IR_BOOK_PLAN_PROP } from "../../importers/epub/types"

const MODES = new Set<BookIRMode>(["distributed", "sequential"])
const OUTCOMES = new Set<BookIRChapterOutcome>([
  "pending",
  "active",
  "completed",
  "skipped",
  "removed"
])

const PROP_TYPE_STRING = 2

async function getBlock(blockId: DbId): Promise<Block | undefined> {
  const cached = orca.state.blocks?.[blockId] as Block | undefined
  if (cached) return cached
  return (await orca.invokeBackend("get-block", blockId)) as Block | undefined
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

  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      throw new EpubValidationError(
        `Malformed ir.bookPlan JSON${bookBlockId != null ? ` (book #${bookBlockId})` : ""}. Recovery: clear ir.bookPlan after verifying notes, then re-initialize.`,
        "plan_json",
        bookBlockId
      )
    }
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

  return {
    version: 1,
    bookBlockId: value.bookBlockId as DbId,
    mode: value.mode as BookIRMode,
    priority: value.priority,
    totalDays: value.totalDays,
    selectedChapterIds: value.selectedChapterIds as DbId[],
    activeChapterId: value.activeChapterId as DbId | null,
    outcomes,
    lastError: lastError ?? null
  }
}

export async function loadBookIRPlan(bookBlockId: DbId): Promise<BookIRPlanV1 | null> {
  const block = await getBlock(bookBlockId)
  if (!block) return null
  const raw = block.properties?.find((p) => p.name === IR_BOOK_PLAN_PROP)?.value
  if (raw == null || raw === "") return null
  return parseBookIRPlan(raw, bookBlockId)
}

export async function saveBookIRPlan(bookBlockId: DbId, plan: BookIRPlanV1): Promise<void> {
  const json = serializeBookIRPlan({ ...plan, bookBlockId })
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [bookBlockId],
    [{ name: IR_BOOK_PLAN_PROP, value: json, type: PROP_TYPE_STRING }]
  )
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
