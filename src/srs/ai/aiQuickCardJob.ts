/**
 * 快捷制卡的「保留 / 丢弃」语义。
 *
 * 结构与文本类快捷交互一致（源块下挂一个结果根，内容是它的子块），
 * 因此预览罩层、操作栏、离开面板默认取消、卸载清理全部复用现成实现。
 * 差别只在这两个动作本身：
 *
 * - **保留**：把卡片从包装块里提出来变成源块的直接子块，然后清掉 pending
 *   状态让它们进入复习队列，最后删掉空的包装块。
 * - **丢弃**：连包装块带卡片一起删。
 *
 * 卡片在预览期间是 `status=pending` 的真实卡：不进复习队列，因此即使
 * 预览被意外中断（崩溃、强退），卡片也只是「待激活」而不是丢失——
 * 用命令「SRS: 激活待激活卡片」就能捞回来。这正是不另造一套临时块的原因。
 */

import type { Block, DbId } from "../../orca.d.ts"
import { activatePendingCards } from "../cardStatusUtils"
import { resolveBlockBackendFirst } from "./aiCardWriter"
import type { QuickBackgroundJob } from "./aiQuickInteractJobs"

export type QuickCardActionResult =
  | { success: true }
  | { success: false; error: string }

function cardIdsOf(job: QuickBackgroundJob): DbId[] {
  return (job.cardBlockIds ?? []).filter(
    (id): id is number => typeof id === "number"
  )
}

/**
 * 保留：提出卡片 → 激活 → 删包装块。
 *
 * 三步都可能失败，处理原则不同：
 * - 移动失败：直接放弃，卡片仍在包装块下且仍是 pending，可重试
 * - 激活失败：卡片位置已经对了，只是没进队列——报警告并指路到激活命令，
 *   不再回滚（回滚只会把用户刚看到的卡又搬走）
 * - 删包装块失败：内容已经安全，只剩一个空壳，warn 即可
 */
export async function keepQuickCardJob(
  job: QuickBackgroundJob
): Promise<QuickCardActionResult> {
  const rootId = job.resultRootBlockId
  const cardIds = cardIdsOf(job)

  if (rootId == null || cardIds.length === 0) {
    return { success: true }
  }

  try {
    const rootBlock = await resolveBlockBackendFirst(rootId)
    if (!rootBlock) {
      // 包装块没了：卡片多半也一起没了，没有可保留的东西
      return { success: false, error: "结果块已不存在" }
    }

    await orca.commands.invokeGroup(
      async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.moveBlocks",
          null,
          cardIds,
          rootId,
          "after"
        )
      },
      { undoable: true, topGroup: true }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[AI 快捷制卡] 移出卡片失败:", error)
    return { success: false, error: `移出卡片失败：${message}` }
  }

  const { activated, failed } = await activatePendingCards(cardIds)
  if (failed.length > 0) {
    orca.notify(
      "warn",
      `已保留 ${cardIds.length} 张卡片，其中 ${failed.length} 张未能激活（仍为待激活）。可运行「SRS: 激活待激活卡片」重试。`,
      { title: "AI 快捷制卡" }
    )
  } else {
    orca.notify("success", `已保留 ${activated.length} 张卡片`, {
      title: "AI 快捷制卡"
    })
  }

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [rootId]
    )
  } catch (error) {
    // 卡片已经在正确位置了，剩下的只是一个空壳
    console.warn("[AI 快捷制卡] 删除结果外壳失败，可能残留一个空块:", error)
  }

  return { success: true }
}

/** 丢弃：连包装块带卡片一起删。 */
export async function dismissQuickCardJob(
  job: QuickBackgroundJob
): Promise<QuickCardActionResult> {
  const rootId = job.resultRootBlockId
  if (rootId == null) return { success: true }

  try {
    const existing = (await resolveBlockBackendFirst(rootId)) as Block | null
    if (!existing) return { success: true }

    await orca.commands.invokeGroup(
      async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          [rootId]
        )
      },
      { undoable: false, topGroup: true }
    )
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[AI 快捷制卡] 丢弃预览失败:", error)
    return { success: false, error: `丢弃预览失败：${message}` }
  }
}
