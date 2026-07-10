/**
 * Extract → Item 原子转化服务
 *
 * 顺序：校验 → 快照 → 创建 Cloze → 初始化 SRS → 来源 → 真实验证 → 结束 Extract IR
 * 任一步失败：恢复正文/标签类型/IR，若产生独立 Item 则删除。
 */

import type { CursorData, DbId } from "../../orca.d.ts"
import { createCloze } from "../clozeUtils"
import { extractCardType } from "../deckUtils"
import {
  deleteIRSchedulingState,
  ensureIRState,
  loadIRState,
  saveIRState,
  type IRState
} from "../incrementalReadingStorage"
import { ensureClozeSrsState, invalidateBlockCache } from "../storage"
import { isCardTag } from "../tagUtils"
import {
  restoreConversionBlock,
  snapshotConversionBlock,
  type BlockContentSnapshot
} from "./irConversionBlockState"
import { removeIRIndexId } from "./irIndex"
import type { IRConversionStrategy, IRItemSourceMeta } from "./irTypes"

export type { BlockContentSnapshot } from "./irConversionBlockState"

export type ConversionStep =
  | "validate"
  | "create_item"
  | "init_srs"
  | "write_source"
  | "verify_collectable"
  | "finish_extract"
  | "write_undo"

export type ConvertExtractToItemInput = {
  extractId: DbId
  cursor: CursorData
  pluginName: string
  strategy?: IRConversionStrategy
  deps?: Partial<ConversionDeps>
}

export type ConvertExtractToItemSuccess = {
  ok: true
  itemId: DbId
  clozeNumber: number
  extractId: DbId
  source: IRItemSourceMeta
  completedExtract: boolean
}

export type ConvertExtractToItemFailure = {
  ok: false
  step: ConversionStep
  error: string
  extractId: DbId
  extractPreserved: boolean
}

export type ConvertExtractToItemResult =
  | ConvertExtractToItemSuccess
  | ConvertExtractToItemFailure

export type ConversionDeps = {
  loadState: (id: DbId) => Promise<IRState>
  ensureState: (id: DbId) => Promise<IRState>
  saveState: (id: DbId, state: IRState) => Promise<void>
  deleteIrOnly: (id: DbId) => Promise<void>
  snapshotBlock: (id: DbId) => Promise<BlockContentSnapshot | null>
  restoreBlock: (id: DbId, snapshot: BlockContentSnapshot) => Promise<void>
  createClozeOnBlock: (
    cursor: CursorData,
    pluginName: string
  ) => Promise<{ blockId: number; clozeNumber: number } | null>
  initSrs: (blockId: DbId, clozeNumber: number) => Promise<void>
  deleteIncompleteItem: (blockId: DbId) => Promise<void>
  getCardType: (blockId: DbId) => Promise<string>
  readSelectedText: (cursor: CursorData) => string
  findTopicId: (extractId: DbId) => Promise<DbId | null>
  readBookMeta: (extractId: DbId) => Promise<{ sourceBookId: DbId | null; sourceBookTitle: string | null }>
  verifyItemCollectable: (itemId: DbId, clozeNumber: number) => Promise<boolean>
  writeSourceMeta: (itemId: DbId, source: IRItemSourceMeta) => Promise<void>
}

const SOURCE_PROP_EXTRACT = "ir.sourceExtractId"
const SOURCE_PROP_TOPIC = "ir.sourceTopicId"
const SOURCE_PROP_TEXT = "ir.sourceTextSnippet"
const SOURCE_PROP_BOOK_ID = "ir.sourceBookId"
const SOURCE_PROP_BOOK_TITLE = "ir.sourceBookTitle"

function fail(
  extractId: DbId,
  step: ConversionStep,
  error: unknown,
  extractPreserved = true
): ConvertExtractToItemFailure {
  return {
    ok: false,
    step,
    error: error instanceof Error ? error.message : String(error),
    extractId,
    extractPreserved
  }
}

async function defaultDeleteIncompleteItem(blockId: DbId): Promise<void> {
  await orca.commands.invokeEditorCommand("core.editor.deleteBlocks", null, [blockId])
}

async function defaultGetCardType(blockId: DbId): Promise<string> {
  const block = await orca.invokeBackend("get-block", blockId)
  return extractCardType(block as any)
}

function defaultReadSelectedText(cursor: CursorData): string {
  try {
    const block = orca.state.blocks?.[cursor.anchor.blockId] as any
    if (!block?.content) return ""
    if (cursor.anchor.blockId !== cursor.focus.blockId) {
      return (window.getSelection()?.toString() ?? "").trim()
    }
    if (cursor.anchor.index === cursor.focus.index) {
      const fragment = block.content[cursor.anchor.index]
      if (!fragment?.v) return ""
      const start = Math.min(cursor.anchor.offset, cursor.focus.offset)
      const end = Math.max(cursor.anchor.offset, cursor.focus.offset)
      return String(fragment.v).substring(start, end)
    }
    return (window.getSelection()?.toString() ?? "").trim()
  } catch {
    return ""
  }
}

