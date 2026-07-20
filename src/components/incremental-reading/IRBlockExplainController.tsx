/**
 * 挂到 IRReadingPane：在正文根上启用块解释触发与块下内联面板
 */

import type { DbId } from "../../orca.d.ts"
import IRBlockExplainInline from "./IRBlockExplainInline"
import { useIRBlockExplain } from "./useIRBlockExplain"

export type IRBlockExplainControllerProps = {
  enabled: boolean
  pluginName: string
  cardId: DbId
  bodyRef: { current: HTMLDivElement | null }
}

export default function IRBlockExplainController({
  enabled,
  pluginName,
  cardId,
  bodyRef
}: IRBlockExplainControllerProps) {
  useIRBlockExplain({
    enabled,
    pluginName,
    cardId,
    bodyRef,
    Panel: IRBlockExplainInline
  })
  return null
}
