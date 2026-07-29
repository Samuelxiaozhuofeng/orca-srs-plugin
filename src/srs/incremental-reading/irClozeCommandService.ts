import type { Block, ContentFragment, CursorData, DbId } from "../../orca.d.ts"
import { cloneBlockContent, createCloze } from "../clozeUtils"
import { extractCardType } from "../deckUtils"
import { getIrItemCreateOptionsForBlock } from "../irItemCreateContext"
import { convertExtractToItem } from "./irConversionService"
import {
  blockHasLiveIRScheduling,
  isConvertExtractTarget
} from "./irHybridExtract"

export type ClozeCommandResult = {
  blockId: DbId
  clozeNumber: number
  /** 挖空前 content 快照；经 commands undo 时还原正文 */
  originalContent?: ContentFragment[]
  pluginName?: string
  addedCardTag?: boolean
  wroteInitialClozeSrs?: boolean
  isFirstClozeCard?: boolean
  initialDue?: Date
  initialDueHint?: string
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
  const hasLiveIR = blockHasLiveIRScheduling(block)
  // extracts 首次挖空；keep_extract 后 cloze/basic/direction + live IR 可继续挖
  const useExtractConvert = isConvertExtractTarget(cardType, hasLiveIR)

  // Topic/Extract 自身或其任意后代（正文子块/孙子块）→ ir_item 分散
  const irOpts = await getIrItemCreateOptionsForBlock(block, blockId)

  if (!block || !useExtractConvert) {
    return deps.createRegularCloze(cursor, pluginName, irOpts)
  }

  // Extract 路径：convert 前快照正文，确保 Cmd+Z 能去掉残留 .cloze fragment
  const originalContent = cloneBlockContent(block.content)

  const result = await deps.convertExtract({
    extractId: blockId,
    cursor,
    pluginName,
    strategy: "keep_extract",
    createClozeOptions: irOpts ?? {
      initialDueOrigin: "ir_item"
    }
  })
  if (!result.ok) {
    throw new Error(`Extract 制卡失败（${result.step}）：${result.error}`)
  }
  return {
    blockId: result.itemId,
    clozeNumber: result.clozeNumber,
    pluginName,
    originalContent,
    wroteInitialClozeSrs: true,
    isFirstClozeCard: false,
    addedCardTag: false,
    initialDue: result.initialDue,
    initialDueHint: result.initialDueHint
  }
}
