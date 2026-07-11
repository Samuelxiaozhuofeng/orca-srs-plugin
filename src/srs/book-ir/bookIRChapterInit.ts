/**
 * Initialize a single chapter as Topic IR (shared by distributed/sequential modes).
 */

import type { Block, DbId } from "../../orca.d.ts"
import { DEFAULT_IR_PRIORITY, getTopicBaseIntervalDays, normalizePriority } from "../incrementalReadingScheduler"
import { invalidateIrBlockCache } from "../incrementalReadingStorage"
import { isCardTag } from "../tagUtils"
import { buildCardTagData } from "../cardTagDataBuilder"
import { upsertIRIndexId } from "../incremental-reading/irIndex"

export type InitChapterIROptions = {
  pluginName?: string
  sourceBookId?: DbId | null
  sourceBookTitle?: string | null
  priority: number
  due: Date
  position: number
  /** batch metadata retained for existing collectors; not used as book identity */
  batchId?: string | null
  batchCreatedAt?: Date | null
}

/**
 * Initialize one chapter with #card type=topic and ir.* scheduling.
 * Does not write or read ir.bookPlan / epub.*.
 */
export async function initializeChapterAsTopicIR(
  blockId: DbId,
  options: InitChapterIROptions
): Promise<void> {
  const pluginName = options.pluginName || "orca-srs"
  const numericPriority = normalizePriority(
    Number.isFinite(options.priority) ? options.priority : DEFAULT_IR_PRIORITY
  )
  const baseIntervalDays = getTopicBaseIntervalDays(numericPriority)

  const block =
    (orca.state.blocks?.[blockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

  if (!block) {
    throw new Error(`未找到章节块 #${blockId}`)
  }

  const hasCardTag = block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false

  if (!hasCardTag) {
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      await buildCardTagData(pluginName, blockId, "topic")
    )
  } else {
    const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
    if (cardRef) {
      await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        cardRef,
        [{ name: "type", value: "topic" }]
      )
    }
  }

  const props: Array<{ name: string; value: unknown; type: number }> = [
    { name: "ir.priority", value: numericPriority, type: 3 },
    { name: "ir.lastRead", value: null, type: 5 },
    { name: "ir.readCount", value: 0, type: 3 },
    { name: "ir.due", value: options.due, type: 5 },
    { name: "ir.intervalDays", value: baseIntervalDays, type: 3 },
    { name: "ir.postponeCount", value: 0, type: 3 },
    { name: "ir.stage", value: "topic.preview", type: 2 },
    { name: "ir.lastAction", value: "init", type: 2 },
    { name: "ir.position", value: options.position, type: 3 },
    { name: "ir.resumeBlockId", value: null, type: 3 },
    { name: "ir.sourceBookId", value: options.sourceBookId ?? null, type: 3 },
    { name: "ir.sourceBookTitle", value: options.sourceBookTitle ?? null, type: 2 }
  ]

  if (options.batchId != null) {
    props.push({ name: "ir.batchId", value: options.batchId, type: 2 })
  }
  if (options.batchCreatedAt != null) {
    props.push({ name: "ir.batchCreatedAt", value: options.batchCreatedAt, type: 5 })
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    props
  )
  invalidateIrBlockCache(blockId)
  upsertIRIndexId(pluginName, blockId, "topic")
}
