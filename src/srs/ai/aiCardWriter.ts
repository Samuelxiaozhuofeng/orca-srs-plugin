/**
 * AI 闪卡分组写入：成功为一组 undo；失败时尽力回滚并校验残留 ID。
 *
 * Rollback is best-effort, not a hard transaction guarantee:
 * - Records source children before write (low concurrency assumed during modal save)
 * - Tracks returned top-level IDs immediately
 * - On failure: re-fetches source, unions newly appeared children, deletes in a
 *   non-undoable group, then verifies backend-first and reports orphans
 */

import type { Block, ContentFragment } from "../../orca.d.ts"
import { ensureCardSrsState, writeInitialClozeSrsState } from "../storage"
import { ensureCardTagProperties } from "../tagPropertyInit"
import { buildCardTagData } from "../cardTagDataBuilder"
import { createCardBatchId, writeCardBatchId } from "../cardBatch"
import { validateEditableDraft } from "./aiDraftParseValidate"
import type {
  AICardDraft,
  BasicCardDraft,
  ChoiceCardDraft,
  ClozeCardDraft
} from "./aiDraftTypes"
import type { BlockWithRepr } from "../blockUtils"
import { resolveFrontBack } from "../blockUtils"

export interface WriteAICardsOptions {
  pluginName: string
  sourceBlockId: number
  drafts: AICardDraft[]
  /**
   * 生成时实际使用的源文本。
   *
   * 必须能由调用方指定：写入父块不一定就是生成来源（快捷制卡把卡片挂在
   * 包装块下，包装块的正文只是个标题）。用父块 text 复校会让所有草稿判为
   * 「依据未出现在源文本中」，整批无法保存。缺省时回退父块正文。
   */
  sourceText?: string
  /**
   * 建好卡但先不排期，由用户在 Flash Home 批量激活。
   * 一次写 12 张会瞬间打爆当日新卡额度并打乱 FSRS 的新卡节奏。
   */
  startPending?: boolean
  /** 同批标记；缺省自动生成。多于一张时才有聚簇意义。 */
  batchId?: string
}

export interface WriteAICardsSuccess {
  success: true
  createdBlockIds: number[]
}

export interface WriteAICardsFailure {
  success: false
  error: { code: string; message: string }
  /** Residual block IDs after best-effort cleanup (or candidates if verify failed) */
  orphanBlockIds?: number[]
}

export type WriteAICardsResult = WriteAICardsSuccess | WriteAICardsFailure

/** 每张卡写入后统一打的标记。 */
type CardStampOptions = {
  batchId: string
  status: "" | "pending"
}

/**
 * 同批标记 + 待激活状态。
 * 属性写失败必须冒泡：静默失败会让聚簇「有时生效」，比不做更难排查。
 */
async function stampCard(blockId: number, stamp: CardStampOptions): Promise<void> {
  await writeCardBatchId(blockId, stamp.batchId)
}

/**
 * 构造 Cloze 内容片段：在 insertBlock 前完成，避免 setBlockContent
 */
export function buildClozeContentFragments(
  text: string,
  clozeText: string,
  pluginName: string,
  clozeNumber = 1
): ContentFragment[] {
  const clozeIndex = text.indexOf(clozeText)
  if (clozeIndex === -1) {
    throw new Error("clozeText 未出现在 text 中")
  }

  const beforeText = text.substring(0, clozeIndex)
  const afterText = text.substring(clozeIndex + clozeText.length)
  const fragments: ContentFragment[] = []

  if (beforeText) {
    fragments.push({ t: "t", v: beforeText })
  }

  fragments.push({
    t: `${pluginName}.cloze`,
    v: clozeText,
    clozeNumber
  } as ContentFragment)

  if (afterText) {
    fragments.push({ t: "t", v: afterText })
  }

  return fragments
}

/**
 * Backend-first block resolve.
 * Successful get-block returning null/undefined = not found (no state fallback).
 * State is only used when the backend call throws.
 */
export async function resolveBlockBackendFirst(
  blockId: number
): Promise<Block | null> {
  try {
    const fromBackend = (await orca.invokeBackend("get-block", blockId)) as
      | Block
      | null
      | undefined
    if (fromBackend == null) {
      return null
    }
    return fromBackend
  } catch {
    return (orca.state.blocks[blockId] as Block | undefined) ?? null
  }
}

function childIdsOf(block: Block | null | undefined): number[] {
  if (!block || !Array.isArray(block.children)) return []
  return block.children.filter((id): id is number => typeof id === "number")
}

