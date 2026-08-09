import type { Block, DbId } from "../orca.d.ts"
import { isCardTag } from "./tagUtils"
import { invalidateBlockCache } from "./storage"

export async function setCardTagRefData(
  blockId: DbId,
  data: Array<{ name: string; value: unknown }>
): Promise<void> {
  const block =
    (orca.state.blocks?.[blockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

  if (!block) {
    throw new Error(`[setCardTagRefData] 块不存在: blockId=${blockId}`)
  }

  const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
  if (!cardRef) {
    throw new Error(`[setCardTagRefData] 未找到 #card 标签: blockId=${blockId}`)
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setRefData",
    null,
    cardRef,
    data
  )
  invalidateBlockCache(blockId)
}

export async function syncCardTagPriority(
  blockId: DbId,
  priority: number
): Promise<void> {
  try {
    await setCardTagRefData(blockId, [{ name: "priority", value: priority }])
  } catch (error) {
    console.error(
      `[IR] syncCardTagPriority failed: #card.priority 未同步（ir.priority 已写入，saveIRState 主流程未受影响）`,
      { blockId, priority, error }
    )
  }
}
