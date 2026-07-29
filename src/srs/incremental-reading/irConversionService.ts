/**
 * Extract → Item 原子转化服务
 *
 * 通用事务：校验 → 快照 → 创建 Item → 初始化 SRS → 来源 → 真实验证 → finish/keep
 * 任一步失败：safeCleanup 恢复正文/标签类型/IR，若产生独立 Item 则删除。
 *
 * 入口：
 * - convertExtractToItem（默认 Cloze，兼容旧调用）
 * - convertExtractToQA（basic 问答卡）
 * - convertExtractToDirection（方向卡）
 */

import type { CursorData, DbId } from "../../orca.d.ts"
import type { BlockWithRepr } from "../blockUtils"
import { buildCardTagData } from "../cardTagDataBuilder"
import { createCloze, type CreateClozeOptions } from "../clozeUtils"
import { extractCardType } from "../deckUtils"
import {
  insertDirection,
  type DirectionType,
  type InsertDirectionOptions
} from "../directionUtils"
import { formatInitialDueHint, resolveInitialDue } from "../initialDuePolicy"
import {
  deleteIRSchedulingState,
  ensureIRState,
  loadIRState,
  saveIRState,
  type IRState
} from "../incrementalReadingStorage"
import { getIrItemInitialDueMode } from "../settings/reviewSettingsSchema"
import {
  ensureCardSrsState,
  ensureCardSrsStateWithInitialDue,
  ensureClozeSrsState,
  invalidateBlockCache
} from "../storage"
import { ensureCardTagProperties } from "../tagPropertyInit"
import { isCardTag } from "../tagUtils"
import {
  restoreConversionBlock,
  snapshotConversionBlock,
  type BlockContentSnapshot
} from "./irConversionBlockState"
import { removeIRIndexId } from "./irIndex"
import { blockHasLiveIRScheduling, isConvertExtractTarget } from "./irHybridExtract"
import type { IRConversionStrategy, IRItemSourceMeta } from "./irTypes"

export type { BlockContentSnapshot } from "./irConversionBlockState"

/** 转化产物类型；默认 cloze 保持旧调用点行为 */
export type ConversionItemType = "cloze" | "qa" | "direction"

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
  /** 默认 cloze；也可直接走 convertExtractToQA / convertExtractToDirection */
  itemType?: ConversionItemType
  direction?: DirectionType
  /** 传入 createCloze；默认 ir_item + extract 优先级 */
  createClozeOptions?: CreateClozeOptions
  deps?: Partial<ConversionDeps>
}

export type ConvertExtractToQAInput = {
  extractId: DbId
  pluginName: string
  strategy?: IRConversionStrategy
  /** Q&A 不依赖选区；可选 cursor 仅为对称/扩展 */
  cursor?: CursorData
  deps?: Partial<ConversionDeps>
}

export type ConvertExtractToDirectionInput = {
  extractId: DbId
  cursor: CursorData
  pluginName: string
  strategy?: IRConversionStrategy
  direction?: DirectionType
  deps?: Partial<ConversionDeps>
}