function unionIds(a: number[], b: number[]): number[] {
  return Array.from(new Set([...a, ...b]))
}

async function insertBasicCard(
  parentBlock: Block,
  card: BasicCardDraft,
  pluginName: string,
  trackTopLevel: (id: number) => void,
  stamp: CardStampOptions
): Promise<number> {
  const questionBlockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    [{ t: "t", v: card.question }]
  )) as number | null

  if (!questionBlockId) {
    throw new Error("创建问题块失败")
  }

  trackTopLevel(questionBlockId)

  const questionBlock = await resolveBlockBackendFirst(questionBlockId)
  if (!questionBlock) {
    throw new Error("无法获取问题块")
  }

  const answerBlockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    questionBlock,
    "lastChild",
    [{ t: "t", v: card.answer }]
  )) as number | null

  if (!answerBlockId) {
    throw new Error("创建答案块失败")
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    questionBlockId,
    "card",
    await buildCardTagData(pluginName, questionBlockId, "basic", stamp.status)
  )

  await stampCard(questionBlockId, stamp)
  await ensureCardSrsState(questionBlockId)
  return questionBlockId
}

/**
 * 写入选择题卡。
 *
 * 结构与 `createChoiceCardFromBlock` 手工创建的完全一致，否则复习渲染器
 * 与 `extractChoiceOptions` 认不出来：
 *   题干块（#card type=choice + #choice，_repr = srs.choice-card）
 *     └── 每个选项一个直接子块，正确项打 #correct
 */
async function insertChoiceCard(
  parentBlock: Block,
  card: ChoiceCardDraft,
  pluginName: string,
  trackTopLevel: (id: number) => void,
  stamp: CardStampOptions
): Promise<number> {
  const questionBlockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    [{ t: "t", v: card.question }]
  )) as number | null

  if (!questionBlockId) {
    throw new Error("创建选择题题干块失败")
  }

  trackTopLevel(questionBlockId)

  const questionBlock = await resolveBlockBackendFirst(questionBlockId)
  if (!questionBlock) {
    throw new Error("无法获取选择题题干块")
  }

  // 选项必须按顺序逐个插入：lastChild 语义依赖前一次插入已落库
  for (const option of card.options) {
    const optionBlockId = (await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      questionBlock,
      "lastChild",
      [{ t: "t", v: option.text }]
    )) as number | null

    if (!optionBlockId) {
      throw new Error("创建选项块失败")
    }

    if (option.correct) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        optionBlockId,
        "correct"
      )
    }
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    questionBlockId,
    "card",
    await buildCardTagData(pluginName, questionBlockId, "choice", stamp.status)
  )

  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    questionBlockId,
    "choice"
  )

  // _repr 决定复习界面用哪个渲染器；缺了它这张卡会退化成普通问答卡
  const liveBlock = orca.state.blocks?.[questionBlockId] as
    | BlockWithRepr
    | undefined
  if (liveBlock) {
    const { front, back } = resolveFrontBack(liveBlock)
    liveBlock._repr = {
      type: "srs.choice-card",
      front,
      back,
      cardType: "choice"
    }
  } else {
    console.warn(
      `[${pluginName}] 选择题块 #${questionBlockId} 不在 state 中，_repr 未设置`
    )
  }

  await stampCard(questionBlockId, stamp)
  await ensureCardSrsState(questionBlockId)
  return questionBlockId
}

async function insertClozeCard(
  parentBlock: Block,
  card: ClozeCardDraft,
  pluginName: string,
  trackTopLevel: (id: number) => void,
  stamp: CardStampOptions
): Promise<number> {
  const content = buildClozeContentFragments(card.text, card.clozeText, pluginName, 1)

  const blockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    content
  )) as number | null

  if (!blockId) {
    throw new Error("创建填空卡块失败")
  }

  trackTopLevel(blockId)

  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    blockId,
    "card",
    await buildCardTagData(pluginName, blockId, "cloze", stamp.status)
  )

  await stampCard(blockId, stamp)
  await writeInitialClozeSrsState(blockId, 1, 0)
  return blockId
}

/**
 * Collect rollback candidates: tracked IDs ∪ newly appeared direct children of source.
 * Assumes low concurrency during modal save (no other concurrent child inserts).
 */
export function collectRollbackCandidates(
  trackedIds: number[],
  childrenBefore: number[],
  childrenAfter: number[]
): number[] {
  const before = new Set(childrenBefore)
  const newlyAppeared = childrenAfter.filter(id => !before.has(id))
  return unionIds(trackedIds, newlyAppeared)
}