async function defaultFindTopicId(extractId: DbId): Promise<DbId | null> {
  let current = (await orca.invokeBackend("get-block", extractId)) as any
  let guard = 0
  while (current && guard < 100) {
    if (extractCardType(current) === "topic") return current.id as DbId
    if (!current.parent) return null
    current = await orca.invokeBackend("get-block", current.parent)
    guard += 1
  }
  return null
}

async function defaultReadBookMeta(extractId: DbId): Promise<{
  sourceBookId: DbId | null
  sourceBookTitle: string | null
}> {
  const block = (await orca.invokeBackend("get-block", extractId)) as any
  const props = block?.properties ?? []
  const read = (name: string) => {
    const raw = props.find((p: any) => p.name === name)?.value
    return Array.isArray(raw) ? raw[0] : raw
  }
  const bookIdRaw = read("ir.sourceBookId")
  const bookId = typeof bookIdRaw === "number" ? bookIdRaw : null
  const titleRaw = read("ir.sourceBookTitle")
  const title = typeof titleRaw === "string" ? titleRaw : null
  return { sourceBookId: bookId, sourceBookTitle: title }
}

async function writeSourceProperties(itemId: DbId, source: IRItemSourceMeta): Promise<void> {
  const props = [
    { name: SOURCE_PROP_EXTRACT, value: source.extractId, type: 3 },
    { name: SOURCE_PROP_TOPIC, value: source.topicId ?? null, type: 3 },
    { name: SOURCE_PROP_TEXT, value: source.selectedText.slice(0, 500), type: 2 },
    { name: SOURCE_PROP_BOOK_ID, value: source.sourceBookId ?? null, type: 3 },
    { name: SOURCE_PROP_BOOK_TITLE, value: source.sourceBookTitle ?? null, type: 2 }
  ]
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [itemId],
    props
  )
}

/**
 * 真实验证：块存在、type=cloze、有 #card，且对应 cloze SRS 属性可读。
 */
export function isCollectableClozeBlock(block: any, clozeNumber: number): boolean {
  if (!block) return false
  const type = extractCardType(block)
  const props = block.properties ?? []
  const hasClozeSrs = props.some((property: any) =>
    typeof property.name === "string"
    && property.name.startsWith(`srs.c${clozeNumber}.`)
  )
  const hasCardTag = block.refs?.some((ref: any) => ref.type === 2 && isCardTag(ref.alias))
  return Boolean(hasCardTag && type === "cloze" && hasClozeSrs)
}

export async function defaultVerifyItemCollectable(
  itemId: DbId,
  clozeNumber: number
): Promise<boolean> {
  invalidateBlockCache(itemId)
  const block = (await orca.invokeBackend("get-block", itemId)) as any
  return isCollectableClozeBlock(block, clozeNumber)
}

function resolveDeps(partial?: Partial<ConversionDeps>): ConversionDeps {
  return {
    loadState: partial?.loadState ?? loadIRState,
    ensureState: partial?.ensureState ?? ensureIRState,
    saveState: partial?.saveState ?? saveIRState,
    deleteIrOnly: partial?.deleteIrOnly ?? deleteIRSchedulingState,
    snapshotBlock: partial?.snapshotBlock ?? snapshotConversionBlock,
    restoreBlock: partial?.restoreBlock ?? restoreConversionBlock,
    createClozeOnBlock: partial?.createClozeOnBlock ?? createCloze,
    initSrs: partial?.initSrs ?? (async (id, clozeNumber) => {
      await ensureClozeSrsState(id, clozeNumber, Math.max(0, clozeNumber - 1))
    }),
    deleteIncompleteItem: partial?.deleteIncompleteItem ?? defaultDeleteIncompleteItem,
    getCardType: partial?.getCardType ?? defaultGetCardType,
    readSelectedText: partial?.readSelectedText ?? defaultReadSelectedText,
    findTopicId: partial?.findTopicId ?? defaultFindTopicId,
    readBookMeta: partial?.readBookMeta ?? defaultReadBookMeta,
    verifyItemCollectable: partial?.verifyItemCollectable ?? defaultVerifyItemCollectable,
    writeSourceMeta: partial?.writeSourceMeta ?? writeSourceProperties
  }
}

