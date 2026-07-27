/**
 * 今日学习队列加载（会话创建 / 打开 / 刷新 / 重试为只读装配，不写 block 属性）
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
  DEFAULT_QUEUE_POLICY,
  UNLIMITED_TIME_BUDGET_MINUTES,
  formatLocalDateKey,
  selectQueueWithPolicy,
  topicQuotaPercentToMinRatio
} from "../../../srs/incremental-reading/irQueuePolicy"
import {
  buildMixedSessionQueue,
  type IRSessionEntry
} from "../../../srs/incremental-reading/irMixedQueuePolicy"
import { loadMixedEligibleReviewCards } from "../../../srs/incremental-reading/irMixedDailyBudget"
import { buildCollectError, buildCollectOk } from "../../../srs/incremental-reading/irCollectResult"
import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import { getIncrementalReadingSettings } from "../../../srs/settings/incrementalReadingSettingsSchema"
import {
  effectiveDailyLimitForQueue,
  loadIRDailyStats,
  resolveEffectiveIRDailyLimit,
  resolveOrcaRepo
} from "../../../srs/incremental-reading/irDailyStatsStorage"
import { requireIRDailyStatsForSession } from "../../../srs/todayLearning/todayLearningSummary"
import { assembleSessionReadingQueue } from "./assembleSessionReadingQueue"
import {
  buildUnifiedSessionNotice,
  resolveSessionMixedEnabled,
  type IRSessionLaunchMode
} from "./irSessionLaunchMode"
import type { IRWorkspaceSessionState } from "./irWorkspaceTypes"
import { EMPTY_SESSION_STATE } from "./irWorkspaceTypes"

const { useCallback, useRef, useState } = window.React

export type LoadReadingQueueOptions = {
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

      // 会话创建/打开/刷新/重试：收集必须只读（跳过 ensureIRState / setProperties）
      const sessionCollectOpts = { readOnly: true as const }
      const detailed = typeof collectIRCardsDetailed === "function"
        ? await collectIRCardsDetailed(name, sessionCollectOpts)
        : { cards: await collectIRCards(name, sessionCollectOpts), failedCount: 0 }

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
      // 同一时刻派生 seed 与会话时间，避免相邻 new Date() 跨午夜漂移；seed 用本地日而非 UTC ISO
      const sessionStartedAt = new Date()
      const seed = formatLocalDateKey(sessionStartedAt)

      // 跨会话日额度：用今日累计 completedCount 扣减配置 dailyLimit（0=不限制）
      // 读取失败 fail-closed：不得按 0 已用额度继续装配，更不能假装「今日学习完毕」
      const dailyStats = loadIRDailyStats({
        repo: resolveOrcaRepo(),
        pluginName: name,
        dateKey: seed
      })
      const dailyGate = requireIRDailyStatsForSession(dailyStats)
      if (!dailyGate.ok) {
        console.error(
          "[IR Workspace] 读取今日 IR 日统计失败，停止装配:",
          dailyGate.error
        )
        const statsError = buildCollectError(dailyGate.error)
        setSession((prev: IRWorkspaceSessionState) => ({
          ...prev,
          ready: true,
          loading: false,
          entries: [],
          collectResult: {
            ...statsError,
            errorMessage: `今日学习额度读取失败：${statsError.errorMessage ?? dailyGate.error.message}`
          },
          sessionLaunchMode: launchMode,
          mixedDegradedNotice: null,
          generation: prev.generation + 1
        }))
        orca.notify("error", "今日学习额度读取失败，已停止装配队列", {
          title: "今日学习"
        })
        return
      }
      const effectiveLimit = resolveEffectiveIRDailyLimit(
        settings.dailyLimit,
        dailyGate.usedCompletedCount
      )
      const sessionDailyLimit = effectiveDailyLimitForQueue(effectiveLimit)

      // mixed：复用 SRS 今日额度路径；日志读取失败必须 fail-closed
      let eligibleReviewCards: import("../../../srs/types").ReviewCard[] = []
      if (mixedEnabledForSession) {
        try {
          const mixedBudget = await loadMixedEligibleReviewCards(
            name,
            sessionStartedAt
          )
          eligibleReviewCards = mixedBudget.eligibleReviewCards
        } catch (logError) {
          console.error(
            "[IR Workspace] 读取今日 SRS 复习日志/额度失败，停止混合装配:",
            logError
          )
          const errResult = buildCollectError(logError)
          setSession((prev: IRWorkspaceSessionState) => ({
            ...prev,
            ready: true,
            loading: false,
            entries: [],
            collectResult: {
              ...errResult,
              errorMessage: `今日复习额度读取失败：${errResult.errorMessage ?? String(logError)}`
            },
            sessionLaunchMode: launchMode,
            mixedDegradedNotice: null,
            generation: prev.generation + 1
          }))
          orca.notify("error", "今日复习额度读取失败，已停止装配队列", {
            title: "今日学习"
          })
          return
        }
      }
      // limited + remaining=0：policy 空队列（dailyLimit=0 在 policy 里表示不限制，不能直接传入）
      const policyQueue =
        effectiveLimit.kind === "limited" && effectiveLimit.remaining === 0
          ? { queue: [] as IRCard[], diagnostics: [] }
          : selectQueueWithPolicy(result.cards, {
            ...DEFAULT_QUEUE_POLICY,
            // 无时间盒：阅读队列长度只由 IR dailyLimit 决定
            timeBudgetMinutes: UNLIMITED_TIME_BUDGET_MINUTES,
            dailyLimit: sessionDailyLimit,
            // Source Topic 在纯 IR reading queue 中的最低比例（0..1）；非 mixed SRS 比例
            topicMinRatio: topicQuotaPercentToMinRatio(settings.topicQuotaPercent),
            seed
          })

      // 会话创建/打开/刷新/重试：只装配队列，不隐式写 block 属性（Batch B1）。
      // enableAutoDefer 仅控制资料库「一键溢出推后」按钮，不是自动写入许可。
      // focus 在最终会话队列中解析并冻结；因不再执行 overload mutation，focus 不会在同次加载被推迟。

      let focusCardId = options.focusCardId ?? null
      if (focusCardId == null) {
        focusCardId = await popNextIRSessionFocusCardId(name)
      }

      let focusCard: IRCard | null = null
      if (focusCardId) {
        focusCard = result.cards.find((c: IRCard) => c.id === focusCardId) ?? null
        if (!focusCard) {
          try {
            const block = await orca.invokeBackend("get-block", focusCardId)
            if (block) {
              const cards = await collectAllIRCardsFromBlocks([block], name, sessionCollectOpts)
              if (cards.length > 0) {
                focusCard = cards[0]
              }
            }
          } catch (err) {
            console.error("[IR Workspace] 无法从数据库加载焦点卡片最新状态:", err)
          }
        }
        if (!focusCard) {
          focusCard = libraryCards.find((c: IRCard) => c.id === focusCardId) ?? null
        }
      }

      // 额度用尽时仍允许显式 focus 单卡（资料库点开阅读）；无 focus 则空队列
      const assembleLimit =
        effectiveLimit.kind === "limited" && effectiveLimit.remaining === 0
          ? focusCard
            ? 1
            : 0
          : sessionDailyLimit

      const focusedQueue = assembleSessionReadingQueue({
        policyQueue: policyQueue.queue,
        focusCard,
        dailyLimit: assembleLimit
      })

      const mixed = buildMixedSessionQueue({
        enabled: mixedEnabledForSession,
        readingQueue: focusedQueue,
        reviewCards: eligibleReviewCards,
        now: sessionStartedAt
      })
      const sessionEntries: IRSessionEntry[] = mixed.entries
      const mixedDegradedNotice = buildUnifiedSessionNotice({
        mixedEnabledForSession,
        readingCount: focusedQueue.length,
        reviewCount: mixed.selectedReviewCount
      })

      setSession({
        ready: true,
        loading: false,
        entries: sessionEntries,
        collectResult: result,
        // 会话启动不再自动顺延；字段保留以兼容会话 UI 接线
        autoPostponeLabel: null,
        autoBatchId: null,
        generation: Date.now(),
        sessionLaunchMode: launchMode,
        mixedDegradedNotice
      })

      // 仅在非空队列装配成功后写 IR resume；失败可见但不撤销已可用的队列。
      // 空队列/失败路径不得覆盖先前有效的 SRS marker。
      if (sessionEntries.length > 0) {
        try {
          const {
            writeIrTodayLearningResume,
            reportTodayLearningResumeWriteFailure
          } = await import(
            "../../../srs/todayLearning/todayLearningResumeStorage"
          )
          const writeResult = await writeIrTodayLearningResume({ pluginName: name })
          if (!writeResult.ok) {
            reportTodayLearningResumeWriteFailure(name, writeResult.error)
          }
        } catch (resumeError) {
          console.error(
            "[IR Workspace] 队列装配后写 resume 失败（队列仍可用）:",
            resumeError
          )
          orca.notify(
            "error",
            `学习可继续，但恢复点未保存：${resumeError instanceof Error ? resumeError.message : String(resumeError)}`,
            { title: "今日学习" }
          )
        }
      }
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
        focusCardId: cardId,
        sessionLaunchMode: null
      })
    } catch (error) {
      console.error("[IR Workspace] 开始阅读失败:", error)
      orca.notify("error", "开始阅读失败", { title: "渐进阅读" })
    }
  }, [loadPluginName, loadReadingQueue])

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

  return {
    session,
    queueSnapshot,
    setQueueSnapshot,
    advancingIds,
    loadReadingQueue,
    startReadingWithCard,
    handleAdvanceDueOnly
  }
}
