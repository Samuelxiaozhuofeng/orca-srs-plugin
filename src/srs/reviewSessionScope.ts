/**
 * 复习会话范围（Session Scope）
 *
 * 在会话启动时冻结，之后不依赖可变的全局 reviewDeckFilter。
 * 初始队列、定时刷新、手动刷新、pending due 重新入队均使用同一 scope。
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  acceptFormalRoot,
  filterAndAcceptNewFormalRoots,
  type SessionRootCardBudget
} from "./reviewSessionBudget"

/** 今日全部复习：无牌组限制，允许全库动态检查 */
export type AllReviewSessionScope = {
  readonly kind: "all"
}

/** 单牌组复习：固定 deckName，允许动态检查但只接纳该牌组 */
export type DeckReviewSessionScope = {
  readonly kind: "deck"
  readonly deckName: string
}

/**
 * 固定卡片集合（重复复习 / 困难卡 / 专项训练）
 * - cardKeys：精确身份（含 Cloze/Direction 变体）
 * - fixedRootIds：List 根卡 blockId 字符串，允许同一根下后续 listItemId / 辅助预览
 * 禁止全库动态扫描；只允许集合内已有卡片重新入队 / List 同根变体
 */
export type FixedReviewSessionScope = {
  readonly kind: "fixed"
  readonly cardKeys: readonly string[]
  readonly fixedRootIds: readonly string[]
}

export type ReviewSessionScope =
  | AllReviewSessionScope
  | DeckReviewSessionScope
  | FixedReviewSessionScope

const ALL_SCOPE: AllReviewSessionScope = Object.freeze({ kind: "all" as const })

/**
 * 创建「全部牌组」scope（单例冻结对象）
 */
export function createAllScope(): AllReviewSessionScope {
  return ALL_SCOPE
}

/**
 * 创建单牌组 scope。deckName 写入冻结副本，后续外部改名不影响已创建 scope。
 */
export function createDeckScope(deckName: string): DeckReviewSessionScope {
  return Object.freeze({
    kind: "deck" as const,
    deckName: String(deckName)
  })
}

/**
 * 根据启动时读取的 deck filter 创建 scope。
 * null/undefined/空字符串 → all；否则 → deck。
 */
export function createScopeFromDeckFilter(
  deckFilter: string | null | undefined
): ReviewSessionScope {
  if (deckFilter == null || deckFilter === "") {
    return createAllScope()
  }
  return createDeckScope(deckFilter)
}

/**
 * 从卡片集合创建 fixed scope。
 * 应传入会话原始卡片或展开后的允许集合（含子卡），以便 cardKeys 覆盖全部可复习身份。
 * List 卡额外记录 root blockId，供后续 listItem / 辅助预览入队。
 */
export function createFixedScope(
  cards: readonly ReviewCard[]
): FixedReviewSessionScope {
  const keySet = new Set<string>()
  const rootSet = new Set<string>()
  const cardKeys: string[] = []
  const fixedRootIds: string[] = []

  for (const card of cards) {
    const key = cardKeyFromReviewCard(card)
    if (!keySet.has(key)) {
      keySet.add(key)
      cardKeys.push(key)
    }
    if (isListVariantCard(card)) {
      const rootId = stringifyRootId(card.id)
      if (!rootSet.has(rootId)) {
        rootSet.add(rootId)
        fixedRootIds.push(rootId)
      }
    }
  }

  return Object.freeze({
    kind: "fixed" as const,
    cardKeys: Object.freeze(cardKeys),
    fixedRootIds: Object.freeze(fixedRootIds)
  })
}

function isListVariantCard(card: ReviewCard): boolean {
  return card.cardType === "list" || card.listItemId != null
}

function stringifyRootId(id: DbId): string {
  return String(id)
}

/**
 * 是否允许对全库执行 collectReviewCards + buildReviewQueue 动态扫描。
 * fixed 完全禁用；all / deck 允许（deck 在扫描后按牌组过滤）。
 */
export function allowsFullLibraryDynamicScan(scope: ReviewSessionScope): boolean {
  return scope.kind === "all" || scope.kind === "deck"
}

