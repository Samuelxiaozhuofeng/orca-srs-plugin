/**
 * 卡片浏览器批量写入：暂停 / 激活 / 重置 / 改牌组。
 *
 * 约束（与 AGENTS.md / 用户契约对齐）：
 * - 逐项有界执行，返回真实 partial success/failure；不得空 catch 或用 []/null 隐藏失败
 * - cardKey 身份；牌组写入按 block 去重
 * - 牌组是 #card 引用数据「牌组」= RefData id 数组，非字符串；Default 写空数组
 */

import type { Block, DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import {
  cardKeyFromReviewCard,
  inferCardType
} from "../../srs/cardIdentity"
import { isCardTag } from "../../srs/tagUtils"
import { getDeckTargetBlockId } from "../../srs/deckUtils"
import {
  activatePendingCards,
  suspendCard,
  unsuspendCard
} from "../../srs/cardStatusUtils"
import {
  invalidateBlockCache,
  resetCardSrsState,
  resetClozeSrsState,
  resetDirectionSrsState
} from "../../srs/storage"
import { invalidateIrBlockCache } from "../../srs/incremental-reading/irBlockCache"
import {
  dedupeCardsByBlockId,
  resolveBrowserStatus
} from "./cardBrowserQuery"

const DECK_PROPERTY_NAME = "牌组"
const REF_TYPE_REFDATA = 3
const DEFAULT_DECK_NAME = "Default"

export type BatchItemSuccess = {
  cardKey: string
  blockId: DbId
}

export type BatchItemFailure = {
  cardKey: string
  blockId: DbId
  error: string
}

export type BatchItemSkipped = {
  cardKey: string
  blockId: DbId
  reason: string
}

export type BatchActionResult = {
  success: BatchItemSuccess[]
  failed: BatchItemFailure[]
  skipped: BatchItemSkipped[]
}

function emptyResult(): BatchActionResult {
  return { success: [], failed: [], skipped: [] }
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadBlockBackendFirst(blockId: DbId): Promise<Block> {
  let block: Block | null | undefined
  try {
    block = (await orca.invokeBackend("get-block", blockId)) as
      | Block
      | null
      | undefined
  } catch (error) {
    const detail = errMessage(error)
    throw new Error(
      `读取块 #${blockId} 失败（后端 get-block 抛错：${detail}）`,
      { cause: error }
    )
  }
  if (!block) {
    throw new Error(`找不到块 #${blockId}（后端 get-block 返回空）`)
  }
  return block
}

function findCardRef(
  block: Block
): NonNullable<Block["refs"]>[number] | null {
  return (
    block.refs?.find((ref) => ref.type === 2 && isCardTag(ref.alias)) ?? null
  )
}

function isFinitePositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/**
 * 从当前全部 active+suspended 卡中找目标牌组的代表块，backend-first 解析牌组 block id。
 * 找不到必须抛错，不得退 Default。
 */
export async function resolveDeckTargetBlockIdFromCards(
  deckName: string,
  sourceCards: readonly ReviewCard[]
): Promise<DbId> {
  const wanted = deckName.trim()
  if (!wanted || wanted === DEFAULT_DECK_NAME) {
    throw new Error(
      `牌组「${wanted || DEFAULT_DECK_NAME}」无需解析目标块（Default 写空数组）`
    )
  }

  const candidates = sourceCards.filter((c) => c.deck === wanted)
  if (candidates.length === 0) {
    throw new Error(
      `找不到牌组「${wanted}」的代表卡片，无法解析牌组块（请确认该牌组仍存在于当前收集结果）`
    )
  }

  const triedBlockIds = new Set<string>()
  let lastError: string | null = null

  for (const card of candidates) {
    const idKey = String(card.id)
    if (triedBlockIds.has(idKey)) continue
    triedBlockIds.add(idKey)
    try {
      const block = await loadBlockBackendFirst(card.id)
      const deckBlockId = getDeckTargetBlockId(block)
      if (deckBlockId != null) {
        return deckBlockId
      }
      lastError = `块 #${card.id} 上牌组「${wanted}」无有效 RefData 目标`
    } catch (error) {
      lastError = errMessage(error)
      console.error(
        `[cardBrowserBatch] 解析牌组「${wanted}」代表块 #${card.id} 失败:`,
        error
      )
    }
  }

  throw new Error(
    `无法解析牌组「${wanted}」的目标块：${lastError ?? "无可用代表"}`
  )
}

/**
 * 将单个卡片块的 #card「牌组」写为 Default（空数组）或 [refId]。
 * 成功后 invalidateBlockCache + invalidateIrBlockCache。
 */
export async function writeCardDeckProperty(
  blockId: DbId,
  targetDeckBlockId: DbId | null
): Promise<void> {
  const block = await loadBlockBackendFirst(blockId)
  const cardRef = findCardRef(block)
  if (!cardRef) {
    throw new Error(`块 #${blockId} 没有 #card 标签，无法改牌组`)
  }

  if (targetDeckBlockId == null) {
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: DECK_PROPERTY_NAME, value: [] }]
    )
  } else {
    const refId = await orca.commands.invokeEditorCommand(
      "core.editor.createRef",
      null,
      blockId,
      targetDeckBlockId,
      REF_TYPE_REFDATA
    )
    if (!isFinitePositiveId(refId)) {
      throw new Error(
        `createRef 返回非法 refId（blockId=${blockId}, deckBlockId=${targetDeckBlockId}, got=${String(refId)}）`
      )
    }
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      cardRef,
      [{ name: DECK_PROPERTY_NAME, value: [refId] }]
    )
  }

  invalidateBlockCache(blockId)
  invalidateIrBlockCache(blockId)
}

