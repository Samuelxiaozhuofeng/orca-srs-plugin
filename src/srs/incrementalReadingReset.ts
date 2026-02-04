import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { stopAutoMarkExtract } from "./incrementalReadingAutoMark"
import { deleteIRState } from "./incrementalReadingStorage"
import {
  getStoredIncrementalReadingSessionBlockId,
  IR_SESSION_FOCUS_CARD_KEY,
  cleanupIncrementalReadingSessionBlock
} from "./incrementalReadingSessionManager"
import { INCREMENTAL_READING_SETTINGS_KEYS, getIncrementalReadingSettings } from "./settings/incrementalReadingSettingsSchema"
import { deleteCardSrsData } from "./storage"

export type ResetIncrementalReadingResult = {
  totalFound: number
  totalCleaned: number
  disabledAutoExtractMark: boolean
  sessionBlockId: DbId | null
  errors: Array<{ blockId: DbId; error: unknown }>
}

export function selectIncrementalReadingCardIdsFromBlocks(blocks: Block[]): DbId[] {
  const topicIds: DbId[] = []
  const extractIds: DbId[] = []

  for (const block of blocks) {
    const cardType = extractCardType(block)
    if (cardType === "topic") {
      topicIds.push(block.id)
      continue
    }
    if (cardType === "extracts") {
      extractIds.push(block.id)
    }
  }

  // Prefer deleting topics first to avoid any accidental re-marking if auto mark is still active.
  const ordered = [...topicIds, ...extractIds]
  const deduped = Array.from(new Set(ordered))
  return deduped
}

async function collectBlocksWithCardTag(pluginName: string): Promise<Block[]> {
  void pluginName
  const possibleTags = ["card", "Card"]
  const blocksById = new Map<DbId, Block>()

  for (const tag of possibleTags) {
    try {
      const result = await orca.invokeBackend("get-blocks-with-tags", [tag]) as Block[] | undefined
      for (const block of result ?? []) {
        blocksById.set(block.id, block)
      }
    } catch (error) {
      // Best-effort: querying tags may fail on older Orca versions.
      console.warn(`[IR Reset] 查询标签 "${tag}" 失败:`, error)
    }
  }

  return Array.from(blocksById.values())
}

async function cleanupOneIRCard(blockId: DbId): Promise<void> {
  await deleteCardSrsData(blockId)
  await deleteIRState(blockId)
  await orca.commands.invokeEditorCommand(
    "core.editor.removeTag",
    null,
    blockId,
    "card"
  )

  const stateBlock = orca.state.blocks?.[blockId] as any
  if (stateBlock && stateBlock._repr) {
    delete stateBlock._repr
  }
}

export async function resetIncrementalReadingData(
  pluginName: string,
  options: { disableAutoExtractMark?: boolean } = {}
): Promise<ResetIncrementalReadingResult> {
  const errors: Array<{ blockId: DbId; error: unknown }> = []

  const { disableAutoExtractMark = true } = options
  let disabledAutoExtractMark = false

  if (disableAutoExtractMark) {
    try {
      const { enableAutoExtractMark } = getIncrementalReadingSettings(pluginName)
      if (enableAutoExtractMark) {
        await orca.plugins.setSettings("app", pluginName, {
          [INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark]: false
        })
        disabledAutoExtractMark = true
      }
    } catch (error) {
      console.warn("[IR Reset] 关闭“自动标签”开关失败（将继续清理）:", error)
    } finally {
      stopAutoMarkExtract(pluginName)
    }
  }

  const blocks = await collectBlocksWithCardTag(pluginName)
  const cardIds = selectIncrementalReadingCardIdsFromBlocks(blocks)

  let totalCleaned = 0
  for (const blockId of cardIds) {
    try {
      await cleanupOneIRCard(blockId)
      totalCleaned += 1
    } catch (error) {
      errors.push({ blockId, error })
    }
  }

  let sessionBlockId: DbId | null = null
  try {
    sessionBlockId = await getStoredIncrementalReadingSessionBlockId(pluginName)
    if (sessionBlockId) {
      await deleteIRState(sessionBlockId)
      const stateBlock = orca.state.blocks?.[sessionBlockId] as any
      if (stateBlock && stateBlock._repr?.type === "srs.ir-session") {
        delete stateBlock._repr
      }
    }
  } catch (error) {
    console.warn("[IR Reset] 清理会话块 ir.* 属性失败:", error)
  }

  try {
    await orca.plugins.removeData(pluginName, IR_SESSION_FOCUS_CARD_KEY)
  } catch (error) {
    console.warn("[IR Reset] 清理 focusCardId 失败:", error)
  }

  try {
    await cleanupIncrementalReadingSessionBlock(pluginName)
  } catch (error) {
    console.warn("[IR Reset] 清理会话块记录失败:", error)
  }

  return {
    totalFound: cardIds.length,
    totalCleaned,
    disabledAutoExtractMark,
    sessionBlockId,
    errors
  }
}

