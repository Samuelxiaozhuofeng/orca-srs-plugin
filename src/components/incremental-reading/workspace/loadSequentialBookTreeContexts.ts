/**
 * Load sequential Book IR plan + chapter titles for library tree outline.
 *
 * Discovery merges:
 * 1. live IR cards' sourceBookId
 * 2. repo-scoped sequential book registry (survives zero live cards)
 *
 * Does not scan the whole vault. Stale registry IDs (no sequential plan) are pruned.
 * Plan/manifest read failures stay visible and do not prune the registry entry.
 */

import type { Block, DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { loadBookIRPlan } from "../../../srs/book-ir/bookIRPlanRepository"
import {
  listRegisteredSequentialBookIds,
  pruneSequentialBookIds
} from "../../../srs/book-ir/sequentialBookRegistry"
import { getImportedChaptersFromManifest } from "../../../importers/epub/epubManifestChapters"
import type { SequentialBookTreeContext } from "./irSourceTreeBuilder"

/** Cap concurrent plan loads when merging large registries. */
const PLAN_LOAD_CONCURRENCY = 8

export type LoadSequentialBookTreeContextsResult = {
  contexts: SequentialBookTreeContext[]
  /** Non-fatal per-book errors (plan/manifest); already logged via console.error. */
  warnings: string[]
}

/**
 * Discover sequential books from live IR cards + registry and load plan-backed outline context.
 */
export async function loadSequentialBookTreeContexts(
  cards: IRCard[],
  pluginName = "orca-srs"
): Promise<LoadSequentialBookTreeContextsResult> {
  const liveBookIds = Array.from(
    new Set(
      cards
        .map(card => card.sourceBookId)
        .filter((id): id is DbId => typeof id === "number" && Number.isFinite(id))
    )
  )
  const registryIds = listRegisteredSequentialBookIds(pluginName)
  const bookIds = Array.from(new Set([...liveBookIds, ...registryIds]))

  const contexts: SequentialBookTreeContext[] = []
  const warnings: string[] = []
  const staleRegistryIds: DbId[] = []

  for (let i = 0; i < bookIds.length; i += PLAN_LOAD_CONCURRENCY) {
    const batch = bookIds.slice(i, i + PLAN_LOAD_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (bookBlockId) => {
        let plan
        try {
          plan = await loadBookIRPlan(bookBlockId)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          const warning = `读取书籍 #${bookBlockId} 的 ir.bookPlan 失败: ${message}`
          console.error(`[IR Workspace] ${warning}`, error)
          // Do not prune on read failure — keep retryable
          return { bookBlockId, warning, context: null as SequentialBookTreeContext | null, stale: false }
        }

        if (!plan) {
          // Confirmed no plan — prune only if it came from registry
          const fromRegistry = registryIds.includes(bookBlockId)
          return {
            bookBlockId,
            warning: null as string | null,
            context: null,
            stale: fromRegistry
          }
        }

        if (plan.mode !== "sequential") {
          const fromRegistry = registryIds.includes(bookBlockId)
          return {
            bookBlockId,
            warning: null as string | null,
            context: null,
            stale: fromRegistry
          }
        }

        const chapterTitles: Record<string, string> = {}
        let manifestWarning: string | null = null
        try {
          const { chapters } = await getImportedChaptersFromManifest(bookBlockId)
          for (const chapter of chapters) {
            chapterTitles[String(chapter.blockId)] = chapter.title
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          manifestWarning = `读取书籍 #${bookBlockId} 的 epub.manifest 失败: ${message}`
          console.error(`[IR Workspace] ${manifestWarning}`, error)
          // Continue without manifest titles — fall back to titleMap / (#id)
        }

        const bookTitleFromCard = cards.find(
          card => card.sourceBookId === bookBlockId && card.sourceBookTitle?.trim()
        )?.sourceBookTitle
        let bookTitleFromBlock: string | undefined
        let titleWarning: string | null = null
        if (!bookTitleFromCard?.trim()) {
          try {
            bookTitleFromBlock = await loadBookBlockTitle(bookBlockId)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            titleWarning = `读取书籍 #${bookBlockId} 的标题失败: ${message}`
            console.error(`[IR Workspace] ${titleWarning}`, error)
          }
        }

        return {
          bookBlockId,
          warning: [manifestWarning, titleWarning].filter(Boolean).join(" | ") || null,
          context: {
            bookBlockId,
            bookTitle: bookTitleFromCard?.trim() || bookTitleFromBlock,
            selectedChapterIds: plan.selectedChapterIds,
            activeChapterId: plan.activeChapterId,
            outcomes: plan.outcomes,
            chapterTitles
          } satisfies SequentialBookTreeContext,
          stale: false
        }
      })
    )

    for (const item of batchResults) {
      if (item.warning) warnings.push(item.warning)
      if (item.stale) staleRegistryIds.push(item.bookBlockId)
      if (item.context) contexts.push(item.context)
    }
  }

  if (staleRegistryIds.length > 0) {
    try {
      pruneSequentialBookIds(staleRegistryIds, pluginName)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const warning = `清理过期顺序书注册表失败: ${message}`
      console.error(`[IR Workspace] ${warning}`, error)
      warnings.push(warning)
    }
  }

  return { contexts, warnings }
}

async function loadBookBlockTitle(bookBlockId: DbId): Promise<string | undefined> {
  try {
    const fromBackend = (await orca.invokeBackend("get-block", bookBlockId)) as
      | Block
      | undefined
    if (fromBackend) {
      const alias = fromBackend.aliases?.find(
        value => typeof value === "string" && value.trim()
      )
      return alias?.trim() || fromBackend.text?.trim() || undefined
    }
  } catch (error) {
    console.warn(`[IR Workspace] get-block #${bookBlockId} for title failed:`, error)
  }
  const block = orca.state.blocks?.[bookBlockId] as Block | undefined
  const alias = block?.aliases?.find(value => typeof value === "string" && value.trim())
  return alias?.trim() || block?.text?.trim() || undefined
}
