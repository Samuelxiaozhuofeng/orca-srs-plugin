/**
 * 专注阅读队列加载与自动顺延
 */

import type { DbId } from "../../../orca.d.ts"
import {
  collectAllIRCardsFromBlocks,
  type IRCard
} from "../../../srs/incrementalReadingCollector"
import {
  popNextIRSessionFocusCardId,
  setNextIRSessionFocusCardId
} from "../../../srs/incrementalReadingSessionManager"
import { advanceDueToToday } from "../../../srs/incrementalReadingStorage"
import {
  applyAutoPostpone,
  formatAutoPostponeSummary,
  undoAutoPostponeBatch
} from "../../../srs/incremental-reading/irOverloadService"
import {
  DEFAULT_QUEUE_POLICY,
  budgetSeconds,
  selectQueueWithPolicy
} from "../../../srs/incremental-reading/irQueuePolicy"
import {
  buildMixedSessionQueue,
  filterEligibleReviewCards,
  type IRSessionEntry
} from "../../../srs/incremental-reading/irMixedQueuePolicy"
import { estimateCardCostSecondsCalibrated } from "../../../srs/incremental-reading/irCostCalibration"
import { buildCollectError, buildCollectOk } from "../../../srs/incremental-reading/irCollectResult"
import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import { getIncrementalReadingSettings } from "../../../srs/settings/incrementalReadingSettingsSchema"
import {
  buildMixedDegradedNotice,
  resolveSessionMixedEnabled,
  type IRSessionLaunchMode
} from "./irSessionLaunchMode"
import type { IRWorkspaceSessionState } from "./irWorkspaceTypes"
import { EMPTY_SESSION_STATE } from "./irWorkspaceTypes"

const { useCallback, useRef, useState } = window.React

export type LoadReadingQueueOptions = {
  timeBudgetMinutes: number
  focusCardId?: DbId | null
  /**
   * 传入时覆盖/设定本次启动模式；省略时复用上一次会话模式（刷新/重试）。
   * 传 null 表示不指定本次模式，混合开关回退全局设置。
   */
  sessionLaunchMode?: IRSessionLaunchMode | null
}

