import type { Block, DbId } from "../orca.d.ts"
import type { IRState } from "./incrementalReadingStorage"
import type { IRPriorityChoice } from "./incrementalReadingScheduler"
import {
  deleteIRState,
  loadIRState,
  markAsRead,
  markAsReadWithTagPriorityReset,
  markAsReadWithPriority,
  postpone,
  saveIRState,
  updatePriority as updatePriorityInternal
} from "./incrementalReadingStorage"
import { getPriorityFromTag, mapNumericPriorityToChoice } from "./incrementalReadingScheduler"
import { isCardTag } from "./tagUtils"
import { deleteCardSrsData } from "./storage"

export { markAsRead, markAsReadWithPriority }
export { postpone }

const PRIORITY_ORDER: IRPriorityChoice[] = ["低优先级", "中优先级", "高优先级"]
const PRIORITY_TO_NUMERIC: Record<IRPriorityChoice, number> = {
  "低优先级": 2,
  "中优先级": 5,
  "高优先级": 9
}

const stepPriorityChoice = (
  current: IRPriorityChoice,
  direction: "forward" | "back"
): IRPriorityChoice => {
  const index = PRIORITY_ORDER.indexOf(current)
  if (index < 0) return "中优先级"
  const nextIndex = direction === "forward"
    ? Math.min(PRIORITY_ORDER.length - 1, index + 1)
    : Math.max(0, index - 1)
  return PRIORITY_ORDER[nextIndex]
}

const stepNumericPriority = (
  current: number,
  direction: "forward" | "back"
): number => {
  const choice = mapNumericPriorityToChoice(current)
  const nextChoice = stepPriorityChoice(choice, direction)
  return PRIORITY_TO_NUMERIC[nextChoice]
}

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

async function updateExtractPriorityTag(
  blockId: DbId,
  direction: "forward" | "back"
): Promise<IRPriorityChoice> {
  const block =
    (orca.state.blocks?.[blockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

  if (!block) {
    throw new Error(`找不到块 #${blockId}`)
  }

  const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
  if (!cardRef) {
    throw new Error(`块 #${blockId} 没有 #card 标签`)
  }

  const tagPriority = getPriorityFromTag(block)
  const fallbackPriority = mapNumericPriorityToChoice((await loadIRState(blockId)).priority)
  const current = tagPriority ?? fallbackPriority
  const nextChoice = stepPriorityChoice(current, direction)

  await orca.commands.invokeEditorCommand(
    "core.editor.setRefData",
    null,
    cardRef,
    [{ name: "priority", value: [nextChoice] }]
  )

  return nextChoice
}

/**
 * 标记已读并按方向调整优先级（Topic: ir.priority, Extract: #card.priority）
 */
export async function markAsReadWithPriorityShift(
  blockId: DbId,
  cardType: "topic" | "extracts",
  direction: "forward" | "back"
): Promise<void> {
  if (cardType === "extracts") {
    await updateExtractPriorityTag(blockId, direction)
    await markAsReadWithTagPriorityReset(blockId)
    return
  }

  const prev = await loadIRState(blockId)
  const nextPriority = stepNumericPriority(prev.priority, direction)
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