export type ConvertExtractToItemSuccess = {
  ok: true
  itemId: DbId
  /** Cloze 编号；Q&A / Direction 固定为 0 */
  clozeNumber: number
  itemType: ConversionItemType
  extractId: DbId
  source: IRItemSourceMeta
  completedExtract: boolean
  /** 本次新建记忆卡的首次 due（若创建路径写入） */
  initialDue?: Date
  initialDueHint?: string
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
    pluginName: string,
    options?: CreateClozeOptions
  ) => Promise<{
    blockId: number
    clozeNumber: number
    initialDue?: Date
    initialDueHint?: string
  } | null>
  initSrs: (blockId: DbId, clozeNumber: number) => Promise<void>
  deleteIncompleteItem: (blockId: DbId) => Promise<void>
  getCardType: (blockId: DbId) => Promise<string>
  /** True when block still has IR scheduling (e.g. ir.due) after keep_extract dig. */
  hasLiveIR: (blockId: DbId) => Promise<boolean>
  readSelectedText: (cursor: CursorData) => string
  findTopicId: (extractId: DbId) => Promise<DbId | null>
  readBookMeta: (extractId: DbId) => Promise<{ sourceBookId: DbId | null; sourceBookTitle: string | null }>
  verifyItemCollectable: (itemId: DbId, clozeNumber: number) => Promise<boolean>
  writeSourceMeta: (itemId: DbId, source: IRItemSourceMeta) => Promise<void>
  /** Q&A：解析题面/答案；无可用答案子块时返回 null */
  resolveQAContent: (extractId: DbId) => Promise<{ front: string; back: string } | null>
  createQAOnBlock: (
    extractId: DbId,
    pluginName: string,
    content: { front: string; back: string }
  ) => Promise<{ blockId: number } | null>
  initQASrs: (
    blockId: DbId,
    options?: {
      pluginName?: string
      irPriority?: number
      initialDueOrigin?: "standard" | "ir_item"
      initialDue?: Date
    }
  ) => Promise<void>
  verifyQACollectable: (itemId: DbId) => Promise<boolean>
  createDirectionOnBlock: (
    cursor: CursorData,
    pluginName: string,
    direction: DirectionType,
    options?: InsertDirectionOptions
  ) => Promise<{ blockId: number } | null>
  verifyDirectionCollectable: (itemId: DbId) => Promise<boolean>
  /** Q&A 初始化时的 IR 优先级（创建前冻结） */
  irPriorityForInit?: number
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

  if (itemId != null && itemId !== extractId) {
    try {
      await deps.deleteIncompleteItem(itemId)
    } catch (error) {
      console.error("[IR Conversion] cleanup item failed:", error)
      errors.push(`半成品 Item 删除失败：${String(error)}`)
    }
  }

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

async function defaultDeleteIncompleteItem(blockId: DbId): Promise<void> {
  await orca.commands.invokeEditorCommand("core.editor.deleteBlocks", null, [blockId])
}

async function defaultGetCardType(blockId: DbId): Promise<string> {
  const block = await orca.invokeBackend("get-block", blockId)
  return extractCardType(block as any)
}

