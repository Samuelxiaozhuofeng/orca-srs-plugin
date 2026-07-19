import type { Block, CursorData, DbId } from "../../orca.d.ts"
import { createCloze } from "../clozeUtils"
import { extractCardType } from "../deckUtils"
import { convertExtractToItem } from "./irConversionService"
import { blockHasLiveIRScheduling } from "./irHybridExtract"

export type ClozeCommandResult = {
  blockId: DbId
  clozeNumber: number
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
    return deps.createRegularCloze(cursor, pluginName)
  }

  const result = await deps.convertExtract({
    extractId: blockId,
    cursor,
    pluginName,
    strategy: "keep_extract"
  })
  if (!result.ok) {
    throw new Error(`Extract 制卡失败（${result.step}）：${result.error}`)
  }
  return { blockId: result.itemId, clozeNumber: result.clozeNumber }
}