/**
 * 判断单张卡片是否属于会话 scope。
 *
 * - all：始终 true
 * - deck：card.deck === deckName
 * - fixed：cardKey 精确命中，或 List 同根（root id 在 fixedRootIds）
 *   Cloze/Direction 不得因同 blockId 串入未固定变体
 */
export function isCardInSessionScope(
  card: ReviewCard,
  scope: ReviewSessionScope
): boolean {
  switch (scope.kind) {
    case "all":
      return true
    case "deck":
      return card.deck === scope.deckName
    case "fixed": {
      const key = cardKeyFromReviewCard(card)
      if (scope.cardKeys.includes(key)) {
        return true
      }
      // List：同一固定根卡的后续 listItemId / 辅助预览
      if (isListVariantCard(card)) {
        return scope.fixedRootIds.includes(stringifyRootId(card.id))
      }
      return false
    }
    default: {
      const _exhaustive: never = scope
      return _exhaustive
    }
  }
}

/**
 * 按 scope 过滤候选卡片（保持相对顺序）
 */
export function filterCardsBySessionScope(
  cards: readonly ReviewCard[],
  scope: ReviewSessionScope
): ReviewCard[] {
  if (scope.kind === "all") {
    return [...cards]
  }
  return cards.filter((card) => isCardInSessionScope(card, scope))
}

/**
 * 从「已构建的候选队列」中选出应追加到当前会话的正式根卡：
 * 1) 先按 FC-02 冻结 scope 过滤
 * 2) 再排除已在 existingQueue 中的 cardKey
 * 3) 再按会话冻结额度（FC-01）接纳：仅新身份消耗剩余新/旧额度；已接纳身份不重复消耗
 *
 * 自动刷新与手动刷新共用此 helper。budget === null 表示不限额（fixed）。
 * 注意：动态路径应对候选使用不限额的 buildReviewQueue，再由此处扣减剩余额度。
 */
export function selectNewDueCardsForSession(
  candidates: readonly ReviewCard[],
  existingQueue: readonly ReviewCard[],
  scope: ReviewSessionScope,
  budget: SessionRootCardBudget | null = null
): ReviewCard[] {
  const inScope = filterCardsBySessionScope(candidates, scope)
  const existingKeys = new Set(
    existingQueue.map((card) => cardKeyFromReviewCard(card))
  )
  return filterAndAcceptNewFormalRoots(inScope, existingKeys, budget)
}

/**
 * pending due（Again/Hard 短期重学）重新入队前的过滤：
 * 1) 仍在当前 scope 内
 * 2) 已接纳正式根卡身份可重入（不重复消耗额度）
 * 3) 若出现未接纳的新身份，须仍有对应额度（并记入预算）
 *
 * budget === null → 仅 scope 过滤（fixed 不限额）。
 */
export function selectPendingDueCardsForRequeue(
  dueCards: readonly ReviewCard[],
  scope: ReviewSessionScope,
  budget: SessionRootCardBudget | null = null
): ReviewCard[] {
  const inScope = filterCardsBySessionScope(dueCards, scope)
  if (budget == null) {
    return inScope
  }
  const allowed: ReviewCard[] = []
  for (const card of inScope) {
    if (acceptFormalRoot(budget, card)) {
      allowed.push(card)
    }
  }
  return allowed
}

/**
 * Renderer：从启动时 deck filter 创建 scope 并筛选初始卡（纯函数，便于测试）。
 */
export function prepareNormalSessionQueueInput(
  allCards: readonly ReviewCard[],
  deckFilter: string | null | undefined
): { scope: ReviewSessionScope; filteredCards: ReviewCard[] } {
  const scope = createScopeFromDeckFilter(deckFilter)
  return {
    scope,
    filteredCards: filterCardsBySessionScope(allCards, scope)
  }
}

/**
 * Renderer：重复/专项训练从展开后卡片创建 fixed scope。
 */
export function prepareFixedSessionScope(
  expandedCards: readonly ReviewCard[]
): FixedReviewSessionScope {
  return createFixedScope(expandedCards)
}

/** fixed 模式手动检查时的用户可见说明 */
export const FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE =
  "专项训练使用固定卡片集合"