/**
 * Verify which of the given IDs still exist (backend-first).
 * If verification cannot run at all, returns candidates conservatively.
 */
export async function verifyDeletedBlocks(
  blockIds: number[]
): Promise<{ remaining: number[]; verificationFailed: boolean }> {
  if (blockIds.length === 0) {
    return { remaining: [], verificationFailed: false }
  }

  const remaining: number[] = []
  let anyCallSucceeded = false
  let anyCallThrew = false

  for (const id of blockIds) {
    try {
      const block = (await orca.invokeBackend("get-block", id)) as
        | Block
        | null
        | undefined
      anyCallSucceeded = true
      if (block != null) {
        remaining.push(id)
      }
    } catch {
      anyCallThrew = true
      // Conservative: if we cannot check, keep as remaining candidate
      remaining.push(id)
    }
  }

  if (!anyCallSucceeded && anyCallThrew) {
    return { remaining: [...blockIds], verificationFailed: true }
  }

  return { remaining, verificationFailed: false }
}

async function rollbackCreatedBlocks(blockIds: number[]): Promise<number[]> {
  if (blockIds.length === 0) return []

  try {
    await orca.commands.invokeGroup(
      async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          blockIds
        )
      },
      { undoable: false, topGroup: true }
    )
  } catch {
    // still verify what remains
  }

  const { remaining, verificationFailed } = await verifyDeletedBlocks(blockIds)
  if (verificationFailed) {
    return blockIds
  }
  return remaining
}

/**
 * 将选中草稿写入源块下。成功时整批为一次 undo；失败时尽力删除本批顶层卡块。
 */
export async function writeAICardDrafts(
  options: WriteAICardsOptions
): Promise<WriteAICardsResult> {
  const { pluginName, sourceBlockId, drafts } = options
  const stamp: CardStampOptions = {
    batchId: options.batchId ?? createCardBatchId("ai"),
    status: options.startPending === true ? "pending" : ""
  }

  if (drafts.length === 0) {
    return {
      success: false,
      error: { code: "NO_SELECTION", message: "请至少选择一张卡片" }
    }
  }

  const sourceBlock = await resolveBlockBackendFirst(sourceBlockId)
  if (!sourceBlock) {
    return {
      success: false,
      error: { code: "SOURCE_MISSING", message: "源块不存在或无法加载" }
    }
  }

  const sourceText = (options.sourceText ?? sourceBlock.text ?? "").trim()
  if (!sourceText) {
    return {
      success: false,
      error: { code: "EMPTY_SOURCE", message: "源块内容为空，无法保存" }
    }
  }

  for (const draft of drafts) {
    const err = validateEditableDraft(draft, sourceText)
    if (err) {
      return {
        success: false,
        error: { code: "VALIDATION", message: err }
      }
    }
  }

  await ensureCardTagProperties(pluginName)

  const childrenBefore = childIdsOf(sourceBlock)
  const createdBlockIds: number[] = []
  const trackTopLevel = (id: number) => {
    if (!createdBlockIds.includes(id)) {
      createdBlockIds.push(id)
    }
  }

  try {
    await orca.commands.invokeGroup(
      async () => {
        const parent = await resolveBlockBackendFirst(sourceBlockId)
        if (!parent) {
          throw new Error("源块已不存在，未写入卡片")
        }

        for (const draft of drafts) {
          if (draft.type === "basic") {
            await insertBasicCard(parent, draft, pluginName, trackTopLevel, stamp)
          } else if (draft.type === "choice") {
            await insertChoiceCard(parent, draft, pluginName, trackTopLevel, stamp)
          } else {
            await insertClozeCard(parent, draft, pluginName, trackTopLevel, stamp)
          }
        }
      },
      { undoable: true, topGroup: true }
    )

    return { success: true, createdBlockIds: [...createdBlockIds] }
  } catch (error) {
    // After failure: union tracked IDs with newly appeared children (commit-then-reject)
    let childrenAfter: number[] = childrenBefore
    try {
      const afterBlock = await resolveBlockBackendFirst(sourceBlockId)
      childrenAfter = childIdsOf(afterBlock)
    } catch {
      // keep childrenBefore-only tracked path
    }

    const candidates = collectRollbackCandidates(
      createdBlockIds,
      childrenBefore,
      childrenAfter
    )
    const orphans = await rollbackCreatedBlocks(candidates)
    const message =
      error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: {
        code: "WRITE_FAILED",
        message: `保存失败（已尝试回滚）：${message}`
      },
      orphanBlockIds: orphans.length > 0 ? orphans : undefined
    }
  }
}