async function defaultHasLiveIR(blockId: DbId): Promise<boolean> {
  const block = (await orca.invokeBackend("get-block", blockId)) as any
  return blockHasLiveIRScheduling(block)
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

/** 真实验证：type=cloze + #card + 对应 cloze SRS 属性 */
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

/** 真实验证：#card + type=basic + 任意 srs.* */
export function isCollectableBasicBlock(block: any): boolean {
  if (!block) return false
  const type = extractCardType(block)
  const props = block.properties ?? []
  const hasSrs = props.some((property: any) =>
    typeof property.name === "string" && property.name.startsWith("srs.")
  )
  const hasCardTag = block.refs?.some((ref: any) => ref.type === 2 && isCardTag(ref.alias))
  return Boolean(hasCardTag && type === "basic" && hasSrs)
}

/** 真实验证：#card + type=direction + 方向 SRS 前缀 */
export function isCollectableDirectionBlock(block: any): boolean {
  if (!block) return false
  const type = extractCardType(block)
  const props = block.properties ?? []
  const hasDirectionSrs = props.some((property: any) =>
    typeof property.name === "string"
    && (
      property.name.startsWith("srs.forward.")
      || property.name.startsWith("srs.backward.")
    )
  )
  const hasCardTag = block.refs?.some((ref: any) => ref.type === 2 && isCardTag(ref.alias))
  return Boolean(hasCardTag && type === "direction" && hasDirectionSrs)
}

export async function defaultVerifyItemCollectable(
  itemId: DbId,
  clozeNumber: number
): Promise<boolean> {
  invalidateBlockCache(itemId)
  const block = (await orca.invokeBackend("get-block", itemId)) as any
  return isCollectableClozeBlock(block, clozeNumber)
}

export async function defaultVerifyQACollectable(itemId: DbId): Promise<boolean> {
  invalidateBlockCache(itemId)
  const block = (await orca.invokeBackend("get-block", itemId)) as any
  return isCollectableBasicBlock(block)
}

export async function defaultVerifyDirectionCollectable(itemId: DbId): Promise<boolean> {
  invalidateBlockCache(itemId)
  const block = (await orca.invokeBackend("get-block", itemId)) as any
  return isCollectableDirectionBlock(block)
}

/**
 * 从后端解析 Q&A 题面/答案。首个子块为答案；无可用答案文本则 null。
 */
export async function defaultResolveQAContent(
  extractId: DbId
): Promise<{ front: string; back: string } | null> {
  const block = (await orca.invokeBackend("get-block", extractId)) as any
  if (!block) return null
  const front = typeof block.text === "string" ? block.text.trim() : ""
  const children: DbId[] = Array.isArray(block.children) ? block.children : []
  if (children.length === 0) return null

  let back = ""
  const stateChild = orca.state.blocks?.[children[0]] as BlockWithRepr | undefined
  if (stateChild && typeof stateChild.text === "string" && stateChild.text.trim()) {
    back = stateChild.text.trim()
  } else {
    const child = (await orca.invokeBackend("get-block", children[0])) as any
    back = typeof child?.text === "string" ? child.text.trim() : ""
  }
  if (!back) return null
  if (!front) return null
  return { front, back }
}

/**
 * 同块转 basic 问答卡：#card type=basic + _repr=srs.card + srs.isCard。
 * SRS 初始化由 initQASrs 单独执行，便于失败回滚。
 */
export async function defaultCreateQAOnBlock(
  extractId: DbId,
  pluginName: string,
  content: { front: string; back: string }
): Promise<{ blockId: number } | null> {
  const block = (await orca.invokeBackend("get-block", extractId)) as any
  if (!block) return null

  const hasCardTag = block.refs?.some(
    (ref: any) => ref.type === 2 && isCardTag(ref.alias)
  )

  if (!hasCardTag) {
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      extractId,
      "card",
      await buildCardTagData(pluginName, extractId, "basic")
    )
    await ensureCardTagProperties(pluginName)
  } else {
    const cardRef = block.refs?.find(
      (ref: any) => ref.type === 2 && isCardTag(ref.alias)
    )
    if (!cardRef) {
      throw new Error("已有 #card 标签但无法读取其引用数据")
    }
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: "type", value: "basic" }]
    )
  }

  const stateBlock = orca.state.blocks?.[extractId] as BlockWithRepr | undefined
  if (stateBlock) {
    stateBlock._repr = {
      type: "srs.card",
      front: content.front,
      back: content.back,
      cardType: "basic"
    }
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [extractId],
    [{ name: "srs.isCard", value: true, type: 4 }]
  )
  invalidateBlockCache(extractId)
  return { blockId: extractId as number }
}

export async function defaultInitQASrs(
  blockId: DbId,
  options?: {
    pluginName?: string
    irPriority?: number
    initialDueOrigin?: "standard" | "ir_item"
    /** 若已算好绝对 due，优先使用（避免与返回值二次计算不一致） */
    initialDue?: Date
  }
): Promise<void> {
  const origin = options?.initialDueOrigin ?? "ir_item"
  const createdAt = new Date()
  const mode = options?.pluginName
    ? getIrItemInitialDueMode(options.pluginName)
    : "dispersed"
  const resolvedDue =
    options?.initialDue
    ?? resolveInitialDue({
      origin,
      mode,
      identity: { blockId, cardType: "basic" },
      createdAt,
      legacyDue: createdAt,
      priority: options?.irPriority
    }).due

  // IR Item：无真进度则写入/覆盖 dispersed（含 Extract 遗留顶层 srs 空壳）
  if (origin === "ir_item") {
    await ensureCardSrsStateWithInitialDue(blockId, resolvedDue, {
      forceIfNoProgress: true
    })
    return
  }

  // standard：仅缺顶层调度时初始化
  await ensureCardSrsState(blockId)
}

