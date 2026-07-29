/**
 * Hybrid Extract identity after keep_extract:
 * `#card type` may become cloze / basic / direction（SRS 记忆身份），
 * while `ir.*` scheduling remains（IR 阅读身份）。
 */

import type { Block } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"

/** True when the block still carries IR scheduling (not finished / archived). */
export function blockHasLiveIRScheduling(block: Block | null | undefined): boolean {
  if (!block?.properties?.length) return false
  // ir.due is written for every live IR card; pure items drop scheduling props.
  return block.properties.some((p) => p.name === "ir.due")
}

/**
 * Whether convertExtractToItem may dig cloze on this card type + live-IR shape.
 * - extracts: first dig
 * - any hybrid with live IR whose type is not topic: subsequent digs after keep_extract
 *   （cloze / basic / direction 均可再挖空，同块转 cloze）
 */
export function isConvertExtractTarget(
  cardType: string,
  hasLiveIR: boolean
): boolean {
  if (cardType === "extracts") return true
  if (cardType === "topic") return false
  if (hasLiveIR) return true
  return false
}

/**
 * IR queue candidate: Topic / Extract, or any hybrid still carrying ir.due.
 * Returns the IR card type used by collectors/session UI（hybrid → extracts）。
 *
 * keep_extract 后 type 可能是 cloze / basic / direction；只要 ir.due 仍在，
 * 就必须继续出现在 IR 队列，并作为后代制卡的 IR 源。
 */
export function resolveIRCardType(block: Block): "topic" | "extracts" | null {
  const cardType = extractCardType(block)
  if (cardType === "topic") return "topic"
  if (cardType === "extracts") return "extracts"
  if (blockHasLiveIRScheduling(block)) {
    // 非 Topic 的 live IR 一律按 Extract 混合身份参与阅读队列
    return "extracts"
  }
  return null
}
