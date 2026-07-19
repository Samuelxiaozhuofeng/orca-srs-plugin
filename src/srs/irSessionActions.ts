import type { DbId } from "../orca.d.ts"
import type { IRState } from "./incrementalReadingStorage"
import {
  deleteIRSchedulingState,
  deleteIRState,
  loadIRState,
  markAsRead,
  markAsReadWithPriority,
  postpone,
  saveIRState,
  updatePriority as updatePriorityInternal
} from "./incrementalReadingStorage"
import { deleteCardSrsData, invalidateBlockCache } from "./storage"
import { removeIRIndexId } from "./incremental-reading/irIndex"
import { extractCardType } from "./deckUtils"

export { markAsRead, markAsReadWithPriority }
export { postpone }

const clampPriority = (value: number): number => {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, Math.round(value)))
}

const shiftPriority = (current: number, direction: "forward" | "back"): number => {
  const step = 10
  return clampPriority(direction === "forward" ? current + step : current - step)
}

/**
 * 完成渐进阅读：
 * - 普通 Topic/Extract：移除 #card、清理 SRS + 全部 ir.*
 * - 已挖空 hybrid（type=cloze 仍带 IR）：只结束 IR 调度，保留 #card 与 cloze SRS
 */
export async function completeIRCard(
  blockId: DbId,
  pluginName = "orca-srs"
): Promise<void> {
  try {
    invalidateBlockCache(blockId)
    const block = (await orca.invokeBackend("get-block", blockId)) as any
    const cardType = block ? extractCardType(block) : "basic"

    if (cardType === "cloze") {
      // keep_extract 后 type 已是 cloze：完成摘录 = 只退 IR 调度，保留 #card / cloze SRS / ir.source*
      await deleteIRSchedulingState(blockId)
      removeIRIndexId(pluginName, blockId)
      return
    }

    await deleteCardSrsData(blockId)
    await deleteIRState(blockId)
    await orca.commands.invokeEditorCommand(
      "core.editor.removeTag",
      null,
      blockId,
      "card"
    )
    removeIRIndexId(pluginName, blockId)
  } catch (error) {
    console.error("[IR] 读完处理失败:", error)
    orca.notify("error", "读完处理失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 标记已读并按方向调整优先级（统一使用 ir.priority）
 */
export async function markAsReadWithPriorityShift(
  blockId: DbId,
  _cardType: "topic" | "extracts",
  direction: "forward" | "back"
): Promise<void> {
  void _cardType
  const prev = await loadIRState(blockId)
  const nextPriority = shiftPriority(prev.priority, direction)
  await markAsReadWithPriority(blockId, nextPriority)
}

/**
 * 更新 Topic 队列位置（ir.position），不改变优先级/到期等其他状态。
 */
export async function updatePosition(blockId: DbId, newPosition: number): Promise<IRState> {
  if (!Number.isFinite(newPosition)) {
    throw new Error("invalid position")
  }

  try {
    console.log("[IR] updatePosition start", { blockId, newPosition })
    const prev = await loadIRState(blockId)
    const nextState: IRState = {
      ...prev,
      position: newPosition
    }
    await saveIRState(blockId, nextState)
    console.log("[IR] updatePosition done", { blockId, newPosition })
    return nextState
  } catch (error) {
    console.error("[IR] 更新队列位置失败:", error)
    orca.notify("error", "更新队列位置失败", { title: "渐进阅读" })
    throw error
  }
}

/**
 * 更新优先级（带日志）
 */
export async function updatePriority(blockId: DbId, newPriority: number): Promise<IRState> {
  try {
    console.log("[IR] updatePriority start", { blockId, newPriority })
    const nextState = await updatePriorityInternal(blockId, newPriority)
    console.log("[IR] updatePriority done", { blockId, priority: nextState.priority })
    return nextState
  } catch (error) {
    console.error("[IR] updatePriority failed:", error)
    throw error
  }
}
