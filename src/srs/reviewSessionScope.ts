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
 * 会话队列中「尚未处理」部分（当前卡及其之后，index >= currentIndex）的身份集合。
 *
 * 与 pendingDueRequeue.getUnprocessedTailCardKeys（[currentIndex+1..end]）语义相近但
 * 略有区别：动态扫描把**当前正在复习的卡**也视为未处理（避免为正在展示的卡追加重复项），
 * 故取 [currentIndex..end]；而 pending 定时器在评分推进后才重入，故其尾部是 [currentIndex+1..end]。
 *
 * index < currentIndex 的**已评分**卡不在此集合中——它们到期后允许通过动态扫描回流。
 */
export function collectUnprocessedQueueCardKeys(
  queue: readonly ReviewCard[],
  currentIndex: number
): Set<string> {
  const keys = new Set<string>()
  const start = Math.max(0, currentIndex)
  for (let i = start; i < queue.length; i++) {
    keys.add(cardKeyFromReviewCard(queue[i]))
  }
  return keys
}

export type SelectNewDueCardsOptions = {
  /**
   * 当前正在复习的卡索引。用于区分「已评分头部」与「未处理部分」：
   * 只有 index >= currentIndex 的队列项被排除，index < currentIndex 的已评分卡到期后可回流。
   * 省略时默认 0（排除整个 existingQueue，等价于旧的"全队列去重"行为）。
   */
  currentIndex?: number
  /**
   * 已在短期重学 pending 跟踪中的身份。这些卡将由 pending 定时器负责重入，
   * 扫描路径必须排除它们，避免与定时器双重入队（额度语义也由 pending 路径统一处理）。
   */
  pendingKeys?: ReadonlySet<string> | null
}

/**
 * 从「已构建的候选队列」中选出应追加到当前会话的正式根卡：
 * 1) 先按 FC-02 冻结 scope 过滤
 * 2) 再排除去重集合：(a) 会话中**尚未处理**的队列部分（[currentIndex..end]）；
 *    (b) 已在 pending 短期重学跟踪中的身份。
 *    **已处理（已评分）的卡不在去重集合中**——到期后允许回流（P0：Review 卡评 Again 后回流）。
 * 3) 再按会话冻结额度（FC-01）接纳：仅新身份消耗剩余新/旧额度；已接纳身份不重复消耗。
 *    回流的已评分卡其 cardKey 早已在 budget.accepted*Keys 中，acceptFormalRoot 返回 true 但
 *    不重复扣额度，故回流不会二次消耗每日额度。
 *
 * 自动刷新与手动刷新共用此 helper。budget === null 表示不限额（fixed）。
 * 注意：动态路径应对候选使用不限额的 buildReviewQueue，再由此处扣减剩余额度。
 */
export function selectNewDueCardsForSession(
  candidates: readonly ReviewCard[],
  existingQueue: readonly ReviewCard[],
  scope: ReviewSessionScope,
  budget: SessionRootCardBudget | null = null,
  options: SelectNewDueCardsOptions = {}
): ReviewCard[] {
  const inScope = filterCardsBySessionScope(candidates, scope)
  const currentIndex = options.currentIndex ?? 0
  const excludedKeys = collectUnprocessedQueueCardKeys(existingQueue, currentIndex)
  if (options.pendingKeys) {
    for (const key of options.pendingKeys) {
      excludedKeys.add(key)
    }
  }
  return filterAndAcceptNewFormalRoots(inScope, excludedKeys, budget)
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