export function useIRWorkspaceSession(
  loadPluginName: () => Promise<string>,
  libraryCards: IRCard[]
) {
  const [session, setSession] = useState<IRWorkspaceSessionState>(EMPTY_SESSION_STATE)
  const [queueSnapshot, setQueueSnapshot] = useState<{ queue: IRSessionEntry[]; currentIndex: number }>({
    queue: [],
    currentIndex: 0
  })
  const [advancingIds, setAdvancingIds] = useState<Record<string, boolean>>({})
  const advancingRef = useRef<Set<DbId>>(new Set())
  const autoBatchIdRef = useRef<string | null>(null)
  /** 上次显式/继承的本次模式，供刷新/重试在未传 sessionLaunchMode 时复用 */
  const sessionLaunchModeRef = useRef<IRSessionLaunchMode | null>(null)

  const loadReadingQueue = useCallback(async (options: LoadReadingQueueOptions) => {
    const launchMode: IRSessionLaunchMode | null =
      "sessionLaunchMode" in options
        ? (options.sessionLaunchMode ?? null)
        : sessionLaunchModeRef.current
    sessionLaunchModeRef.current = launchMode

    setSession((prev: IRWorkspaceSessionState) => ({
      ...prev,
      loading: true,
      collectResult: null,
      sessionLaunchMode: launchMode,
      mixedDegradedNotice: null
    }))
    try {
      const name = await loadPluginName()
      const {
        collectIRCards,
        collectIRCardsDetailed
      } = await import("../../../srs/incrementalReadingCollector")

      const detailed = typeof collectIRCardsDetailed === "function"
        ? await collectIRCardsDetailed(name)
        : { cards: await collectIRCards(name), failedCount: 0 }

      const result: IRCollectResult = buildCollectOk(detailed.cards, detailed.failedCount)
      if (result.status === "error") {
        setSession((prev: IRWorkspaceSessionState) => ({
          ...prev,
          ready: true,
          loading: false,
          entries: [],
          collectResult: result,
          sessionLaunchMode: launchMode,
          mixedDegradedNotice: null,
          generation: prev.generation + 1
        }))
        return
      }

      const settings = getIncrementalReadingSettings(name)
      const mixedEnabledForSession = resolveSessionMixedEnabled(
        launchMode,
        settings.mixedLearningEnabled
      )
      const seed = new Date().toISOString().slice(0, 10)
      const sessionStartedAt = new Date()
      let reviewCards: import("../../../srs/types").ReviewCard[] = []
      if (mixedEnabledForSession) {
        const { collectReviewCards } = await import("../../../srs/cardCollector")
        reviewCards = await collectReviewCards(name)
      }
      const eligibleReviewCards = filterEligibleReviewCards(reviewCards, sessionStartedAt)
      const readingBudgetMinutes = eligibleReviewCards.length > 0
        ? options.timeBudgetMinutes * (1 - settings.mixedLearningReviewRatio / 100)
        : options.timeBudgetMinutes
      const policyQueue = selectQueueWithPolicy(result.cards, {
        ...DEFAULT_QUEUE_POLICY,
        timeBudgetMinutes: readingBudgetMinutes,
        dailyLimit: settings.dailyLimit,
        seed
      })

      const auto = await applyAutoPostpone(result.cards, {
        protectedIds: policyQueue.protectedIds,
        createBatchId: () => `session-${Date.now()}`
      })
      let autoLabel: string | null = null
      if (auto.batch && auto.deferredCount > 0) {
        autoBatchIdRef.current = auto.batch.batchId
        autoLabel = formatAutoPostponeSummary(auto.deferredCount)
      } else {
        autoBatchIdRef.current = null
      }

      let focusCardId = options.focusCardId ?? null
      if (focusCardId == null) {
        focusCardId = await popNextIRSessionFocusCardId(name)
      }

      let focusedQueue = policyQueue.queue
      if (focusCardId) {
        let focusCard = result.cards.find((c: IRCard) => c.id === focusCardId)
        if (!focusCard) {
          try {
            const block = await orca.invokeBackend("get-block", focusCardId)
            if (block) {
              const cards = await collectAllIRCardsFromBlocks([block], name)
              if (cards.length > 0) {
                focusCard = cards[0]
              }
            }
          } catch (err) {
            console.error("[IR Workspace] 无法从数据库加载焦点卡片最新状态:", err)
          }
        }
        if (!focusCard) {
          focusCard = libraryCards.find((c: IRCard) => c.id === focusCardId)
        }
        if (focusCard) {
          const without = focusedQueue.filter((c: IRCard) => c.id !== focusCardId)
          focusedQueue = [focusCard, ...without]
          if (settings.dailyLimit > 0 && focusedQueue.length > settings.dailyLimit) {
            focusedQueue = focusedQueue.slice(0, settings.dailyLimit)
          }
        }
      }

      const readingCostSeconds = focusedQueue.reduce(
        (sum, card) => sum + estimateCardCostSecondsCalibrated(card),
        0
      )
      const mixed = buildMixedSessionQueue({
        enabled: mixedEnabledForSession,
        readingQueue: focusedQueue,
        reviewCards: eligibleReviewCards,
        reviewRatioPercent: settings.mixedLearningReviewRatio,
        budgetSeconds: budgetSeconds(options.timeBudgetMinutes),
        readingCostSeconds,
        seed,
        now: sessionStartedAt
      })
      const sessionEntries: IRSessionEntry[] = mixed.entries
      const mixedDegradedNotice = buildMixedDegradedNotice({
        mixedEnabledForSession,
        selectedReviewCount: mixed.selectedReviewCount
      })

      setSession({
        ready: true,
        loading: false,
        entries: sessionEntries,
        timeBudgetMinutes: options.timeBudgetMinutes,
        collectResult: result,
        autoPostponeLabel: autoLabel,
        autoBatchId: autoBatchIdRef.current,
        generation: Date.now(),
        sessionLaunchMode: launchMode,
        mixedDegradedNotice
      })
    } catch (error) {
      console.error("[IR Workspace] 加载阅读队列失败:", error)
      const errResult = buildCollectError(error)
      setSession((prev: IRWorkspaceSessionState) => ({
        ...prev,
        ready: true,
        loading: false,
        entries: [],
        collectResult: errResult,
        sessionLaunchMode: launchMode,
        mixedDegradedNotice: null,
        generation: prev.generation + 1
      }))
      orca.notify("error", "加载渐进阅读队列失败", { title: "渐进阅读" })
    }
  }, [loadPluginName, libraryCards])

  const startReadingWithCard = useCallback(async (
    cardId: DbId,
    advanceFirst: boolean,
    onAfterAdvance?: () => void
  ) => {
    try {
      const name = await loadPluginName()
      if (advanceFirst) {
        await advanceDueToToday(cardId, { now: new Date() })
        onAfterAdvance?.()
      }
      await setNextIRSessionFocusCardId(name, cardId)
      // 资料库选卡：不带本次模式，混合行为回退全局设置
      await loadReadingQueue({
        timeBudgetMinutes: session.timeBudgetMinutes || 20,
        focusCardId: cardId,
        sessionLaunchMode: null
      })
    } catch (error) {
      console.error("[IR Workspace] 开始阅读失败:", error)
      orca.notify("error", "开始阅读失败", { title: "渐进阅读" })
    }
  }, [loadPluginName, loadReadingQueue, session.timeBudgetMinutes])

  const handleAdvanceDueOnly = useCallback(async (cardId: DbId, onDone?: () => void) => {
    if (advancingRef.current.has(cardId)) return
    advancingRef.current.add(cardId)
    setAdvancingIds((prev: Record<string, boolean>) => ({ ...prev, [String(cardId)]: true }))
    try {
      await advanceDueToToday(cardId, { now: new Date() })
      onDone?.()
      orca.notify("success", "已提前到期到今天", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Workspace] 提前到期失败:", error)
      orca.notify("error", "提前到期失败", { title: "渐进阅读" })
    } finally {
      advancingRef.current.delete(cardId)
      setAdvancingIds((prev: Record<string, boolean>) => {
        const next = { ...prev }
        delete next[String(cardId)]
        return next
      })
    }
  }, [])

  const handleUndoAutoPostpone = useCallback(async () => {
    const batchId = autoBatchIdRef.current ?? session.autoBatchId
    if (!batchId) return
    try {
      const result = await undoAutoPostponeBatch(batchId)
      if (result.restored > 0) {
        orca.notify("success", `已撤销自动顺延 ${result.restored} 条`, { title: "渐进阅读" })
        autoBatchIdRef.current = null
        setSession((prev: IRWorkspaceSessionState) => ({
          ...prev,
          autoPostponeLabel: null,
          autoBatchId: null
        }))
      } else {
        orca.notify("info", "没有可撤销的自动顺延（可能已被手动修改）", { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Workspace] 撤销自动推后失败:", error)
      orca.notify("error", "撤销自动推后失败", { title: "渐进阅读" })
    }
  }, [session.autoBatchId])

  return {
    session,
    queueSnapshot,
    setQueueSnapshot,
    advancingIds,
    loadReadingQueue,
    startReadingWithCard,
    handleAdvanceDueOnly,
    handleUndoAutoPostpone
  }
}