/** 批量暂停：逐 cardKey 调 suspendCard（变体级语义） */
export async function batchSuspendCards(
  cards: readonly ReviewCard[]
): Promise<BatchActionResult> {
  const result = emptyResult()
  for (const card of cards) {
    const cardKey = cardKeyFromReviewCard(card)
    try {
      await suspendCard(card)
      result.success.push({ cardKey, blockId: card.id })
    } catch (error) {
      const message = errMessage(error)
      console.error(
        `[cardBrowserBatch] 暂停失败 cardKey=${cardKey} blockId=${card.id}:`,
        error
      )
      result.failed.push({ cardKey, blockId: card.id, error: message })
    }
  }
  return result
}

/**
 * 批量激活：
 * - pending：按 block id 去重后 activatePendingCards
 * - suspended：逐 cardKey unsuspendCard
 * - 正常卡：跳过（不计成功）
 */
export async function batchActivateCards(
  cards: readonly ReviewCard[],
  options: { pluginName: string }
): Promise<BatchActionResult> {
  const result = emptyResult()
  const pendingCards: ReviewCard[] = []
  const suspendedCards: ReviewCard[] = []

  for (const card of cards) {
    const status = resolveBrowserStatus(card)
    if (status === "pending") {
      pendingCards.push(card)
    } else if (status === "suspended") {
      suspendedCards.push(card)
    } else {
      result.skipped.push({
        cardKey: cardKeyFromReviewCard(card),
        blockId: card.id,
        reason: "已是正常状态，跳过激活"
      })
    }
  }

  // pending：块级去重
  const pendingByBlock = dedupeCardsByBlockId(pendingCards)
  if (pendingByBlock.length > 0) {
    const blockIds = pendingByBlock.map((c) => c.id)
    const activated = await activatePendingCards(blockIds)
    const failedByBlock = new Map(
      activated.failed.map((f) => [String(f.blockId), f.error])
    )
    const okBlocks = new Set(activated.activated.map((id) => String(id)))

    for (const card of pendingCards) {
      const cardKey = cardKeyFromReviewCard(card)
      const idKey = String(card.id)
      if (okBlocks.has(idKey)) {
        // 同块多变体：每条选择都计成功（写入只发生一次）
        if (!result.success.some((s) => s.cardKey === cardKey)) {
          result.success.push({ cardKey, blockId: card.id })
        }
      } else if (failedByBlock.has(idKey)) {
        if (!result.failed.some((f) => f.cardKey === cardKey)) {
          result.failed.push({
            cardKey,
            blockId: card.id,
            error: failedByBlock.get(idKey) ?? "激活失败"
          })
        }
      }
    }
  }

  for (const card of suspendedCards) {
    const cardKey = cardKeyFromReviewCard(card)
    try {
      await unsuspendCard(card, { pluginName: options.pluginName })
      result.success.push({ cardKey, blockId: card.id })
    } catch (error) {
      const message = errMessage(error)
      console.error(
        `[cardBrowserBatch] 取消暂停失败 cardKey=${cardKey} blockId=${card.id}:`,
        error
      )
      result.failed.push({ cardKey, blockId: card.id, error: message })
    }
  }

  return result
}

