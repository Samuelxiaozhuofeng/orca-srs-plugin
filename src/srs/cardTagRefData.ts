import type { Block, DbId } from "../orca.d.ts"
import { isCardTag } from "./tagUtils"

export async function setCardTagRefData(
  blockId: DbId,
  data: Array<{ name: string; value: unknown }>
): Promise<void> {
  const block =
    (orca.state.blocks?.[blockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

  if (!block) return

  const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
  if (!cardRef) return

  await orca.commands.invokeEditorCommand(
    "core.editor.setRefData",
    null,
    cardRef,
    data
  )
}

export async function syncCardTagPriority(
  blockId: DbId,
  priority: number
): Promise<void> {
  try {
    await setCardTagRefData(blockId, [{ name: "priority", value: priority }])
  } catch (error) {
    console.warn("[IR] syncCardTagPriority failed:", { blockId, error })
  }
}

