/**
 * mixed 会话复习卡块可用性 preflight（纯逻辑 + 可注入异步解析）
 *
 * 独立 SRS 用 useReviewCardAvailability；mixed 不绑 setQueue/index，
 * 在 IRMixedReviewPane 挂载 SrsCardDemo 前走同一套三态语义。
 */

import type { ReviewCard } from "../../srs/types"
import { cardKeyFromReviewCard } from "../../srs/cardIdentity"
import {
  resolveBlockExistence,
  type BlockExistenceResult
} from "../../srs/blockExistence"
import {
  decideRequiredBlocksOutcome,
  requiredBlocksForCard,
  type RequiredBlocksOutcome
} from "../../srs/reviewSessionBlockLoad"

export type MixedReviewLoadStatus = "loading" | "ready" | "missing" | "unknown"

export type MixedReviewLoadPhase =
  | { status: "loading" }
  | { status: "ready"; cardKey: string }
  | {
      status: "missing"
      cardKey: string
      userMessage: string
      diagnostic: string
    }
  | {
      status: "unknown"
      cardKey: string
      userMessage: string
      diagnostic: string
    }

export type MixedReviewPreflightDeps = {
  resolveBlockExistence: (
    blockId: Parameters<typeof resolveBlockExistence>[0],
    options?: Parameters<typeof resolveBlockExistence>[1]
  ) => Promise<BlockExistenceResult>
}

const defaultDeps: MixedReviewPreflightDeps = {
  resolveBlockExistence
}

/**
 * 将 F2-06 outcome 映射为 mixed 面板 UI 相位。
 */
export function phaseFromRequiredBlocksOutcome(
  outcome: RequiredBlocksOutcome
): MixedReviewLoadPhase {
  if (outcome.action === "ready") {
    return { status: "ready", cardKey: outcome.cardKey }
  }
  if (outcome.action === "drop_missing") {
    return {
      status: "missing",
      cardKey: outcome.cardKey,
      userMessage: outcome.userMessage,
      diagnostic: outcome.diagnostic
    }
  }
  return {
    status: "unknown",
    cardKey: outcome.cardKey,
    userMessage: outcome.userMessage,
    diagnostic: outcome.diagnostic
  }
}

/**
 * 对当前复习卡 required 块做三态解析，exists 时 writeToState。
 * 调用方负责 stale guard（切卡 / cleanup）。
 */
export async function preflightMixedReviewCard(
  card: ReviewCard,
  deps: MixedReviewPreflightDeps = defaultDeps
): Promise<MixedReviewLoadPhase> {
  const cardKey = cardKeyFromReviewCard(card)
  const results: BlockExistenceResult[] = []

  for (const spec of requiredBlocksForCard(card)) {
    const result = await deps.resolveBlockExistence(spec.blockId, {
      writeToState: true
    })
    results.push(result)
  }

  return phaseFromRequiredBlocksOutcome(
    decideRequiredBlocksOutcome(cardKey, results)
  )
}