export async function convertExtractToItem(
  input: ConvertExtractToItemInput
): Promise<ConvertExtractToItemResult> {
  const {
    extractId,
    cursor,
    pluginName,
    strategy = "complete_extract",
    deps: partialDeps
  } = input
  const deps = resolveDeps(partialDeps)

  let createdItemId: DbId | null = null
  let clozeNumber = 1
  let mutatedSameBlock = false
  let extractSnapshot: IRState | null = null
  let contentSnapshot: BlockContentSnapshot | null = null

  try {
    extractSnapshot = await deps.loadState(extractId)
    contentSnapshot = await deps.snapshotBlock(extractId)
  } catch (error) {
    return fail(extractId, "validate", error, false)
  }

  try {
    const cardType = await deps.getCardType(extractId)
    if (cardType !== "extracts") {
      return fail(extractId, "validate", `目标不是 Extract（type=${cardType}）`)
    }
    if (!cursor?.anchor?.blockId) {
      return fail(extractId, "validate", "缺少有效选区")
    }
    const selectedText = deps.readSelectedText(cursor)
    if (!selectedText.trim()) {
      return fail(extractId, "validate", "选区文本为空")
    }
    if (!contentSnapshot || !extractSnapshot) {
      return fail(extractId, "validate", "无法快照 Extract 状态")
    }

    const clozeResult = await deps.createClozeOnBlock(cursor, pluginName)
    if (!clozeResult) {
      // createCloze 可能已改写正文后才失败；按同块变异回滚才具备原子性。
      const cleanup = await safeCleanup(deps, null, extractId, extractSnapshot, contentSnapshot, true)
      return failAfterCleanup(extractId, "create_item", "创建 Cloze 失败", cleanup)
    }
    createdItemId = clozeResult.blockId
    clozeNumber = clozeResult.clozeNumber
    mutatedSameBlock = createdItemId === extractId

    try {
      await deps.initSrs(createdItemId, clozeNumber)
    } catch (error) {
      const cleanup = await safeCleanup(deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock)
      return failAfterCleanup(extractId, "init_srs", error, cleanup)
    }

    const topicId = await deps.findTopicId(extractId)
    const bookMeta = await deps.readBookMeta(extractId)
    const source: IRItemSourceMeta = {
      extractId,
      topicId,
      sourceBookId: bookMeta.sourceBookId,
      sourceBookTitle: bookMeta.sourceBookTitle,
      selectedText
    }

    try {
      await deps.writeSourceMeta(createdItemId, source)
    } catch (error) {
      const cleanup = await safeCleanup(deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock)
      return failAfterCleanup(extractId, "write_source", error, cleanup)
    }

    const collectable = await deps.verifyItemCollectable(createdItemId, clozeNumber)
    if (!collectable) {
      const cleanup = await safeCleanup(deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock)
      return failAfterCleanup(
        extractId,
        "verify_collectable",
        "新 Item 无法被卡片收集器读取",
        cleanup
      )
    }

    let completedExtract = false
    if (strategy === "complete_extract") {
      try {
        // 结束 Extract 的 IR 身份，但保留 #card + SRS（同块转化时不能 completeIRCard）
        await deps.deleteIrOnly(extractId)
        removeIRIndexId(pluginName, extractId)
        completedExtract = true
      } catch (error) {
        const cleanup = await safeCleanup(deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock)
        return failAfterCleanup(extractId, "finish_extract", error, cleanup)
      }
    } else {
      const prev = await deps.loadState(extractId)
      await deps.saveState(extractId, {
        ...prev,
        stage: "extract.item_candidate",
        lastAction: "itemize"
      })
    }

    return {
      ok: true,
      itemId: createdItemId,
      clozeNumber,
      extractId,
      source,
      completedExtract
    }
  } catch (error) {
    const cleanup = await safeCleanup(
      deps,
      createdItemId,
      extractId,
      extractSnapshot,
      contentSnapshot,
      mutatedSameBlock
    )
    return failAfterCleanup(extractId, "create_item", error, cleanup)
  }
}

type CleanupResult = {
  extractPreserved: boolean
  errors: string[]
}

function failAfterCleanup(
  extractId: DbId,
  step: ConversionStep,
  error: unknown,
  cleanup: CleanupResult
): ConvertExtractToItemFailure {
  const primary = error instanceof Error ? error.message : String(error)
  const message = cleanup.errors.length > 0
    ? `${primary}；回滚未完整完成：${cleanup.errors.join("；")}`
    : primary
  return fail(extractId, step, message, cleanup.extractPreserved)
}

async function safeCleanup(
  deps: ConversionDeps,
  itemId: DbId | null,
  extractId: DbId,
  irSnapshot: IRState | null,
  contentSnapshot: BlockContentSnapshot | null,
  mutatedSameBlock: boolean
): Promise<CleanupResult> {
  const errors: string[] = []
  let extractPreserved = Boolean(irSnapshot && (!mutatedSameBlock || contentSnapshot))

  // 独立新块：删除半成品 Item
  if (itemId != null && itemId !== extractId) {
    try {
      await deps.deleteIncompleteItem(itemId)
    } catch (error) {
      console.error("[IR Conversion] cleanup item failed:", error)
      errors.push(`半成品 Item 删除失败：${String(error)}`)
    }
  }

  // 同块变异：必须恢复正文与标签类型
  if (mutatedSameBlock && contentSnapshot) {
    try {
      await deps.restoreBlock(extractId, contentSnapshot)
    } catch (error) {
      console.error("[IR Conversion] restore content failed:", error)
      extractPreserved = false
      errors.push(`Extract 内容恢复失败：${String(error)}`)
    }
  }

  if (irSnapshot) {
    try {
      await deps.saveState(extractId, irSnapshot)
    } catch (error) {
      console.error("[IR Conversion] restore extract IR state failed:", error)
      extractPreserved = false
      errors.push(`Extract 调度恢复失败：${String(error)}`)
    }
  }

  return { extractPreserved, errors }
}

export function shouldPreserveExtractOnFailure(result: ConvertExtractToItemResult): boolean {
  return !result.ok && result.extractPreserved === true
}
