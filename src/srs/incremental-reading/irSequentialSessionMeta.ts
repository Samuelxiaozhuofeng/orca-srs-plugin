/**
 * Session-facing sequential Book IR meta for the current card.
 * Used by IRSessionShell complete dialog (active? has next?).
 */

import type { Block, DbId } from "../../orca.d.ts"
import { getBlockCached } from "./irBlockCache"
import { parseOptionalNumber, readProp } from "./irPropertyCodec"

export type SequentialSessionMeta = {
  isActive: boolean
  /** True when at least one pending chapter remains after the active one. */
  hasNextChapter: boolean
}

const INACTIVE: SequentialSessionMeta = { isActive: false, hasNextChapter: false }

/**
 * Resolve whether blockId is the sequential active chapter and whether a next
 * pending chapter exists. Plan load failures propagate (no silent false).
 */
export async function loadSequentialSessionMeta(
  blockId: DbId,
  block?: Block | null
): Promise<SequentialSessionMeta> {
  const resolved = block ?? (await getBlockCached(blockId)) ?? null
  if (!resolved) return INACTIVE

  const sourceBookId = parseOptionalNumber(readProp(resolved, "ir.sourceBookId"))
  if (sourceBookId === null) return INACTIVE

  const { loadBookIRPlan } = await import("../book-ir/bookIRPlanRepository")
  const plan = await loadBookIRPlan(sourceBookId)
  if (!plan || plan.mode !== "sequential") return INACTIVE
  if (plan.activeChapterId !== blockId) return INACTIVE

  const hasNextChapter = plan.selectedChapterIds.some((id) => {
    if (id === blockId) return false
    const outcome = plan.outcomes[String(id)]
    return outcome === "pending" || outcome === undefined
  })

  return { isActive: true, hasNextChapter }
}
