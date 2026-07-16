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
import { validateEditableDraft } from "./aiDraftParseValidate"
import type { AICardDraft, BasicCardDraft, ClozeCardDraft } from "./aiDraftTypes"

export interface WriteAICardsOptions {
  pluginName: string
  sourceBlockId: number
  drafts: AICardDraft[]
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
  trackTopLevel: (id: number) => void
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
    await buildCardTagData(pluginName, questionBlockId, "basic")
  )

  await ensureCardSrsState(questionBlockId)
  return questionBlockId
}

async function insertClozeCard(
  parentBlock: Block,
  card: ClozeCardDraft,
  pluginName: string,
  trackTopLevel: (id: number) => void
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
    await buildCardTagData(pluginName, blockId, "cloze")
  )

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

  const sourceText = (sourceBlock.text ?? "").trim()
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
            await insertBasicCard(parent, draft, pluginName, trackTopLevel)
          } else {
            await insertClozeCard(parent, draft, pluginName, trackTopLevel)
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