async function defaultCreateDirectionOnBlock(
  cursor: CursorData,
  pluginName: string,
  direction: DirectionType,
  options?: InsertDirectionOptions
): Promise<{ blockId: number } | null> {
  const result = await insertDirection(cursor, direction, pluginName, options)
  if (!result) return null
  return { blockId: result.blockId as number }
}

/**
 * Q&A / Direction 目标：type=extracts，或仍有 live IR 的非 Topic 块。
 */
export function isConvertQAOrDirectionTarget(
  cardType: string,
  hasLiveIR: boolean
): boolean {
  if (cardType === "topic") return false
  if (cardType === "extracts") return true
  if (hasLiveIR) return true
  return false
}

function resolveDeps(partial?: Partial<ConversionDeps>): ConversionDeps {
  return {
    loadState: partial?.loadState ?? loadIRState,
    ensureState: partial?.ensureState ?? ensureIRState,
    saveState: partial?.saveState ?? saveIRState,
    deleteIrOnly: partial?.deleteIrOnly ?? deleteIRSchedulingState,
    snapshotBlock: partial?.snapshotBlock ?? snapshotConversionBlock,
    restoreBlock: partial?.restoreBlock ?? restoreConversionBlock,
    createClozeOnBlock:
      partial?.createClozeOnBlock
      ?? ((cursor, pluginName, options) => createCloze(cursor, pluginName, options)),
    initSrs: partial?.initSrs ?? (async (id, clozeNumber) => {
      // createCloze 已写过 due 时 ensure 不覆盖；仅补缺时用 legacy 偏移
      await ensureClozeSrsState(id, clozeNumber, Math.max(0, clozeNumber - 1))
    }),
    deleteIncompleteItem: partial?.deleteIncompleteItem ?? defaultDeleteIncompleteItem,
    getCardType: partial?.getCardType ?? defaultGetCardType,
    hasLiveIR: partial?.hasLiveIR ?? defaultHasLiveIR,
    readSelectedText: partial?.readSelectedText ?? defaultReadSelectedText,
    findTopicId: partial?.findTopicId ?? defaultFindTopicId,
    readBookMeta: partial?.readBookMeta ?? defaultReadBookMeta,
    verifyItemCollectable: partial?.verifyItemCollectable ?? defaultVerifyItemCollectable,
    writeSourceMeta: partial?.writeSourceMeta ?? writeSourceProperties,
    resolveQAContent: partial?.resolveQAContent ?? defaultResolveQAContent,
    createQAOnBlock: partial?.createQAOnBlock ?? defaultCreateQAOnBlock,
    initQASrs: partial?.initQASrs ?? ((id, opts) => defaultInitQASrs(id, opts)),
    verifyQACollectable: partial?.verifyQACollectable ?? defaultVerifyQACollectable,
    createDirectionOnBlock: partial?.createDirectionOnBlock ?? defaultCreateDirectionOnBlock,
    verifyDirectionCollectable:
      partial?.verifyDirectionCollectable ?? defaultVerifyDirectionCollectable
  }
}

type CreatePhaseResult = {
  itemId: DbId
  clozeNumber: number
  mutatedSameBlock: boolean
  selectedText: string
  initialDue?: Date
  initialDueHint?: string
}

/**
 * 事务运行器：创建之后的 init / 来源 / 验证 / finish|keep 共用脚手架。
 * 调用方负责校验与 create，并在 create 失败时自行 safeCleanup（因同块/独立块语义不同）。
 */
