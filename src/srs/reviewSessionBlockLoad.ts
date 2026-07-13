/**
 * 复习会话当前卡块加载决策（F2-06）
 *
 * 纯逻辑、无 React：把 exists / missing / unknown 映射为
 * ready | drop_missing | retain_unknown。
 *
 * 全检完成后决策（不得在未检查完 required 时提前结论）：
 * - 任一 unknown → retain_unknown（不写 auto-dropped，不剔除）
 * - 无 unknown 且任一 required missing → drop_missing（可写 auto-dropped）
 * - 全部 exists → ready
 * - 预缓存失败不得改队列 / auto-dropped / 当前卡
 * - 切卡后旧请求结果不得应用
 */

import type { Block, DbId } from "../orca.d.ts"
import type { BlockExistenceResult, BlockExistenceStatus } from "./blockExistence"
import { formatBlockExistenceError } from "./blockExistence"

/** 当前卡需要验证的块（父 + 可选 List 条目） */
export type RequiredBlockSpec = {
  blockId: DbId
  /** 角色标签，写入错误上下文 */
  role: "parent" | "listItem"
}

export type RequiredBlocksOutcome =
  | {
      action: "ready"
      cardKey: string
    }
  | {
      action: "drop_missing"
      cardKey: string
      missingBlockIds: DbId[]
      /** 用户可见短句 */
      userMessage: string
      /** 诊断日志 */
      diagnostic: string
    }
  | {
      action: "retain_unknown"
      cardKey: string
      unknownBlockIds: DbId[]
      /** 用户可见、可重试 */
      userMessage: string
      /** 诊断日志（含原始异常摘要） */
      diagnostic: string
      /** 各 unknown 结果，便于测试与日志 */
      unknowns: BlockExistenceResult[]
    }

export type PrefetchBlockOutcome =
  | { action: "already_cached"; blockId: DbId }
  | { action: "write_cache"; blockId: DbId; block: Block }
  | { action: "log_null"; blockId: DbId; diagnostic: string }
  | { action: "log_throw"; blockId: DbId; diagnostic: string; error: unknown }

/**
 * 从 ReviewCard 形状推导需要验证的块 id 列表。
 * List：父块 + listItemId；其它：仅父块。
 */
export function requiredBlocksForCard(card: {
  id: DbId
  listItemId?: DbId | null
}): RequiredBlockSpec[] {
  const specs: RequiredBlockSpec[] = [{ blockId: card.id, role: "parent" }]
  if (card.listItemId != null) {
    specs.push({ blockId: card.listItemId, role: "listItem" })
  }
  return specs
}

/**
 * 汇总多个 required 块的三态结果，形成当前卡决策。
 *
 * 规则：
 * 1. 必须先有完整 results（与 required 一一对应），不得在未检查完时提前结论。
 * 2. 任一 unknown → retain_unknown（不写 auto-dropped）
 * 3. 无 unknown 且任一 missing → drop_missing（可写 auto-dropped）
 * 4. 全部 exists → ready
 */
export function decideRequiredBlocksOutcome(
  cardKey: string,
  results: readonly BlockExistenceResult[]
): RequiredBlocksOutcome {
  if (results.length === 0) {
    // 无 required 块在协议上不应发生；保守为 unknown，避免误删
    return {
      action: "retain_unknown",
      cardKey,
      unknownBlockIds: [],
      userMessage: `无法确认卡片块状态（cardKey=${cardKey}，无 required 块）`,
      diagnostic: `cardKey=${cardKey}: empty required block results`,
      unknowns: []
    }
  }

  const unknowns = results.filter(r => r.status === "unknown")
  if (unknowns.length > 0) {
    const unknownBlockIds = unknowns.map(r => r.blockId)
    const details = unknowns
      .map(r => formatBlockExistenceError(r, { cardKey }))
      .join("; ")
    return {
      action: "retain_unknown",
      cardKey,
      unknownBlockIds,
      userMessage: `暂时无法确认卡片块是否存在（blockId=${unknownBlockIds.join(",")}，cardKey=${cardKey}）。可重试。`,
      diagnostic: details,
      unknowns
    }
  }

  const missings = results.filter(r => r.status === "missing")
  if (missings.length > 0) {
    const missingBlockIds = missings.map(r => r.blockId)
    return {
      action: "drop_missing",
      cardKey,
      missingBlockIds,
      userMessage: "已自动跳过不存在的卡片",
      diagnostic: `cardKey=${cardKey} missing blockIds=${missingBlockIds.join(",")}`
    }
  }

  return { action: "ready", cardKey }
}

/**
 * 旧异步请求是否仍可应用到当前会话卡。
 * cancelled / 卡已切换 → false。
 */
export function shouldApplyBlockLoadResult(args: {
  cancelled: boolean
  expectedCardKey: string
  currentCardKey: string | null | undefined
}): boolean {
  if (args.cancelled) return false
  if (args.currentCardKey == null) return false
  return args.currentCardKey === args.expectedCardKey
}

/**
 * 预缓存下一张：根据单块 resolve 结果决定动作。
 * 明确 null / throw 只记诊断，不改变队列 / auto-dropped / 当前卡。
 */
export function decidePrefetchBlockOutcome(
  result: BlockExistenceResult
): PrefetchBlockOutcome {
  if (result.status === "exists") {
    if (result.block) {
      return {
        action: "write_cache",
        blockId: result.blockId,
        block: result.block
      }
    }
    // exists 无 block 理论上不应发生；记诊断而不崩溃
    return {
      action: "log_null",
      blockId: result.blockId,
      diagnostic: `prefetch exists without block payload blockId=${result.blockId}`
    }
  }
  if (result.status === "missing") {
    return {
      action: "log_null",
      blockId: result.blockId,
      diagnostic: formatBlockExistenceError(result, { role: "prefetch" })
    }
  }
  return {
    action: "log_throw",
    blockId: result.blockId,
    diagnostic: formatBlockExistenceError(result, { role: "prefetch" }),
    error: result.error
  }
}

/**
 * 若 state 已有块，预缓存可跳过后端。
 */
export function decidePrefetchWhenStateHit(
  blockId: DbId,
  stateHit: boolean
): PrefetchBlockOutcome | null {
  if (stateHit) {
    return { action: "already_cached", blockId }
  }
  return null
}

/** 便于测试的状态字面量构造 */
export function existenceResult(
  blockId: DbId,
  status: BlockExistenceStatus,
  extra?: { block?: Block; error?: unknown }
): BlockExistenceResult {
  return {
    blockId,
    status,
    block: extra?.block,
    error: extra?.error
  }
}