/** 批量重置：按 cardKey 调 storage reset*，失败可见 */
export async function batchResetCards(
  cards: readonly ReviewCard[]
): Promise<BatchActionResult> {
  const result = emptyResult()
  for (const card of cards) {
    const cardKey = cardKeyFromReviewCard(card)
    try {
      if (card.clozeNumber != null && card.clozeNumber > 0) {
        await resetClozeSrsState(card.id, card.clozeNumber)
      } else if (card.directionType) {
        await resetDirectionSrsState(card.id, card.directionType)
      } else {
        await resetCardSrsState(card.id)
      }
      result.success.push({ cardKey, blockId: card.id })
    } catch (error) {
      const message = errMessage(error)
      console.error(
        `[cardBrowserBatch] 重置失败 cardKey=${cardKey} blockId=${card.id} type=${inferCardType(card)}:`,
        error
      )
      result.failed.push({ cardKey, blockId: card.id, error: message })
    }
  }
  return result
}

/**
 * 批量改牌组：按 block 去重写入。
 * targetDeckName 必须是现有来源牌组（含 Default）；新建牌组不支持。
 * sourceCardsForResolve = 当前全部 active+suspended，用于解析非 Default 目标块。
 */
export async function batchChangeDeck(
  cards: readonly ReviewCard[],
  targetDeckName: string,
  sourceCardsForResolve: readonly ReviewCard[]
): Promise<BatchActionResult> {
  const result = emptyResult()
  const wanted = targetDeckName.trim()
  if (!wanted) {
    for (const card of cards) {
      result.failed.push({
        cardKey: cardKeyFromReviewCard(card),
        blockId: card.id,
        error: "目标牌组名为空"
      })
    }
    return result
  }

  let targetDeckBlockId: DbId | null = null
  if (wanted !== DEFAULT_DECK_NAME) {
    try {
      targetDeckBlockId = await resolveDeckTargetBlockIdFromCards(
        wanted,
        sourceCardsForResolve
      )
    } catch (error) {
      const message = errMessage(error)
      console.error(
        `[cardBrowserBatch] 解析目标牌组「${wanted}」失败:`,
        error
      )
      for (const card of cards) {
        result.failed.push({
          cardKey: cardKeyFromReviewCard(card),
          blockId: card.id,
          error: message
        })
      }
      return result
    }
  }

  // 块级去重：同块多变体只写一次
  const uniqueBlocks = dedupeCardsByBlockId(cards)
  const blockOutcome = new Map<string, { ok: boolean; error?: string }>()

  for (const card of uniqueBlocks) {
    const idKey = String(card.id)
    try {
      await writeCardDeckProperty(card.id, targetDeckBlockId)
      blockOutcome.set(idKey, { ok: true })
    } catch (error) {
      const message = errMessage(error)
      console.error(
        `[cardBrowserBatch] 改牌组失败 blockId=${card.id} → ${wanted}:`,
        error
      )
      blockOutcome.set(idKey, { ok: false, error: message })
    }
  }

  // 把块级结果展开回所选 cardKey（同块变体共享结果）
  for (const card of cards) {
    const cardKey = cardKeyFromReviewCard(card)
    const outcome = blockOutcome.get(String(card.id))
    if (!outcome) {
      result.failed.push({
        cardKey,
        blockId: card.id,
        error: "内部错误：缺少块级写入结果"
      })
      continue
    }
    if (outcome.ok) {
      result.success.push({ cardKey, blockId: card.id })
    } else {
      result.failed.push({
        cardKey,
        blockId: card.id,
        error: outcome.error ?? "改牌组失败"
      })
    }
  }

  return result
}

/** 汇总通知文案 */
export function formatBatchResultSummary(
  actionLabel: string,
  result: BatchActionResult
): string {
  const parts = [
    `${actionLabel}：成功 ${result.success.length}`,
    result.failed.length > 0 ? `失败 ${result.failed.length}` : null,
    result.skipped.length > 0 ? `跳过 ${result.skipped.length}` : null
  ].filter(Boolean)
  return parts.join("，")
}

/** 失败摘要（最多 n 条）供 toolbar role=alert */
export function formatBatchFailureLines(
  result: BatchActionResult,
  maxLines = 5
): string[] {
  return result.failed.slice(0, maxLines).map((f) => {
    return `#${f.blockId} (${f.cardKey}): ${f.error}`
  })
}
