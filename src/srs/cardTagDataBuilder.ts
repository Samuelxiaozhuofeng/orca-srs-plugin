import type { DbId } from "../orca.d.ts"
import { createRecentDeckRef } from "./recentDeckManager"

const DECK_PROPERTY_NAME = "牌组"

export async function buildCardTagData(
  pluginName: string,
  blockId: DbId,
  cardType: string
): Promise<Array<{ name: string; value: unknown }>> {
  const deckRefId = await createRecentDeckRef(pluginName, blockId)

  return [
    { name: "type", value: cardType },
    { name: DECK_PROPERTY_NAME, value: deckRefId ? [deckRefId] : [] },
    { name: "status", value: "" }
  ]
}