async function finishConversionAfterCreate(params: {
  extractId: DbId
  pluginName: string
  strategy: IRConversionStrategy
  itemType: ConversionItemType
  deps: ConversionDeps
  extractSnapshot: IRState
  contentSnapshot: BlockContentSnapshot
  created: CreatePhaseResult
  initSrsStep: (itemId: DbId, clozeNumber: number) => Promise<void>
  verifyStep: (itemId: DbId, clozeNumber: number) => Promise<boolean>
}): Promise<ConvertExtractToItemResult> {
  const {
    extractId,
    pluginName,
    strategy,
    itemType,
    deps,
    extractSnapshot,
    contentSnapshot,
    created,
    initSrsStep,
    verifyStep
  } = params
  const {
    itemId: createdItemId,
    clozeNumber,
    mutatedSameBlock,
    selectedText,
    initialDue,
    initialDueHint
  } = created

  try {
    try {
      await initSrsStep(createdItemId, clozeNumber)
    } catch (error) {
      const cleanup = await safeCleanup(
        deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock
      )
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
      const cleanup = await safeCleanup(
        deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock
      )
      return failAfterCleanup(extractId, "write_source", error, cleanup)
    }

    const collectable = await verifyStep(createdItemId, clozeNumber)
    if (!collectable) {
      const cleanup = await safeCleanup(
        deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock
      )
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
        await deps.deleteIrOnly(extractId)
        removeIRIndexId(pluginName, extractId)
        completedExtract = true
      } catch (error) {
        const cleanup = await safeCleanup(
          deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock
        )
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
      itemType,
      extractId,
      source,
      completedExtract,
      initialDue,
      initialDueHint
    }
  } catch (error) {
    const cleanup = await safeCleanup(
      deps, createdItemId, extractId, extractSnapshot, contentSnapshot, mutatedSameBlock
    )
    return failAfterCleanup(extractId, "create_item", error, cleanup)
  }
}

async function loadSnapshots(
  deps: ConversionDeps,
  extractId: DbId
): Promise<
  | { ok: true; extractSnapshot: IRState; contentSnapshot: BlockContentSnapshot }
  | ConvertExtractToItemFailure
> {
  let extractSnapshot: IRState | null = null
  let contentSnapshot: BlockContentSnapshot | null = null
  try {
    extractSnapshot = await deps.loadState(extractId)
    contentSnapshot = await deps.snapshotBlock(extractId)
  } catch (error) {
    return fail(extractId, "validate", error, false)
  }
  if (!contentSnapshot || !extractSnapshot) {
    return fail(extractId, "validate", "无法快照 Extract 状态")
  }
  return { ok: true, extractSnapshot, contentSnapshot }
}

/**
 * Extract → Cloze 原子转化（历史主路径，create null 时强制同块回滚）。
 */
export async function convertExtractToCloze(
  input: ConvertExtractToItemInput
): Promise<ConvertExtractToItemResult> {
  const {
    extractId,
    cursor,
    pluginName,
    strategy = "complete_extract",
    createClozeOptions,
    deps: partialDeps
  } = input
  const deps = resolveDeps(partialDeps)

  const snaps = await loadSnapshots(deps, extractId)
  if (!("extractSnapshot" in snaps)) return snaps
  const { extractSnapshot, contentSnapshot } = snaps

  try {
    const cardType = await deps.getCardType(extractId)
    const hasLiveIR = await deps.hasLiveIR(extractId)
    if (!isConvertExtractTarget(cardType, hasLiveIR)) {
      return fail(
        extractId,
        "validate",
        hasLiveIR
          ? `目标不是可挖空的摘录（type=${cardType}）`
          : `目标不是 Extract（type=${cardType}）`
      )
    }
    if (!cursor?.anchor?.blockId) {
      return fail(extractId, "validate", "缺少有效选区")
    }
    const selectedText = deps.readSelectedText(cursor)
    if (!selectedText.trim()) {
      return fail(extractId, "validate", "选区文本为空")
    }

    // 创建前冻结 priority；createCloze 第一次写 due 即用 ir_item 策略
    const clozeOptions: CreateClozeOptions = {
      initialDueOrigin: "ir_item",
      irPriority: createClozeOptions?.irPriority ?? extractSnapshot.priority
    }
    const clozeResult = await deps.createClozeOnBlock(
      cursor,
      pluginName,
      clozeOptions
    )
    if (!clozeResult) {
      const cleanup = await safeCleanup(
        deps, null, extractId, extractSnapshot, contentSnapshot, true
      )
      return failAfterCleanup(extractId, "create_item", "创建 Cloze 失败", cleanup)
    }

    return finishConversionAfterCreate({
      extractId,
      pluginName,
      strategy,
      itemType: "cloze",
      deps,
      extractSnapshot,
      contentSnapshot,
      created: {
        itemId: clozeResult.blockId,
        clozeNumber: clozeResult.clozeNumber,
        mutatedSameBlock: clozeResult.blockId === extractId,
        selectedText,
        initialDue: clozeResult.initialDue,
        initialDueHint: clozeResult.initialDueHint
      },
      initSrsStep: (itemId, n) => deps.initSrs(itemId, n),
      verifyStep: (itemId, n) => deps.verifyItemCollectable(itemId, n)
    })
  } catch (error) {
    const cleanup = await safeCleanup(
      deps, null, extractId, extractSnapshot, contentSnapshot, true
    )
    return failAfterCleanup(extractId, "create_item", error, cleanup)
  }
}

