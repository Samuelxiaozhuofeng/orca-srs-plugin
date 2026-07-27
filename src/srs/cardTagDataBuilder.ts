import type { DbId } from "../orca.d.ts"
import { createRecentDeckRef } from "./recentDeckManager"
import type { CardStatus } from "./cardStatusUtils"

const DECK_PROPERTY_NAME = "牌组"

export async function buildCardTagData(
  pluginName: string,
  blockId: DbId,
  cardType: string,
  /**
   * 初始状态。默认空串 = 正常排期。
   * 传 "pending" 让卡片建好但先不进复习队列（AI 批量制卡用）。
   */
  status: CardStatus | "" = ""
): Promise<Array<{ name: string; value: unknown }>> {
  const deckRefId = await createRecentDeckRef(pluginName, blockId)

  return [
    { name: "type", value: cardType },
    { name: DECK_PROPERTY_NAME, value: deckRefId ? [deckRefId] : [] },
    { name: "status", value: status === "normal" ? "" : status }
  ]
}
