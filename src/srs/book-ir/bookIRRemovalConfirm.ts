/**
 * Shared whole-book IR removal confirmation model (book page + library).
 */

import type { DbId } from "../../orca.d.ts"
import type { BookIRMutationResult, BookIRPlanV1 } from "../../importers/epub/types"
import { loadBookIRPlan } from "./bookIRPlanRepository"
import { removeBookFromIR } from "./bookIRRemovalService"

export type BookIRRemovalSummary = {
  bookBlockId: DbId
  totalSelected: number
  active: number
  lockedPending: number
  completed: number
  skipped: number
  alreadyRemoved: number
  targets: number
  mode: BookIRPlanV1["mode"] | null
  hasPlan: boolean
}

export function summarizeBookIRRemoval(
  bookBlockId: DbId,
  plan: BookIRPlanV1 | null
): BookIRRemovalSummary {
  if (!plan) {
    return {
      bookBlockId,
      totalSelected: 0,
      active: 0,
      lockedPending: 0,
      completed: 0,
      skipped: 0,
      alreadyRemoved: 0,
      targets: 0,
      mode: null,
      hasPlan: false
    }
  }

  let active = 0
  let lockedPending = 0
  let completed = 0
  let skipped = 0
  let alreadyRemoved = 0

  for (const id of plan.selectedChapterIds) {
    const o = plan.outcomes[String(id)]
    if (o === "active" || (plan.activeChapterId === id && o !== "removed")) {
      active += 1
    } else if (o === "pending" || o === undefined) {
      lockedPending += 1
    } else if (o === "completed") {
      completed += 1
    } else if (o === "skipped") {
      skipped += 1
    } else if (o === "removed") {
      alreadyRemoved += 1
    }
  }

  const targets = plan.selectedChapterIds.filter((id) => {
    const o = plan.outcomes[String(id)]
    return o !== "removed"
  }).length

  return {
    bookBlockId,
    totalSelected: plan.selectedChapterIds.length,
    active,
    lockedPending,
    completed,
    skipped,
    alreadyRemoved,
    targets,
    mode: plan.mode,
    hasPlan: true
  }
}

export function formatBookIRRemovalConfirmText(summary: BookIRRemovalSummary): string {
  if (!summary.hasPlan) {
    return (
      `将把书籍 #${summary.bookBlockId} 移出渐进阅读。\n` +
      `笔记正文、图片、引用与 epub.* 会保留；仅清理 #card / srs.* / ir.*。\n` +
      `是否继续？`
    )
  }

  return (
    `将把本书全部渐进阅读章节移出 IR。\n` +
    `计划章节 ${summary.totalSelected}：` +
    `激活 ${summary.active}，` +
    `锁定/未开始 ${summary.lockedPending}，` +
    `已完成 ${summary.completed}，` +
    `已跳过 ${summary.skipped}` +
    (summary.alreadyRemoved > 0 ? `，已移出 ${summary.alreadyRemoved}` : "") +
    `。\n` +
    `本次将处理 ${summary.targets} 章。\n` +
    `笔记正文、图片、引用与 epub.* 会保留；仅清理 #card / srs.* / ir.*。\n` +
    `是否继续？`
  )
}

/**
 * Shared entry: load plan → summarize → confirm → remove.
 * Both book-page command and library source-book menu should call this.
 */
export async function confirmAndRemoveBookFromIR(
  bookBlockId: DbId,
  pluginName = "orca-srs",
  confirmFn: (message: string) => boolean = (msg) => window.confirm(msg)
): Promise<BookIRMutationResult | null> {
  const plan = await loadBookIRPlan(bookBlockId)
  const summary = summarizeBookIRRemoval(bookBlockId, plan)
  const text = formatBookIRRemovalConfirmText(summary)
  if (!confirmFn(text)) {
    return null
  }
  return removeBookFromIR(bookBlockId, pluginName)
}
