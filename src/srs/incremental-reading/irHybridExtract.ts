/**
 * Hybrid Extract identity after keep_extract dig:
 * `#card type` becomes `cloze` (for SRS), while `ir.*` scheduling remains (for IR).
 */

import type { Block } from "../../orca.d.ts"
import { extractCardType } from "../deckUtils"

/** True when the block still carries IR scheduling (not finished / archived). */
export function blockHasLiveIRScheduling(block: Block | null | undefined): boolean {
  if (!block?.properties?.length) return false
  // ir.due is written for every live IR card; pure cloze items drop scheduling props.
  return block.properties.some((p) => p.name === "ir.due")
}

/**
 * Whether convertExtractToItem may dig on this card type + live-IR shape.
 * - extracts: first dig
 * - cloze + live IR: subsequent digs after keep_extract flipped type
 */
export function isConvertExtractTarget(
  cardType: string,
  hasLiveIR: boolean
): boolean {
  if (cardType === "extracts") return true
  if (cardType === "cloze" && hasLiveIR) return true
  return false
}

/**
 * IR queue candidate: Topic / Extract, or hybrid cloze still in IR.
 * Returns the IR card type used by collectors/session UI (hybrid → extracts).
 */
export function resolveIRCardType(block: Block): "topic" | "extracts" | null {
  const cardType = extractCardType(block)
  if (cardType === "topic") return "topic"
  if (cardType === "extracts") return "extracts"
  if (cardType === "cloze" && blockHasLiveIRScheduling(block)) return "extracts"
  return null
}
