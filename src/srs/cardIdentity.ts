/**
 * 卡片稳定身份（Card Identity）
 *
 * 唯一身份生成与比较来源。日志、困难卡匹配、子卡去重、事件广播等
 * 均应通过本模块生成/比较 cardKey，禁止各模块手写不同格式的 key。
 *
 * 存储版本约定（复习日志）：
 * - v1 / 缺字段：归一化为 legacy，仅能按父块（或旧 List 的 listItemId）兼容匹配
 * - v2：写入完整结构化身份，变体精确区分
 */

import type { DbId } from "../orca.d.ts"
import type { CardType, ReviewCard, ReviewLogEntry } from "./types"

/**
 * 结构化卡片身份
 */
export type CardIdentity = {
  /** 父卡块 ID（List 卡仍为列表根块，不是条目子块） */
  blockId: DbId
  cardType: CardType
  clozeNumber?: number
  directionType?: "forward" | "backward"
  listItemId?: DbId
  /** 仅旧日志归一化后为 true；新身份不得设为 true */
  legacy?: boolean
}

/**
 * 从 ReviewCard 推断 cardType（当 cardType 未填时的兜底）
 * 注意：无法区分 Basic 与 Choice，真实收集路径必须显式写入 cardType。
 */
export function inferCardType(card: Pick<
  ReviewCard,
  "cardType" | "clozeNumber" | "directionType" | "listItemId"
>): CardType {
  if (card.cardType) return card.cardType
  if (card.clozeNumber != null) return "cloze"
  if (card.directionType) return "direction"
  if (card.listItemId != null) return "list"
  return "basic"
}

/**
 * 从 ReviewCard 构建结构化身份
 */
export function identityFromReviewCard(card: ReviewCard): CardIdentity {
  const cardType = inferCardType(card)
  const identity: CardIdentity = {
    blockId: card.id,
    cardType
  }

  if (cardType === "cloze") {
    if (card.clozeNumber == null) {
      throw new Error(
        `[cardIdentity] cloze 卡片缺少 clozeNumber（blockId=${card.id}）`
      )
    }
    identity.clozeNumber = card.clozeNumber
  } else if (cardType === "direction") {
    if (!card.directionType) {
      throw new Error(
        `[cardIdentity] direction 卡片缺少 directionType（blockId=${card.id}）`
      )
    }
    identity.directionType = card.directionType
  } else if (cardType === "list") {
    if (card.listItemId == null) {
      throw new Error(
        `[cardIdentity] list 卡片缺少 listItemId（blockId=${card.id}）`
      )
    }
    identity.listItemId = card.listItemId
  }

  return identity
}

/**
 * 生成稳定 cardKey（新日志与精确匹配的唯一字符串形式）
 *
 * 格式：
 * - basic:123 / choice:123 / excerpt:123 / ...
 * - cloze:123:c1
 * - direction:123:forward
 * - list:123:item:456
 * - legacy:123（仅旧日志归一化）
 */
export function buildCardKey(identity: CardIdentity): string {
  if (identity.legacy) {
    return `legacy:${identity.blockId}`
  }

  const { blockId, cardType } = identity

  switch (cardType) {
    case "cloze": {
      if (identity.clozeNumber == null) {
        throw new Error(
          `[cardIdentity] 无法生成 cloze cardKey：缺少 clozeNumber（blockId=${blockId}）`
        )
      }
      return `cloze:${blockId}:c${identity.clozeNumber}`
    }
    case "direction": {
      if (!identity.directionType) {
        throw new Error(
          `[cardIdentity] 无法生成 direction cardKey：缺少 directionType（blockId=${blockId}）`
        )
      }
      return `direction:${blockId}:${identity.directionType}`
    }
    case "list": {
      if (identity.listItemId == null) {
        throw new Error(
          `[cardIdentity] 无法生成 list cardKey：缺少 listItemId（blockId=${blockId}）`
        )
      }
      return `list:${blockId}:item:${identity.listItemId}`
    }
    default:
      return `${cardType}:${blockId}`
  }
}

/**
 * ReviewCard → 稳定 cardKey
 */
export function cardKeyFromReviewCard(card: ReviewCard): string {
  return buildCardKey(identityFromReviewCard(card))
}

// ---------------------------------------------------------------------------
// 稳定排序（FC-11）
// 仅用于队列 tie-break；不得改动 buildCardKey 字符串格式或日志兼容语义。
// ---------------------------------------------------------------------------

/** cardType 的固定序（与 key 字符串字典序无关） */
const CARD_TYPE_ORDER: Record<CardType, number> = {
  basic: 0,
  cloze: 1,
  direction: 2,
  list: 3,
  choice: 4,
  excerpt: 5,
  extracts: 6,
  topic: 7
}

/** Direction：forward 先于 backward（与 getDirectionList 习惯一致） */
const DIRECTION_ORDER: Record<"forward" | "backward", number> = {
  forward: 0,
  backward: 1
}

