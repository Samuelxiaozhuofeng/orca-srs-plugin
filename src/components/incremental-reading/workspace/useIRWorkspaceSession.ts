/**
 * 专注阅读队列加载与自动顺延
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
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
  selectQueueWithPolicy
} from "../../../srs/incremental-reading/irQueuePolicy"
import { buildCollectError, buildCollectOk } from "../../../srs/incremental-reading/irCollectResult"
import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import { getIncrementalReadingSettings } from "../../../srs/settings/incrementalReadingSettingsSchema"
import type { IRWorkspaceSessionState } from "./irWorkspaceTypes"
import { EMPTY_SESSION_STATE } from "./irWorkspaceTypes"

const { useCallback, useRef, useState } = window.React

export function useIRWorkspaceSession(
  loadPluginName: () => Promise<string>,
  libraryCards: IRCard[]
) {
  const [session, setSession] = useState<IRWorkspaceSessionState>(EMPTY_SESSION_STATE)
  const [queueSnapshot, setQueueSnapshot] = useState<{ queue: IRCard[]; currentIndex: number }>({
    queue: [],
    currentIndex: 0
  })
  const [advancingIds, setAdvancingIds] = useState<Record<string, boolean>>({})
  const advancingRef = useRef<Set<DbId>>(new Set())
  const autoBatchIdRef = useRef<string | null>(null)

  const loadReadingQueue = useCallback(async (options: {
    timeBudgetMinutes: number
    focusCardId?: DbId | null
  }) => {
    setSession((prev: IRWorkspaceSessionState) => ({
      ...prev,
      loading: true,
      collectResult: null
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
          cards: [],
          collectResult: result,
          generation: prev.generation + 1
        }))
        return
      }

      const settings = getIncrementalReadingSettings(name)
      const seed = new Date().toISOString().slice(0, 10)
      const policyQueue = selectQueueWithPolicy(result.cards, {
        ...DEFAULT_QUEUE_POLICY,
        timeBudgetMinutes: options.timeBudgetMinutes,
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
        const focusCard =
          result.cards.find((c: IRCard) => c.id === focusCardId) ??
          libraryCards.find((c: IRCard) => c.id === focusCardId)
        if (focusCard) {
          const without = focusedQueue.filter((c: IRCard) => c.id !== focusCardId)
          focusedQueue = [focusCard, ...without]
          if (settings.dailyLimit > 0 && focusedQueue.length > settings.dailyLimit) {
            focusedQueue = focusedQueue.slice(0, settings.dailyLimit)
          }
        }
      }

      setSession({
        ready: true,
        loading: false,
        cards: focusedQueue,
        timeBudgetMinutes: options.timeBudgetMinutes,
        collectResult: result,
        autoPostponeLabel: autoLabel,
        autoBatchId: autoBatchIdRef.current,
        generation: Date.now()
      })
    } catch (error) {
      console.error("[IR Workspace] 加载阅读队列失败:", error)
      const errResult = buildCollectError(error)
      setSession((prev: IRWorkspaceSessionState) => ({
        ...prev,
        ready: true,
        loading: false,
        cards: [],
        collectResult: errResult,
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
      await loadReadingQueue({
        timeBudgetMinutes: session.timeBudgetMinutes || 20,
        focusCardId: cardId
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
