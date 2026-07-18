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

  // Materialize cloneable primitives/objects — orca.state refs/properties may be Proxies
  // which throw DataCloneError ("An object could not be cloned.") in editor IPC.
  const due = new Date(options.due.getTime())
  const position = Number(options.position)
  if (!Number.isFinite(position)) {
    throw new Error(`initializeChapterAsTopicIR: invalid position for block #${blockId}`)
  }

  if (!hasCardTag) {
    const tagData = await buildCardTagData(pluginName, blockId, "topic")
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      toPlainTagData(tagData)
    )
  } else {
    const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
    if (cardRef) {
      await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        toPlainBlockRef(cardRef),
        [{ name: "type", value: "topic" }]
      )
    }
  }

  const props: Array<{ name: string; value: unknown; type: number }> = [
    { name: "ir.priority", value: numericPriority, type: 3 },
    { name: "ir.lastRead", value: null, type: 5 },
    { name: "ir.readCount", value: 0, type: 3 },
    { name: "ir.due", value: due, type: 5 },
    { name: "ir.intervalDays", value: baseIntervalDays, type: 3 },
    { name: "ir.postponeCount", value: 0, type: 3 },
    { name: "ir.stage", value: "topic.preview", type: 2 },
    { name: "ir.lastAction", value: "init", type: 2 },
    { name: "ir.position", value: position, type: 3 },
    { name: "ir.resumeBlockId", value: null, type: 3 },
    { name: "ir.sourceBookId", value: options.sourceBookId ?? null, type: 3 },
    { name: "ir.sourceBookTitle", value: options.sourceBookTitle ?? null, type: 2 }
  ]

  if (options.batchId != null) {
    props.push({ name: "ir.batchId", value: String(options.batchId), type: 2 })
  }
  if (options.batchCreatedAt != null) {
    props.push({
      name: "ir.batchCreatedAt",
      value: new Date(options.batchCreatedAt.getTime()),
      type: 5
    })
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    props
  )
  await ensureChapterCardTag(blockId, pluginName)
  invalidateIrBlockCache(blockId)
  upsertIRIndexId(pluginName, blockId, "topic")
}

/**
 * Verify the persisted #card identity from the backend and repair it once if absent.
 * This is intentionally independent from orca.state because editor commands can leave
 * the in-memory block stale while sequential progression immediately removes the old tag.
 */
export async function ensureChapterCardTag(
  blockId: DbId,
  pluginName = "orca-srs"
): Promise<void> {
  let block = await loadBackendBlock(blockId)
  if (!block) throw new Error(`验证章节 #${blockId} 的 #card 失败：块不存在`)

  if (!hasCardTag(block)) {
    const tagData = await buildCardTagData(pluginName, blockId, "topic")
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      toPlainTagData(tagData)
    )
    block = await loadBackendBlock(blockId)
  }

  if (!block || !hasCardTag(block)) {
    throw new Error(`章节 #${blockId} 的 #card 写入后未持久化`)
  }
}

async function loadBackendBlock(blockId: DbId): Promise<Block | undefined> {
  return (await orca.invokeBackend("get-block", blockId)) as Block | undefined
}

function hasCardTag(block: Block): boolean {
  return block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false
}

/** Strip BlockRef to plain fields accepted by setRefData / structured clone. */
function toPlainBlockRef(ref: {
  id?: unknown
  type?: unknown
  from?: unknown
  to?: unknown
  alias?: unknown
}): { id?: unknown; type?: unknown; from?: unknown; to?: unknown; alias?: unknown } {
  return {
    id: ref.id,
    type: ref.type,
    from: ref.from,
    to: ref.to,
    alias: ref.alias
  }
}

function toPlainTagData(
  data: Array<{ name: string; value: unknown }> | unknown
): Array<{ name: string; value: unknown }> {
  if (!Array.isArray(data)) {
    throw new Error("initializeChapterAsTopicIR: card tag data must be an array")
  }
  return data.map((item) => {
    if (!item || typeof item !== "object" || typeof item.name !== "string") {
      throw new Error("initializeChapterAsTopicIR: card tag data contains an invalid item")
    }
    return {
      name: item.name,
      value: item.value == null
        ? item.value
        : typeof item.value === "object"
          ? JSON.parse(JSON.stringify(item.value))
          : item.value
    }
  })
}