/**
 * 结构化排序元组（用于稳定比较，非序列化 key）。
 *
 * 分量顺序：
 * 1. blockId（数值升序）
 * 2. cardType 固定秩
 * 3. 变体主序：clozeNumber 数值 / direction 秩 / listItemId 数值 / 0
 * 4. 预留（当前恒 0）
 *
 * 保证 cloze c2 < c10、list item 2 < 10，避免 cardKey 字符串字典序。
 */
export type CardOrderTuple = readonly [number, number, number, number]

export function orderTupleFromIdentity(identity: CardIdentity): CardOrderTuple {
  const typeRank = CARD_TYPE_ORDER[identity.cardType] ?? 99
  let variant = 0

  if (identity.cardType === "cloze") {
    variant = identity.clozeNumber ?? 0
  } else if (identity.cardType === "direction") {
    variant = identity.directionType
      ? DIRECTION_ORDER[identity.directionType]
      : 0
  } else if (identity.cardType === "list") {
    variant = Number(identity.listItemId ?? 0)
  }

  return [Number(identity.blockId), typeRank, variant, 0]
}

/**
 * 结构化身份比较（FC-11 队列 tie-breaker）。
 * 不用 cardKey 字符串比较，避免 c10 排在 c2 前。
 */
export function compareCardIdentity(a: CardIdentity, b: CardIdentity): number {
  const ta = orderTupleFromIdentity(a)
  const tb = orderTupleFromIdentity(b)
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) {
      return ta[i] - tb[i]
    }
  }
  // legacy 仅旧日志；新身份均为 false。放最后保证全序。
  const la = a.legacy === true ? 1 : 0
  const lb = b.legacy === true ? 1 : 0
  return la - lb
}

/**
 * ReviewCard → 结构化身份比较（FC-11）
 */
export function compareReviewCardIdentity(a: ReviewCard, b: ReviewCard): number {
  return compareCardIdentity(identityFromReviewCard(a), identityFromReviewCard(b))
}

/**
 * cardId 兼容语义（旧统计/清理仍可能依赖）：
 * - List：listItemId
 * - 其余：父 blockId
 *
 * 新逻辑不得再用 cardId 猜变体。
 */
export function compatibleCardId(identity: CardIdentity): DbId {
  if (identity.cardType === "list" && identity.listItemId != null) {
    return identity.listItemId
  }
  return identity.blockId
}

/**
 * 从日志条目读取父块 ID（新日志用 blockId，旧日志回退 cardId）
 */
export function parentBlockIdFromLog(log: Pick<ReviewLogEntry, "blockId" | "cardId">): DbId {
  return log.blockId ?? log.cardId
}

/**
 * 判断日志是否为“结构化新身份”（可用于精确匹配）
 */
export function isStructuredReviewLog(
  log: Pick<ReviewLogEntry, "legacy" | "cardKey" | "blockId" | "cardType">
): boolean {
  return (
    log.legacy !== true &&
    typeof log.cardKey === "string" &&
    log.cardKey.length > 0 &&
    !log.cardKey.startsWith("legacy:") &&
    log.blockId != null &&
    log.cardType != null
  )
}

/**
 * 归一化日志身份字段：
 * - 已有完整结构化字段 → 保留，legacy=false
 * - version 1 / 缺字段 → 标记 legacy，补全可读字段，不抛错
 *
 * 不做“猜变体”；旧日志无法区分同父块 Cloze/Direction 变体。
 */
export function normalizeReviewLogIdentity<T extends ReviewLogEntry>(log: T): T {
  if (isStructuredReviewLog(log)) {
    return {
      ...log,
      legacy: false,
      blockId: log.blockId ?? log.cardId,
      cardKey: log.cardKey
    }
  }

  const blockId = log.blockId ?? log.cardId
  return {
    ...log,
    blockId,
    cardKey: log.cardKey ?? `legacy:${log.cardId}`,
    legacy: true
  }
}

/**
 * 日志是否归属某张卡
 *
 * - 新日志：cardKey 精确相等
 * - legacy：父 blockId 相同即可；List 旧日志 cardId 曾为 listItemId，额外允许 cardId === listItemId
 */
export function reviewLogMatchesIdentity(
  log: ReviewLogEntry,
  identity: CardIdentity
): boolean {
  const normalized = normalizeReviewLogIdentity(log)

  if (isStructuredReviewLog(normalized)) {
    return normalized.cardKey === buildCardKey(identity)
  }

  // legacy 兼容
  if (normalized.cardId === identity.blockId) {
    return true
  }
  if (identity.listItemId != null && normalized.cardId === identity.listItemId) {
    return true
  }
  // 若旧日志已补了 blockId 且等于父块
  if (normalized.blockId === identity.blockId) {
    return true
  }
  return false
}

/**
 * 将身份字段展开为写入日志所需的结构化字段
 */
export function identityFieldsForLog(identity: CardIdentity): Pick<
  ReviewLogEntry,
  "blockId" | "cardType" | "cardKey" | "clozeNumber" | "directionType" | "listItemId" | "legacy"
> {
  const cardKey = buildCardKey(identity)
  return {
    blockId: identity.blockId,
    cardType: identity.cardType,
    cardKey,
    clozeNumber: identity.clozeNumber,
    directionType: identity.directionType,
    listItemId: identity.listItemId,
    legacy: false
  }
}
