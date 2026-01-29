import type { DbId } from "../orca.d.ts"
import type { IRState } from "./incrementalReadingStorage"
import { deleteIRState, loadIRState, markAsRead, saveIRState, updatePriority as updatePriorityInternal } from "./incrementalReadingStorage"
import { deleteCardSrsData } from "./storage"

export { markAsRead }

/**
 * 完成渐进阅读：移除 #card 标签并清理 SRS/IR 状态
 */
export async function completeIRCard(blockId: DbId): Promise<void> {
  try {
    await deleteCardSrsData(blockId)
    await deleteIRState(blockId)
    await orca.commands.invokeEditorCommand(
      "core.editor.removeTag",
      null,
      blockId,
      "card"
    )
  } catch (error) {
    console.error("[IR] 读完处理失败:", error)
    orca.notify("error", "读完处理失败", { title: "渐进阅读" })
    throw error
  }
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
