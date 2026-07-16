/** 对正式根卡执行有界、可诊断的子卡递归展开。 */

import type { ReviewCard } from "./types"
import {
  resolveChildExpandLimits,
  type ChildExpandDiagnostic,
  type ChildExpandLimits,
  type ResolveChildExpandLimitsOptions
} from "./childExpansionLimits"

export type ExpandChildCardsResult = {
  readonly queue: ReviewCard[]
  readonly diagnostics: readonly ChildExpandDiagnostic[]
  readonly auxChildCount: number
  readonly resolvedLimits: ChildExpandLimits
}

export async function expandChildCardsForRoots(
  formalRootCards: readonly ReviewCard[],
  pluginName: string = "srs-plugin",
  childExpandLimits?: Partial<ChildExpandLimits> | ChildExpandLimits | null,
  options: ResolveChildExpandLimitsOptions = {}
): Promise<ExpandChildCardsResult> {
  const resolved = resolveChildExpandLimits(childExpandLimits, options)
  const limits: ChildExpandLimits = Object.freeze({
    maxDepth: resolved.maxDepth,
    maxAuxChildCards: resolved.maxAuxChildCards
  })

  // 保留惰性导入：childCardCollector 依赖块转换链，避免初始化阶段扩大模块环。
  const { collectChildCards, getCardKey } = await import("./childCardCollector")
  const expandedQueue: ReviewCard[] = []
  const appearedInQueue = new Set<string>()
  const diagnostics: ChildExpandDiagnostic[] = []
  const seenDiagnosticKeys = new Set<string>()
  let auxChildCount = 0

  const pushDiagnostic = (diagnostic: ChildExpandDiagnostic): void => {
    const key =
      `${diagnostic.rootKey}|${diagnostic.reason}|` +
      `${diagnostic.depth ?? ""}|${diagnostic.count ?? ""}`
    if (seenDiagnosticKeys.has(key)) return
    seenDiagnosticKeys.add(key)
    diagnostics.push(diagnostic)
    console.warn(`[${pluginName}] ${diagnostic.message}`)
  }

  async function expandCardChain(
    card: ReviewCard,
    depth: number,
    visitedInChain: Set<string>,
    rootKey: string
  ): Promise<void> {
    const cardKey = getCardKey(card)

    if (visitedInChain.has(cardKey)) {
      pushDiagnostic({
        truncated: true,
        reason: "cycle",
        rootKey,
        depth,
        message:
          `[SRS] 子卡展开遇循环：root=${rootKey} depth=${depth} card=${cardKey}，` +
          "已安全终止该链路"
      })
      return
    }
    visitedInChain.add(cardKey)

    if (depth === 0) {
      expandedQueue.push(card)
      appearedInQueue.add(cardKey)
    } else {
      if (depth > limits.maxDepth) {
        pushDiagnostic({
          truncated: true,
          reason: "max_depth",
          rootKey,
          depth,
          message:
            `[SRS] 子卡展开达最大深度：root=${rootKey} depth=${depth} > ` +
            `maxDepth=${limits.maxDepth}，已截断`
        })
        return
      }
      if (auxChildCount >= limits.maxAuxChildCards) {
        pushDiagnostic({
          truncated: true,
          reason: "max_count",
          rootKey,
          count: auxChildCount,
          message:
            `[SRS] 子卡展开达会话辅助数量上限：root=${rootKey} ` +
            `count=${auxChildCount} >= maxAuxChildCards=${limits.maxAuxChildCards}，已截断`
        })
        return
      }
      expandedQueue.push(card)
      appearedInQueue.add(cardKey)
      auxChildCount++
    }

    if (depth >= limits.maxDepth) {
      if (depth > 0 || limits.maxDepth === 0) {
        const maybeChildren = await collectChildCards(card.id, pluginName)
        if (maybeChildren.length > 0) {
          pushDiagnostic({
            truncated: true,
            reason: "max_depth",
            rootKey,
            depth: depth + 1,
            message:
              `[SRS] 子卡展开达最大深度：root=${rootKey} 停止于 depth=${depth} ` +
              `（maxDepth=${limits.maxDepth}），未展开 ${maybeChildren.length} 张直接子卡`
          })
        }
      }
      return
    }

    if (auxChildCount >= limits.maxAuxChildCards) {
      const maybeChildren = await collectChildCards(card.id, pluginName)
      if (maybeChildren.length > 0) {
        pushDiagnostic({
          truncated: true,
          reason: "max_count",
          rootKey,
          count: auxChildCount,
          message:
            `[SRS] 子卡展开达会话辅助数量上限：root=${rootKey} ` +
            `count=${auxChildCount}，未展开后续子卡`
        })
      }
      return
    }

    const childCards = await collectChildCards(card.id, pluginName)
    for (const childCard of childCards) {
      if (auxChildCount >= limits.maxAuxChildCards) {
        pushDiagnostic({
          truncated: true,
          reason: "max_count",
          rootKey,
          count: auxChildCount,
          message:
            `[SRS] 子卡展开达会话辅助数量上限：root=${rootKey} ` +
            `count=${auxChildCount}，截断剩余兄弟并保留后续正式根卡`
        })
        break
      }
      await expandCardChain(childCard, depth + 1, visitedInChain, rootKey)
    }
  }

  for (const card of formalRootCards) {
    const cardKey = getCardKey(card)
    if (appearedInQueue.has(cardKey)) {
      console.log(`[${pluginName}] 跳过根卡片 #${card.id}，已作为子卡片出现`)
      continue
    }
    await expandCardChain(card, 0, new Set<string>(), cardKey)
  }

  console.log(
    `[${pluginName}] expandChildCardsForRoots: 正式根卡 ${formalRootCards.length} 张，` +
      `辅助子卡 ${auxChildCount} 张，展开后 ${expandedQueue.length} 张` +
      `（maxDepth=${limits.maxDepth}, maxAux=${limits.maxAuxChildCards}` +
      `${diagnostics.length > 0 ? `, 截断 ${diagnostics.length} 处` : ""}）`
  )

  return {
    queue: expandedQueue,
    diagnostics,
    auxChildCount,
    resolvedLimits: limits
  }
}
