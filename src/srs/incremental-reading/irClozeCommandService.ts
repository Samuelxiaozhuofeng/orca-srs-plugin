import type { Block, ContentFragment, CursorData, DbId } from "../../orca.d.ts"
import { cloneBlockContent, createCloze } from "../clozeUtils"
import { extractCardType } from "../deckUtils"
import { convertExtractToItem } from "./irConversionService"
import { blockHasLiveIRScheduling } from "./irHybridExtract"

export type ClozeCommandResult = {
  blockId: DbId
  clozeNumber: number
  /** 挖空前 content 快照；经 commands undo 时还原正文 */
  originalContent?: ContentFragment[]
  pluginName?: string
  addedCardTag?: boolean
  wroteInitialClozeSrs?: boolean
  isFirstClozeCard?: boolean
}

export type IRClozeCommandDeps = {
  getBlock: (id: DbId) => Promise<Block | null>
  createRegularCloze: typeof createCloze
  convertExtract: typeof convertExtractToItem
}

function resolveDeps(partial?: Partial<IRClozeCommandDeps>): IRClozeCommandDeps {
  return {
    getBlock: partial?.getBlock ?? (async id => {
      const inState = orca.state.blocks?.[id] as Block | undefined
      if (inState) return inState
      return (await orca.invokeBackend("get-block", id)) as Block | null
    }),
    createRegularCloze: partial?.createRegularCloze ?? createCloze,
    convertExtract: partial?.convertExtract ?? convertExtractToItem
  }
}

export async function createClozeFromEditorCommand(
  cursor: CursorData,
  pluginName: string,
  partialDeps?: Partial<IRClozeCommandDeps>
): Promise<ClozeCommandResult | null> {
  const deps = resolveDeps(partialDeps)
  const blockId = cursor.anchor.blockId
  const block = await deps.getBlock(blockId)

  const cardType = block ? extractCardType(block) : "basic"
  // First dig: extracts. Later digs after keep_extract: type=cloze + live IR.
  const useExtractConvert =
    cardType === "extracts"
    || (cardType === "cloze" && blockHasLiveIRScheduling(block))
  if (!block || !useExtractConvert) {
    // createCloze 返回含 originalContent 的 undoArgs，经 commands 原样透传
    return deps.createRegularCloze(cursor, pluginName)
  }

  // Extract 路径：convert 前快照正文，确保 Cmd+Z 能去掉残留 .cloze fragment
  const originalContent = cloneBlockContent(block.content)

  const result = await deps.convertExtract({
    extractId: blockId,
    cursor,
    pluginName,
    strategy: "keep_extract"
  })
  if (!result.ok) {
    throw new Error(`Extract 制卡失败（${result.step}）：${result.error}`)
  }
  return {
    blockId: result.itemId,
    clozeNumber: result.clozeNumber,
    pluginName,
    originalContent,
    // Extract 转化通常已在块上保留/写入 cloze；撤销只还原正文 + 本次编号 SRS
    wroteInitialClozeSrs: true,
    isFirstClozeCard: false,
    addedCardTag: false
  }
}
