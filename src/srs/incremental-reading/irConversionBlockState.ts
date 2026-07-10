import type { Block, BlockProperty, ContentFragment, DbId } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"
import { invalidateBlockCache } from "../storage"
import { isCardTag } from "../tagUtils"

const SOURCE_PROPERTY_NAMES = new Set([
  "ir.sourceExtractId",
  "ir.sourceTopicId",
  "ir.sourceTextSnippet",
  "ir.sourceBookId",
  "ir.sourceBookTitle"
])

export type BlockContentSnapshot = {
  content: ContentFragment[]
  text: string
  cardType: string
  properties: BlockProperty[]
}

export type PropertyRestorePlan = {
  deleteNames: string[]
  restore: BlockProperty[]
}

function isConversionProperty(name: string): boolean {
  return name.startsWith("srs.") || SOURCE_PROPERTY_NAMES.has(name)
}

function cloneValue(value: any): any {
  if (value instanceof Date) return new Date(value.getTime())
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
    )
  }
  return value
}

function cloneProperty(property: BlockProperty): BlockProperty {
  return {
    ...property,
    value: cloneValue(property.value),
    typeArgs: cloneValue(property.typeArgs)
  }
}

export function buildPropertyRestorePlan(
  original: BlockProperty[],
  current: BlockProperty[]
): PropertyRestorePlan {
  const originalNames = new Set(original.map(property => property.name))
  return {
    deleteNames: current
      .filter(property => isConversionProperty(property.name) && !originalNames.has(property.name))
      .map(property => property.name),
    restore: original.map(cloneProperty)
  }
}

export async function snapshotConversionBlock(id: DbId): Promise<BlockContentSnapshot | null> {
  const block = (await orca.invokeBackend("get-block", id)) as Block | undefined
  if (!block) return null
  return {
    content: Array.isArray(block.content) ? cloneValue(block.content) : [],
    text: typeof block.text === "string" ? block.text : "",
    cardType: extractCardType(block),
    properties: (block.properties ?? [])
      .filter(property => isConversionProperty(property.name))
      .map(cloneProperty)
  }
}

export async function restoreConversionBlock(
  id: DbId,
  snapshot: BlockContentSnapshot
): Promise<void> {
  invalidateBlockCache(id)
  await orca.commands.invokeEditorCommand(
    "core.editor.setBlocksContent",
    null,
    [{ id, content: snapshot.content }],
    false
  )

  const current = (await orca.invokeBackend("get-block", id)) as Block | undefined
  if (!current) throw new Error(`恢复转化块失败：块 #${id} 不存在`)

  const cardRef = current.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
  if (cardRef && snapshot.cardType) {
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "type", value: snapshot.cardType }]
    )
  }

  const plan = buildPropertyRestorePlan(snapshot.properties, current.properties ?? [])
  if (plan.deleteNames.length > 0) {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteProperties",
      null,
      [id],
      plan.deleteNames
    )
  }
  if (plan.restore.length > 0) {
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [id],
      plan.restore
    )
  }
  invalidateBlockCache(id)
}