/**
 * Extract → Q&A（basic 问答卡）。
 * 题面=Extract 正文，答案=首个子块；无答案子块 → validate 失败，不落半成品。
 */
export async function convertExtractToQA(
  input: ConvertExtractToQAInput
): Promise<ConvertExtractToItemResult> {
  const {
    extractId,
    pluginName,
    strategy = "complete_extract",
    deps: partialDeps
  } = input
  const deps = resolveDeps(partialDeps)

  const snaps = await loadSnapshots(deps, extractId)
  if (!("extractSnapshot" in snaps)) return snaps
  const { extractSnapshot, contentSnapshot } = snaps

  let createdItemId: DbId | null = null
  try {
    const cardType = await deps.getCardType(extractId)
    const hasLiveIR = await deps.hasLiveIR(extractId)
    if (!isConvertQAOrDirectionTarget(cardType, hasLiveIR)) {
      return fail(
        extractId,
        "validate",
        hasLiveIR
          ? `目标不是可转问答的摘录（type=${cardType}）`
          : `目标不是 Extract（type=${cardType}）`
      )
    }

    const qaContent = await deps.resolveQAContent(extractId)
    if (!qaContent) {
      return fail(extractId, "validate", "Q&A 需要答案子块")
    }

    const qaResult = await deps.createQAOnBlock(extractId, pluginName, qaContent)
    if (!qaResult) {
      const cleanup = await safeCleanup(
        deps, null, extractId, extractSnapshot, contentSnapshot, true
      )
      return failAfterCleanup(extractId, "create_item", "创建 Q&A 卡片失败", cleanup)
    }
    createdItemId = qaResult.blockId

    const createdAt = new Date()
    const qaResolved = resolveInitialDue({
      origin: "ir_item",
      mode: getIrItemInitialDueMode(pluginName),
      identity: { blockId: qaResult.blockId, cardType: "basic" },
      createdAt,
      legacyDue: createdAt,
      priority: extractSnapshot.priority
    })

    return finishConversionAfterCreate({
      extractId,
      pluginName,
      strategy,
      itemType: "qa",
      deps,
      extractSnapshot,
      contentSnapshot,
      created: {
        itemId: qaResult.blockId,
        clozeNumber: 0,
        mutatedSameBlock: qaResult.blockId === extractId,
        selectedText: qaContent.front.slice(0, 500),
        initialDue: qaResolved.due,
        initialDueHint: formatInitialDueHint(qaResolved, createdAt)
      },
      initSrsStep: async (itemId) => {
        await deps.initQASrs(itemId, {
          pluginName,
          irPriority: extractSnapshot.priority,
          initialDueOrigin: "ir_item",
          initialDue: qaResolved.due
        })
      },
      verifyStep: async (itemId) => deps.verifyQACollectable(itemId)
    })
  } catch (error) {
    const cleanup = await safeCleanup(
      deps,
      createdItemId,
      extractId,
      extractSnapshot,
      contentSnapshot,
      true
    )
    return failAfterCleanup(extractId, "create_item", error, cleanup)
  }
}

/**
 * Extract → Direction。需要 cursor 在摘录正文处分隔左右。
 * insertDirection 内已写方向 SRS；本路径补来源元数据并验证可收集。
 */
