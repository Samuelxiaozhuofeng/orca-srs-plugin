/**
 * Load sequential Book IR plan + chapter titles for library tree outline.
 * Does not create IR cards or scan the whole vault — only books already present
 * via live IR cards' sourceBookId.
 */

import type { Block, DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { loadBookIRPlan } from "../../../srs/book-ir/bookIRPlanRepository"
import { getImportedChaptersFromManifest } from "../../../importers/epub/epubManifestChapters"
import type { SequentialBookTreeContext } from "./irSourceTreeBuilder"

export type LoadSequentialBookTreeContextsResult = {
  contexts: SequentialBookTreeContext[]
  /** Non-fatal per-book errors (plan/manifest); already logged via console.error. */
  warnings: string[]
}

/**
 * Discover sequential books from live IR cards and load plan-backed outline context.
 */
export async function loadSequentialBookTreeContexts(
  cards: IRCard[]
): Promise<LoadSequentialBookTreeContextsResult> {
  const bookIds = Array.from(
    new Set(
      cards
        .map(card => card.sourceBookId)
        .filter((id): id is DbId => typeof id === "number" && Number.isFinite(id))
    )
  )

  const contexts: SequentialBookTreeContext[] = []
  const warnings: string[] = []

  for (const bookBlockId of bookIds) {
    let plan
    try {
      plan = await loadBookIRPlan(bookBlockId)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      const warning = `读取书籍 #${bookBlockId} 的 ir.bookPlan 失败: ${message}`
      console.error(`[IR Workspace] ${warning}`, error)
      warnings.push(warning)
      continue
    }

    if (!plan || plan.mode !== "sequential") continue

    const chapterTitles: Record<string, string> = {}
    try {
      const { chapters } = await getImportedChaptersFromManifest(bookBlockId)
      for (const chapter of chapters) {
        chapterTitles[String(chapter.blockId)] = chapter.title
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      const warning = `读取书籍 #${bookBlockId} 的 epub.manifest 失败: ${message}`
      console.error(`[IR Workspace] ${warning}`, error)
      warnings.push(warning)
      // Continue without manifest titles — fall back to titleMap / (#id)
    }

    const bookTitleFromCard = cards.find(
      card => card.sourceBookId === bookBlockId && card.sourceBookTitle?.trim()
    )?.sourceBookTitle
    let bookTitleFromBlock: string | undefined
    if (!bookTitleFromCard?.trim()) {
      try {
        bookTitleFromBlock = await loadBookBlockTitle(bookBlockId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const warning = `读取书籍 #${bookBlockId} 的标题失败: ${message}`
        console.error(`[IR Workspace] ${warning}`, error)
        warnings.push(warning)
      }
    }

    contexts.push({
      bookBlockId,
      bookTitle: bookTitleFromCard?.trim() || bookTitleFromBlock,
      selectedChapterIds: plan.selectedChapterIds,
      activeChapterId: plan.activeChapterId,
      outcomes: plan.outcomes,
      chapterTitles
    })
  }

  return { contexts, warnings }
}

async function loadBookBlockTitle(bookBlockId: DbId): Promise<string | undefined> {
  const block = (
    (orca.state.blocks?.[bookBlockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", bookBlockId)) as Block | undefined)
  )
  const alias = block?.aliases?.find(value => typeof value === "string" && value.trim())
  return alias?.trim() || block?.text?.trim() || undefined
}