export async function convertExtractToDirection(
  input: ConvertExtractToDirectionInput
): Promise<ConvertExtractToItemResult> {
  const {
    extractId,
    cursor,
    pluginName,
    strategy = "complete_extract",
    direction = "forward",
    deps: partialDeps
  } = input
  const deps = resolveDeps(partialDeps)

  const snaps = await loadSnapshots(deps, extractId)
  if (!("extractSnapshot" in snaps)) return snaps
  const { extractSnapshot, contentSnapshot } = snaps

  let createdItemId: DbId | null = null
  try {
    const cardType = await deps.getCardType(extractId)
    const hasLiveIR = await deps.hasLiveIR(extractId)
    if (!isConvertQAOrDirectionTarget(cardType, hasLiveIR)) {
      return fail(
        extractId,
        "validate",
        hasLiveIR
          ? `目标不是可转方向卡的摘录（type=${cardType}）`
          : `目标不是 Extract（type=${cardType}）`
      )
    }
    if (!cursor?.anchor?.blockId) {
      return fail(extractId, "validate", "缺少有效光标位置")
    }
    if (cursor.anchor.blockId !== extractId) {
      return fail(extractId, "validate", "请在当前摘录正文中放置光标")
    }

    const selectedText = (() => {
      try {
        const block = orca.state.blocks?.[extractId] as any
        const text = typeof block?.text === "string" ? block.text : ""
        const offset = cursor.anchor.offset ?? 0
        const left = text.substring(0, offset).trim()
        return left || text.trim() || deps.readSelectedText(cursor)
      } catch {
        return deps.readSelectedText(cursor)
      }
    })()

    const dirResult = await deps.createDirectionOnBlock(
      cursor,
      pluginName,
      direction,
      {
        initialDueOrigin: "ir_item",
        irPriority: extractSnapshot.priority
      }
    )
    if (!dirResult) {
      // insertDirection 可能已改正文；强制同块回滚
      const cleanup = await safeCleanup(
        deps, null, extractId, extractSnapshot, contentSnapshot, true
      )
      return failAfterCleanup(extractId, "create_item", "创建方向卡失败", cleanup)
    }
    createdItemId = dirResult.blockId

    return finishConversionAfterCreate({
      extractId,
      pluginName,
      strategy,
      itemType: "direction",
      deps,
      extractSnapshot,
      contentSnapshot,
      created: {
        itemId: dirResult.blockId,
        clozeNumber: 0,
        mutatedSameBlock: dirResult.blockId === extractId,
        selectedText: selectedText.slice(0, 500)
        // createDirectionOnBlock 默认返回类型未带 due；insertDirection 已 toast
      },
      // insertDirection 已写入方向 SRS
      initSrsStep: async () => undefined,
      verifyStep: async (itemId) => deps.verifyDirectionCollectable(itemId)
    })
  } catch (error) {
    const cleanup = await safeCleanup(
      deps,
      createdItemId,
      extractId,
      extractSnapshot,
      contentSnapshot,
      true
    )
    return failAfterCleanup(extractId, "create_item", error, cleanup)
  }
}

/**
 * 统一入口：按 itemType 分发，默认 cloze（兼容旧调用点）。
 */
export async function convertExtractToItem(
  input: ConvertExtractToItemInput
): Promise<ConvertExtractToItemResult> {
  const itemType = input.itemType ?? "cloze"
  if (itemType === "qa") {
    return convertExtractToQA({
      extractId: input.extractId,
      pluginName: input.pluginName,
      strategy: input.strategy,
      cursor: input.cursor,
      deps: input.deps
    })
  }
  if (itemType === "direction") {
    return convertExtractToDirection({
      extractId: input.extractId,
      cursor: input.cursor,
      pluginName: input.pluginName,
      strategy: input.strategy,
      direction: input.direction,
      deps: input.deps
    })
  }
  return convertExtractToCloze(input)
}

export function shouldPreserveExtractOnFailure(result: ConvertExtractToItemResult): boolean {
  return !result.ok && result.extractPreserved === true
}
