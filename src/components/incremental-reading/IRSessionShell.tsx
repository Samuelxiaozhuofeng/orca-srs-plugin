/**
 * 渐进阅读会话外壳：生命周期、快捷键、断点与主动作
 * 布局：单滚动正文 + 底部固定动作栏；可嵌入统一工作区
 */

import type { DbId } from "../../orca.d.ts"
import type { IRCard } from "../../srs/incrementalReadingCollector"
import { IRSessionMetrics } from "../../srs/incremental-reading/irMetrics"
import type { IRSessionMetricsSnapshot } from "../../srs/incremental-reading/irMetrics"
import {
  commitIRSessionToDailyStats,
  createIRSessionId,
  dailyTotalsToMetricsSnapshot,
  emptyIRDailyStatsTotals,
  loadIRDailyStats,
  resolveOrcaRepo,
  snapshotToDailyTotals,
  type IRDailyStatsTotals
} from "../../srs/incremental-reading/irDailyStatsStorage"
import {
  computeIRDailyStatsDelta,
  deltaTotalsToCommitSnapshot,
  shouldCommitIRDailyStatsSegment
} from "../../srs/incremental-reading/irDailyStatsSegment"
import {
  addSessionPlannedItem,
  createSessionProgress,
  markSessionItemCompleted,
  syncSessionRemaining,
  unmarkSessionItemCompleted
} from "../../srs/incremental-reading/irSessionProgress"
import { undoPerformNext } from "../../srs/incremental-reading/irSessionService"
import {
  applyIRStateToCard,
  canUndoNext,
  IR_NEXT_NOTIFY_TITLE,
  IR_UNDO_STALE_FROM_NOTIFY_MESSAGE,
  reinsertUndoEntry,
  type IRNextUndoRecord
} from "../../srs/incremental-reading/irNextUndo"
import { shouldGateNext } from "../../srs/incremental-reading/irEndOfContentGate"
import { loadSequentialSessionMeta } from "../../srs/incremental-reading/irSequentialSessionMeta"
import { resolveSessionItemizeIntercept } from "../../srs/incremental-reading/irSessionActionsLogic"
import type { IRSessionProgress } from "../../srs/incremental-reading/irTypes"
import {
  readingCardsToEntries,
  type IRSessionEntry
} from "../../srs/incremental-reading/irMixedQueuePolicy"
import type { ReviewCard } from "../../srs/types"
import { getIncrementalReadingSettings } from "../../srs/settings/incrementalReadingSettingsSchema"
import { useIRReadingBreakpoint } from "../../hooks/useIRReadingBreakpoint"
import { useIRReadingEndZone } from "../../hooks/useIRReadingEndZone"
import { useIRShortcuts } from "../../hooks/useIRShortcuts"
import { useIRSessionTimer } from "../../hooks/useIRSessionTimer"
import { useIRMixedPendingDueQueue } from "../../hooks/useIRMixedPendingDueQueue"
import { resetViewportScrollTop } from "../../hooks/viewportScrollReset"
import { resolveIRSessionViewportResetKey } from "./irSessionViewportReset"
import { resolveIRSessionInteractionGuards } from "./irPostCompleteHoldGuards"
import IRMixedReviewPane from "./IRMixedReviewPane"
import IRReadingPane from "./IRReadingPane"
import IRSessionHeader from "./IRSessionHeader"
import IRSessionSummary from "./IRSessionSummary"
import IRSessionChrome from "./IRSessionChrome"
import IREndOfContentDialog from "./IREndOfContentDialog"
import { createIRSessionCardActions } from "./useIRSessionCardActions"
import { useIRReadingContext } from "./useIRReadingContext"
import { formatIRReadingSourceLabel } from "./irReadingLabels"
import { readIRReaderTheme, writeIRReaderTheme } from "./irReaderThemeStorage"
import {
  clampIRReaderWidth,
  readIRReaderWidth,
  writeIRReaderWidth
} from "./irReaderWidthStorage"
import {
  shouldDismissIRImportancePanel,
  shouldDismissIRMorePanel
} from "./irMorePanelDismiss"
import {
  CHAPTER_QUIZ_ADVANCE_EVENT,
  CHAPTER_QUIZ_COPY,
  CHAPTER_QUIZ_LOCATE_EVENT,
  launchChapterQuiz,
  type ChapterQuizAdvanceDetail,
  type ChapterQuizLocateDetail
} from "../../srs/incremental-reading/chapterQuiz"
import { isAIConfigured } from "../../srs/ai/aiSettingsSchema"
import {
  clearLocateHighlight,
  scheduleLocateBlock
} from "./irReadingContextLocate"

const { useCallback, useEffect, useMemo, useRef, useState } = window.React
const { Button } = orca.components

export type IRSessionShellProps = {
  entries?: IRSessionEntry[]
  /** 兼容旧入口：仅阅读卡队列 */
  cards?: IRCard[]
  panelId: string
  pluginName?: string
  loadFailed?: boolean
  loadErrorMessage?: string | null
  onRetryLoad?: () => void
  autoPostponeLabel?: string | null
  /** 会话级事实型提示（如混合退化为纯阅读），不打扰主路径 */
  sessionNotice?: string | null
  onUndoAutoPostpone?: () => void
  onClose?: () => void
  /** 嵌入工作区时隐藏顶层关闭，改由工作区顶栏处理 */
  embedded?: boolean
  onBackToLibrary?: () => void
  onQueueSnapshot?: (snapshot: { queue: IRSessionEntry[]; currentIndex: number }) => void
  onOpenQueue?: () => void
  onCloseHandlerChange?: (handler: (() => Promise<void>) | null) => void
  /** 完成页「再学一轮」：在同一面板重新装配今日队列 */
  onContinueSession?: () => void
  /**
   * 工作区是否把本会话视为前台活跃（library 下 reading pane 仍挂载但 display:none）。
   * false 时暂停活跃计时，不把逛资料库的时间计入 duration。
   */
  sessionActive?: boolean
}

export default function IRSessionShell({
  entries: entriesProp,
  cards,
  panelId,
  pluginName = "orca-srs",
  loadFailed = false,
  loadErrorMessage = null,
  onRetryLoad,
  autoPostponeLabel = null,
  sessionNotice = null,
  onUndoAutoPostpone,
  onClose,
  embedded = false,
  onBackToLibrary,
  onQueueSnapshot,
  onOpenQueue,
  onCloseHandlerChange,
  onContinueSession,
  sessionActive = true
}: IRSessionShellProps) {
  const initialEntries = entriesProp ?? readingCardsToEntries(cards ?? [])
  const [queue, setQueue] = useState<IRSessionEntry[]>(initialEntries)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState<IRSessionProgress>(() => createSessionProgress(initialEntries.length))
  const [isWorking, setIsWorking] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [postponeOpen, setPostponeOpen] = useState(false)
  const [importanceOpen, setImportanceOpen] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [breakpointError, setBreakpointError] = useState<string | null>(null)
  /** 阅读模式（默认）压平大纲视觉；编辑模式恢复原生结构操作。仅作用于本会话阅读条目。 */
  const [viewMode, setViewMode] = useState<"reading" | "edit">("reading")
  const [theme, setTheme] = useState<"mint" | "sepia" | "academic">(() => {
    const result = readIRReaderTheme()
    if (!result.ok) {
      console.warn("[IR] localStorage 读取主题失败，使用默认 mint:", result.error)
    }
    return result.theme
  })
  /** 阅读模式正文 max-width（px）；localStorage 全局偏好，默认 820 */
  const [contentWidth, setContentWidth] = useState(() => {
    const result = readIRReaderWidth()
    if (!result.ok) {
      console.warn("[IR] localStorage 读取正文宽度失败，使用默认 820:", result.error)
    }
    return result.width
  })
  /** 顺序解锁「完成本章」：询问下一章 today / tomorrow；取消不得推进 */
  const [completeChapterOpen, setCompleteChapterOpen] = useState(false)
  /** 非顺序 / 摘录「完成」确认 */
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  /** 章末小测确认（完成 Topic 成功后 / 更多菜单） */
  const [chapterQuizConfirmOpen, setChapterQuizConfirmOpen] = useState(false)
  const [chapterQuizTopicId, setChapterQuizTopicId] = useState<number | null>(null)
  /**
   * 完成 Topic 后已写库移出 IR，但 UI 故意不切下一篇，方便在本页做小测。
   * true 时「下一篇」只推进会话 UI（不再 performNext）。
   */
  const [postCompleteQuizHold, setPostCompleteQuizHold] = useState(false)
  const postCompleteQuizHoldRef = useRef(false)
  postCompleteQuizHoldRef.current = postCompleteQuizHold
  /** 读到文末的「下一篇」确认门闩 */
  const [endGateOpen, setEndGateOpen] = useState(false)
  /** 会话级一次性抑制：用户处理过一次门闩后不再反复打断主路径 */
  const endGateSuppressedRef = useRef(false)
  /** 会话内「撤销上一篇」单步记录（离开会话即随组件状态清空） */
  const [undoRecord, setUndoRecord] = useState<IRNextUndoRecord | null>(null)
  /**
   * 通知 action 可能在 setState 之后才被点击：用 ref 读最新门闩 / 撤销实现，
   * 避免闭包拿到「下一篇」当次 render 的旧 undoRecord（常为 null）。
   */
  const sessionAliveRef = useRef(true)
  const undoGateRef = useRef({
    record: null as IRNextUndoRecord | null,
    showSummary: false,
    queueLength: 0,
    isWorking: false
  })
  const handleUndoNextRef = useRef<() => Promise<void>>(async () => {})
  /** 稳定回调：只读 ref，可安全挂到 orca.notify action */
  const requestUndoNextFromNotify = useRef(() => {
    if (!sessionAliveRef.current) return
    const gate = undoGateRef.current
    if (!canUndoNext({
      record: gate.record,
      showSummary: gate.showSummary,
      queueLength: gate.queueLength,
      isWorking: gate.isWorking
    })) {
      orca.notify("info", IR_UNDO_STALE_FROM_NOTIFY_MESSAGE, {
        title: IR_NEXT_NOTIFY_TITLE
      })
      return
    }
    void handleUndoNextRef.current()
  }).current
  const [isSequentialActive, setIsSequentialActive] = useState(false)
  const [sequentialHasNext, setSequentialHasNext] = useState(true)
  const themeStorageWarnedRef = useRef(false)
  const widthStorageWarnedRef = useRef(false)
  /** 完成页展示的今日累计（或会话回退）指标 */
  const [summaryMetrics, setSummaryMetrics] = useState<IRSessionMetricsSnapshot | null>(null)
  const [summaryStorageWarning, setSummaryStorageWarning] = useState<string | null>(null)

  useEffect(() => {
    sessionAliveRef.current = true
    return () => {
      sessionAliveRef.current = false
    }
  }, [])

  useEffect(() => {
    const result = writeIRReaderTheme(theme)
    if (!result.ok) {
      console.warn("[IR] localStorage 写入主题失败:", result.error)
      if (!themeStorageWarnedRef.current) {
        themeStorageWarnedRef.current = true
        try {
          orca.notify(
            "warn",
            "无法保存阅读主题偏好（localStorage 不可用），已使用当前主题继续会话",
            { title: "渐进阅读" }
          )
        } catch (notifyError) {
          console.warn("[IR] 主题存储失败后发送 notify 也失败:", notifyError)
        }
      }
    }
  }, [theme])

  useEffect(() => {
    const result = writeIRReaderWidth(contentWidth)
    if (!result.ok) {
      console.warn("[IR] localStorage 写入正文宽度失败:", result.error)
      if (!widthStorageWarnedRef.current) {
        widthStorageWarnedRef.current = true
        try {
          orca.notify(
            "warn",
            "无法保存正文宽度偏好（localStorage 不可用），已使用当前宽度继续会话",
            { title: "渐进阅读" }
          )
        } catch (notifyError) {
          console.warn("[IR] 正文宽度存储失败后发送 notify 也失败:", notifyError)
        }
      }
    }
  }, [contentWidth])

  const setContentWidthSafe = (width: number) => {
    setContentWidth(clampIRReaderWidth(width))
  }

  const readerWidthStyle = {
    ["--ir-reading-content-max-width" as string]: `${contentWidth}px`
  } as React.CSSProperties

  const sessionRootRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const currentCardContainerRef = useRef<HTMLDivElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const metricsRef = useRef(new IRSessionMetrics())
  const startedRef = useRef(false)
  const cardEnteredAtRef = useRef<number>(Date.now())
  /**
   * 分段 sessionId：每次成功 commit 日统计后轮换，避免 one-shot dedupe
   * 吞掉 partial 之后的新进度，也避免全量快照双计。
   */
  const sessionIdRef = useRef(createIRSessionId())
  const sessionMetricsFinalizedRef = useRef(false)
  const lastSettledTotalsRef = useRef<IRDailyStatsTotals>(emptyIRDailyStatsTotals())
  const dailyStatsWarnedRef = useRef(false)
  const metricsActiveRef = useRef(false)
  const settleSegmentRef = useRef<(opts: { allowWhilePending: boolean; reason: string }) => void>(
    () => undefined
  )

  const currentEntry = queue[currentIndex]
  const currentCard = currentEntry?.kind === "reading" ? currentEntry.card : undefined
  const isReviewEntry = currentEntry?.kind === "review"
  const isTopic = currentCard?.cardType === "topic"
  const extractCoachEnabled = getIncrementalReadingSettings(pluginName).enableExtractCoach
  const nextEntry = queue[currentIndex + 1]
  const nextReadingBlockId = nextEntry?.kind === "reading"
    ? nextEntry.card.id
    : undefined
  const sessionVisiblyComplete = showSummary || queue.length === 0

  const readingContext = useIRReadingContext(currentCard)

  /** 完成后续 hold / 弹窗：断点、快捷键、排期入口统一门闩（纯函数可单测） */
  const interactionGuards = useMemo(
    () =>
      resolveIRSessionInteractionGuards({
        hasCurrentCard: Boolean(currentCard),
        showSummary,
        loadFailed,
        isReviewEntry: Boolean(isReviewEntry),
        endGateOpen,
        completeChapterOpen,
        archiveConfirmOpen,
        chapterQuizConfirmOpen,
        postCompleteQuizHold,
        contextMode: readingContext.contextState.mode
      }),
    [
      currentCard,
      showSummary,
      loadFailed,
      isReviewEntry,
      endGateOpen,
      completeChapterOpen,
      archiveConfirmOpen,
      chapterQuizConfirmOpen,
      postCompleteQuizHold,
      readingContext.contextState.mode
    ]
  )

  const pendingDue = useIRMixedPendingDueQueue({
    pluginName,
    queue,
    currentIndex,
    sessionVisiblyComplete,
    setQueue,
    onAppended: ({ appendedCount, shouldReopenSession, nextQueueLength }) => {
      if (appendedCount <= 0) return
      metricsRef.current.record("session.plan_more", appendedCount)
      setProgress((p: IRSessionProgress) => {
        let next = p
        for (let i = 0; i < appendedCount; i++) {
          next = addSessionPlannedItem(next)
        }
        return syncSessionRemaining(next, nextQueueLength)
      })
      if (shouldReopenSession) {
        setShowSummary(false)
        setSummaryMetrics(null)
        setSummaryStorageWarning(null)
        sessionMetricsFinalizedRef.current = false
        // 若此前为完成页 pause 了 metrics，回到活跃
        if (sessionActive && !metricsActiveRef.current && startedRef.current) {
          metricsRef.current.record("session.resume")
          metricsActiveRef.current = true
        }
      }
    }
  })
  const pendingDueRef = useRef(pendingDue)
  pendingDueRef.current = pendingDue

  // 无时间盒：只陈述已投入活跃时长；library/完成页暂停
  const timer = useIRSessionTimer({
    running:
      sessionActive &&
      !showSummary &&
      !loadFailed &&
      queue.length > 0
  })

  const breakpoint = useIRReadingBreakpoint({
    cardId: currentCard?.id ?? null,
    panelId,
    containerRef: currentCardContainerRef,
    scrollContainerRef,
    previewContainerRef,
    previewBlockId: readingContext.breakpointPreviewId,
    initialBreakpoint: currentCard?.readingBreakpoint ?? null,
    initialResumeBlockId: currentCard?.resumeBlockId ?? null,
    // hold 期间关闭：已归档 Topic 不得再写 ir.breakpoint / resume
    enabled: interactionGuards.breakpointEnabled,
    // chapter_browse 为临时探索态；hold 同样禁止新捕获，flush 只排空既有队列
    allowCapture: interactionGuards.allowCapture,
    onSaveError: (err) => {
      setBreakpointError(err instanceof Error ? err.message : String(err))
      metricsRef.current.record("breakpoint.save_failure")
    },
    onSaveSuccess: () => {
      setBreakpointError(null)
      metricsRef.current.record("breakpoint.save")
    },
    onRestoreSuccess: () => metricsRef.current.record("breakpoint.restore"),
    onRestoreFailure: () => metricsRef.current.record("breakpoint.restore_failure")
  })

  const endZone = useIRReadingEndZone({
    cardId: currentCard?.id ?? null,
    containerRef: currentCardContainerRef,
    scrollContainerRef,
    // hold 期间禁用文末门闩，避免确认后误走 performNext
    enabled: interactionGuards.endZoneEnabled
  })

  useEffect(() => {
    cardEnteredAtRef.current = Date.now()
  }, [currentEntry?.key])

  useEffect(() => {
    let cancelled = false
    const cardId = currentCard?.id
    if (cardId == null) {
      setIsSequentialActive(false)
      setSequentialHasNext(true)
      setCompleteChapterOpen(false)
      setArchiveConfirmOpen(false)
      return
    }
    setIsSequentialActive(false)
    setSequentialHasNext(true)
    setCompleteChapterOpen(false)
    setArchiveConfirmOpen(false)
    void loadSequentialSessionMeta(cardId)
      .then((meta) => {
        if (!cancelled) {
          setIsSequentialActive(meta.isActive)
          setSequentialHasNext(meta.hasNextChapter)
          if (!meta.isActive) setCompleteChapterOpen(false)
        }
      })
      .catch((error) => {
        console.error("[IR Session] 检测顺序激活章失败:", error)
        if (!cancelled) {
          setIsSequentialActive(false)
          setSequentialHasNext(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentCard?.id])

  const sessionSeed = entriesProp ?? cards
  useEffect(() => {
    // 新队列替换旧 shell 内容前：尽量结算上一分段（允许在 pending 时提交已完成工作）
    if (startedRef.current) {
      settleSegmentRef.current({ allowWhilePending: true, reason: "queue-replace" })
      pendingDueRef.current.clear("queue-replace")
    }
    const nextEntries = entriesProp ?? readingCardsToEntries(cards ?? [])
    setQueue(nextEntries)
    setCurrentIndex(0)
    setProgress(createSessionProgress(nextEntries.length))
    setShowSummary(false)
    setMoreOpen(false)
    setPostponeOpen(false)
    setImportanceOpen(false)
    setViewMode("reading")
    setSummaryMetrics(null)
    setSummaryStorageWarning(null)
    setUndoRecord(null)
    setEndGateOpen(false)
    endGateSuppressedRef.current = false
    sessionMetricsFinalizedRef.current = false
    lastSettledTotalsRef.current = emptyIRDailyStatsTotals()
    sessionIdRef.current = createIRSessionId()
    metricsRef.current.reset()
    startedRef.current = false
    metricsActiveRef.current = false
    pendingDueRef.current.resetForSession(nextEntries)
    timer.reset()
    if (nextEntries.length > 0) {
      startedRef.current = true
      metricsRef.current.record("session.start", nextEntries.length)
      metricsActiveRef.current = sessionActive
      if (!sessionActive) {
        metricsRef.current.record("session.pause")
        metricsActiveRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionSeed 驱动整段重置
  }, [sessionSeed])

  const notifyStorageFailure = (message: string) => {
    console.error("[IR Session] 今日统计持久化失败:", message)
    setSummaryStorageWarning(message)
    if (!dailyStatsWarnedRef.current) {
      dailyStatsWarnedRef.current = true
      try {
        orca.notify("warn", message, { title: "渐进阅读" })
      } catch (notifyError) {
        console.warn("[IR Session] 日统计失败后 notify 也失败:", notifyError)
      }
    }
  }

  /**
   * 分段结算日统计。失败不标记 settled，保持可重试。
   * queue 空但仍有 pending 时默认不 finalize（除非 allowWhilePending，如关闭/卸载）。
   */
  const settleActiveSegment = (options: {
    allowWhilePending: boolean
    reason: string
    updateSummary?: boolean
  }) => {
    if (loadFailed) return
    const repo = resolveOrcaRepo()
    const hasPending = pendingDueRef.current.hasPending()
    const hasSessionActivity = startedRef.current

    if (!hasSessionActivity) {
      if (options.updateSummary) {
        const loaded = loadIRDailyStats({ repo, pluginName })
        if (!loaded.ok) {
          notifyStorageFailure(
            `今日统计读取失败，显示为空：${loaded.error.message}`
          )
          setSummaryMetrics(dailyTotalsToMetricsSnapshot(loaded.record.totals))
          return
        }
        setSummaryMetrics(dailyTotalsToMetricsSnapshot(loaded.record.totals))
        setSummaryStorageWarning(null)
      }
      return
    }

    // 完成路径：无 pending 才写 session.end；关闭路径允许在 pending 时先 pause 再提交增量
    if (!hasPending || options.allowWhilePending) {
      if (metricsActiveRef.current) {
        metricsRef.current.record("session.pause")
        metricsActiveRef.current = false
      }
      if (!hasPending && !sessionMetricsFinalizedRef.current) {
        sessionMetricsFinalizedRef.current = true
        const snap = metricsRef.current.getSnapshot()
        if (!snap.sessionStartedAt && progress.planned > 0) {
          metricsRef.current.record("session.start", progress.planned)
        }
        if (metricsRef.current.getSnapshot().sessionEndedAt == null) {
          metricsRef.current.record("session.end", progress.completed)
        }
      }
    }

    const sessionSnap = metricsRef.current.getSnapshot()
    const delta = computeIRDailyStatsDelta(sessionSnap, lastSettledTotalsRef.current)
    if (
      !shouldCommitIRDailyStatsSegment({
        hasSessionActivity: true,
        delta,
        hasPendingShortRelearn: hasPending,
        allowWhilePending: options.allowWhilePending
      })
    ) {
      if (options.updateSummary && !hasPending) {
        const loaded = loadIRDailyStats({ repo, pluginName })
        if (loaded.ok) {
          // 无新增量时展示今日累计 + 本会话
          const merged = {
            ...loaded.record.totals,
            ...snapshotToDailyTotals(sessionSnap)
          }
          // 展示：日累计已含 lastSettled；补上未提交 delta（此处为 0）
          setSummaryMetrics(
            dailyTotalsToMetricsSnapshot(
              loaded.ok
                ? {
                  ...loaded.record.totals,
                  durationMs:
                    loaded.record.totals.durationMs + (delta.durationMs || 0),
                  plannedCount:
                    loaded.record.totals.plannedCount + delta.plannedCount,
                  completedCount:
                    loaded.record.totals.completedCount + delta.completedCount,
                  topicProcessed:
                    loaded.record.totals.topicProcessed + delta.topicProcessed,
                  extractProcessed:
                    loaded.record.totals.extractProcessed + delta.extractProcessed,
                  reviewProcessed:
                    loaded.record.totals.reviewProcessed + delta.reviewProcessed,
                  extractCreated:
                    loaded.record.totals.extractCreated + delta.extractCreated,
                  itemCreated:
                    loaded.record.totals.itemCreated + delta.itemCreated
                }
                : snapshotToDailyTotals(sessionSnap)
            )
          )
        } else {
          setSummaryMetrics(sessionSnap)
        }
      }
      return
    }

    const commitResult = commitIRSessionToDailyStats({
      sessionId: sessionIdRef.current,
      snapshot: deltaTotalsToCommitSnapshot(delta),
      repo,
      pluginName
    })
    if (!commitResult.ok) {
      notifyStorageFailure(
        `今日统计保存失败（${options.reason}），仍可重试：${commitResult.error.message}`
      )
      if (options.updateSummary) setSummaryMetrics(sessionSnap)
      return
    }
    if (commitResult.committed) {
      lastSettledTotalsRef.current = snapshotToDailyTotals(sessionSnap)
      sessionIdRef.current = createIRSessionId()
      console.log(
        `[IR Session] 日统计分段已提交 reason=${options.reason} delta.completed=${delta.completedCount}`
      )
    }
    if (options.updateSummary) {
      setSummaryMetrics(dailyTotalsToMetricsSnapshot(commitResult.record.totals))
      setSummaryStorageWarning(null)
    }
  }
  settleSegmentRef.current = settleActiveSegment

  // 活跃可见性：pause/resume metrics（资料库 display:none）
  useEffect(() => {
    if (!startedRef.current) return
    if (sessionMetricsFinalizedRef.current) return
    if (sessionActive && !metricsActiveRef.current && !showSummary) {
      metricsRef.current.record("session.resume")
      metricsActiveRef.current = true
    } else if (!sessionActive && metricsActiveRef.current) {
      metricsRef.current.record("session.pause")
      metricsActiveRef.current = false
    }
  }, [sessionActive, showSummary])

  /**
   * 完成页：queue 空且无 pending 时结算；有 pending 只展示、可 reopen。
   * 初始空队列只读取今日累计。
   */
  useEffect(() => {
    if (loadFailed) return
    if (!sessionVisiblyComplete) return
    settleActiveSegment({
      allowWhilePending: false,
      reason: "complete-view",
      updateSummary: true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFailed, showSummary, queue.length, pluginName])

  // 卸载：提交已完成工作（含 pending 等待中）
  useEffect(() => {
    return () => {
      try {
        settleSegmentRef.current({ allowWhilePending: true, reason: "unmount" })
      } catch (error) {
        console.error("[IR Session] 卸载时日统计结算失败:", error)
      }
      pendingDueRef.current.clear("unmount")
    }
  }, [])

  useEffect(() => {
    onQueueSnapshot?.({ queue, currentIndex })
  }, [queue, currentIndex, onQueueSnapshot])

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        action?: string
        panelId?: string
        targetBlockId?: DbId
      } | undefined
      if (!detail?.action || showSummary || loadFailed) return
      if (detail.panelId !== panelId) return
      // hold 期间仅允许「下一篇」推进 UI；其它会话动作会写 ir.* 或打开写库入口
      const scheduleOk = interactionGuards.scheduleActionsEnabled
      if (detail.action === "next") {
        requestNext()
        return
      }
      if (!scheduleOk) return
      if (detail.action === "postpone") {
        setPostponeOpen(true)
        setMoreOpen(false)
        setImportanceOpen(false)
      }
      if (detail.action === "priority") {
        setImportanceOpen(true)
        setMoreOpen(false)
        setPostponeOpen(false)
      }
      if (detail.action === "toggleViewMode") toggleViewMode()
      if (detail.action === "skipChapter") {
        event.preventDefault()
        void handleSkipChapter()
      }
      if (detail.action === "itemize") {
        const intercept = resolveSessionItemizeIntercept({
          sessionPanelId: panelId,
          eventPanelId: detail.panelId,
          currentCardId: currentCard?.id,
          currentCardType: currentCard?.cardType,
          targetBlockId: detail.targetBlockId
        })
        if (!intercept.handle) return

        event.preventDefault()
        if (intercept.kind === "topic_block") {
          orca.notify("warn", "请先创建摘录，再挖空制成记忆卡片", { title: "渐进阅读" })
        } else {
          void handleItemize()
        }
      }
    }
    window.addEventListener("orca-srs:ir-session-action", onAction as EventListener)
    return () => window.removeEventListener("orca-srs:ir-session-action", onAction as EventListener)
  })

  const removeCurrent = (options?: {
    metric?: "action.review"
  }) => {
    if (options?.metric === "action.review") {
      metricsRef.current.record("action.review")
      // 复习评分是会写库的动作：撤销只覆盖最近一次「下一篇」，其后不再提供
      setUndoRecord(null)
    }
    setQueue((prev: IRSessionEntry[]) => {
      const kept = prev.filter((_: IRSessionEntry, idx: number) => idx !== currentIndex)
      const nextIndex = kept.length === 0 ? 0 : Math.min(currentIndex, kept.length - 1)
      setCurrentIndex(nextIndex)
      setProgress((p: IRSessionProgress) =>
        syncSessionRemaining(markSessionItemCompleted(p), kept.length)
      )
      if (kept.length === 0) setShowSummary(true)
      return kept
    })
  }

  /**
   * 混合复习完成：Again/Hard 短期卡只 **track** pending，等真实 due 再 append；
   * 800ms dwell 只负责离开当前卡，不得立刻入队。
   */
  const handleReviewEntryComplete = (requeueCard?: ReviewCard) => {
    if (requeueCard) {
      pendingDue.track(requeueCard)
    }
    removeCurrent({ metric: "action.review" })
  }

  /**
   * 混合复习卡 required 块明确 missing：只从队列剔除。
   * 不得走 handleReviewEntryComplete（会记 action.review / 完成数）。
   * planned 保留（计划中有一项不可用）；completed / reviewProcessed 不增加。
   */
  const handleReviewEntryMissing = useCallback(
    (info: { cardKey: string; userMessage: string }) => {
      console.log(
        `[${pluginName}] mixed 跳过不存在的复习卡 cardKey=${info.cardKey}: ${info.userMessage}`
      )
      setQueue((prev: IRSessionEntry[]) => {
        const kept = prev.filter((_: IRSessionEntry, idx: number) => idx !== currentIndex)
        const nextIndex = kept.length === 0 ? 0 : Math.min(currentIndex, kept.length - 1)
        setCurrentIndex(nextIndex)
        setProgress((p: IRSessionProgress) => syncSessionRemaining(p, kept.length))
        if (kept.length === 0) setShowSummary(true)
        return kept
      })
    },
    [currentIndex, pluginName]
  )

  const {
    handleNext,
    handlePostpone,
    // 摘录 UI 已迁至原生选区工具栏；Alt+X 仍走 createExtract 编辑器命令
    handleItemize,
    handleConvertToQA,
    handleConvertToDirection,
    handleArchive,
    handleCompleteRequest,
    handleSkipChapter,
    handleImportanceNudge
  } = createIRSessionCardActions({
    currentCard,
    currentEntry,
    currentIndex,
    isTopic,
    isWorking,
    isSequentialActive,
    pluginName,
    metricsRef,
    cardEnteredAtRef,
    breakpoint,
    setIsWorking,
    setQueue,
    setPostponeOpen,
    setImportanceOpen,
    setMoreOpen,
    setCompleteChapterOpen,
    setArchiveConfirmOpen,
    setUndoRecord,
    requestUndoNextFromNotify,
    removeCurrent
  })

  const offerChapterQuiz = useCallback((topicBlockId: number) => {
    setChapterQuizTopicId(topicBlockId)
    setChapterQuizConfirmOpen(true)
  }, [])

  /** 解除完成后续停留并切到会话下一篇（队列里仍占位的已完成 Topic） */
  const releasePostCompleteHoldAndAdvance = useCallback(() => {
    if (!postCompleteQuizHoldRef.current) return
    setPostCompleteQuizHold(false)
    postCompleteQuizHoldRef.current = false
    removeCurrent()
  }, [removeCurrent])

  /** 完成成功后再问是否小测（仅 Topic）；Topic 路径 defer UI 推进 */
  const handleArchiveThenOfferQuiz = useCallback(
    async (options?: { nextChapterSchedule?: "today" | "tomorrow" }) => {
      const topicId =
        isTopic && currentCard ? Number(currentCard.id) : null
      const deferUi = topicId != null && Number.isFinite(topicId) && topicId > 0
      const ok = await handleArchive({
        ...options,
        deferUiAdvance: deferUi
      })
      if (ok && deferUi && topicId != null) {
        // 进入 hold：收起一切会写 ir.* 的入口，再 offer 小测
        setPostponeOpen(false)
        setImportanceOpen(false)
        setMoreOpen(false)
        setEndGateOpen(false)
        setPostCompleteQuizHold(true)
        postCompleteQuizHoldRef.current = true
        offerChapterQuiz(topicId)
        return
      }
      // 非 Topic 或完成失败：handleArchive 已按需推进，无需 hold
    },
    [currentCard, handleArchive, isTopic, offerChapterQuiz]
  )

  const handleChapterQuizRequest = useCallback(() => {
    if (!isTopic || !currentCard) {
      orca.notify("warn", CHAPTER_QUIZ_COPY.needTopic, { title: "章末小测" })
      return
    }
    setMoreOpen(false)
    setImportanceOpen(false)
    setPostponeOpen(false)
    // 阅读中主动出题：不归档、不 hold
    offerChapterQuiz(Number(currentCard.id))
  }, [currentCard, isTopic, offerChapterQuiz])

  const handleChapterQuizConfirmClose = useCallback(() => {
    setChapterQuizConfirmOpen(false)
    setChapterQuizTopicId(null)
    // 用户不要小测：若来自完成后续停留，现在才切下一篇
    if (postCompleteQuizHoldRef.current) {
      releasePostCompleteHoldAndAdvance()
    }
  }, [releasePostCompleteHoldAndAdvance])

  const handleChapterQuizConfirm = useCallback(
    async (count?: number) => {
      if (chapterQuizTopicId == null) {
        setChapterQuizConfirmOpen(false)
        return
      }
      if (!isAIConfigured(pluginName)) {
        orca.notify("warn", CHAPTER_QUIZ_COPY.needAi, { title: "章末小测" })
        return
      }
      setIsWorking(true)
      try {
        await launchChapterQuiz({
          pluginName,
          topicBlockId: chapterQuizTopicId,
          // 用户选择的题数（5/10/15 或「按设置 N 题」）冻结进本轮 repr；
          // 未传时读偏好默认（兼容旧调用方）
          questionCount: count,
          // 仅「完成后续停留」需要测完推进会话
          sessionContinueNext: postCompleteQuizHoldRef.current
        })
        setChapterQuizConfirmOpen(false)
        // 保留 postCompleteQuizHold：测完点「继续下一篇」再推进
        setChapterQuizTopicId(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[IR Session] 章末小测启动失败:", error)
        orca.notify("error", message, { title: "章末小测" })
      } finally {
        setIsWorking(false)
      }
    },
    [chapterQuizTopicId, pluginName]
  )

  // 小测块「继续下一篇」→ 推进完成后续停留
  useEffect(() => {
    const onAdvance = (event: Event) => {
      if (!postCompleteQuizHoldRef.current) return
      const detail = (event as CustomEvent<ChapterQuizAdvanceDetail>).detail
      const heldId = currentCard?.id != null ? Number(currentCard.id) : null
      if (
        detail?.topicBlockId != null &&
        heldId != null &&
        detail.topicBlockId !== heldId
      ) {
        return
      }
      releasePostCompleteHoldAndAdvance()
    }
    window.addEventListener(CHAPTER_QUIZ_ADVANCE_EVENT, onAdvance as EventListener)
    return () =>
      window.removeEventListener(
        CHAPTER_QUIZ_ADVANCE_EVENT,
        onAdvance as EventListener
      )
  }, [currentCard?.id, releasePostCompleteHoldAndAdvance])

  // 小测「跳转原文」：在 ir-session 正文内定位，不离开渐进阅读
  useEffect(() => {
    let cancelLocate: (() => void) | null = null

    const onLocate = (event: Event) => {
      const detail = (event as CustomEvent<ChapterQuizLocateDetail>).detail
      // 定向请求：只响应指定给自己的定位；无 targetPanelId 时保持广播兼容
      // （effect 空依赖闭包捕获首次 panelId；会话面板生命周期内 panelId 不变）
      if (detail?.targetPanelId && detail.targetPanelId !== panelId) return
      const sourceBlockId = detail?.sourceBlockId
      if (
        typeof sourceBlockId !== "number" ||
        !Number.isFinite(sourceBlockId) ||
        sourceBlockId <= 0
      ) {
        return
      }

      // 当前会话正在读的篇：优先正文容器，其次整块滚动区
      const root =
        currentCardContainerRef.current ??
        scrollContainerRef.current ??
        sessionRootRef.current
      if (!root) return

      detail.claimed = true
      cancelLocate?.()
      clearLocateHighlight(root)
      cancelLocate = scheduleLocateBlock(root, sourceBlockId, {
        maxAttempts: 24,
        onFound: () => {
          orca.notify("success", CHAPTER_QUIZ_COPY.jumpToSourceOk, {
            title: "章末小测"
          })
        },
        onMiss: () => {
          // 已 claimed（本面板接管定位），jumpToQuizSourceBlock 不再兜底；
          // 块不在当前篇/未展开时给出可见反馈
          console.warn(
            `[IR Session] 章末小测定位未找到块 #${sourceBlockId}（可能未展开或不在当前篇）`
          )
          orca.notify("warn", CHAPTER_QUIZ_COPY.jumpToSourceFail, {
            title: "章末小测"
          })
        }
      })
    }

    window.addEventListener(CHAPTER_QUIZ_LOCATE_EVENT, onLocate as EventListener)
    return () => {
      cancelLocate?.()
      window.removeEventListener(
        CHAPTER_QUIZ_LOCATE_EVENT,
        onLocate as EventListener
      )
    }
  }, [])

  const undoAvailable = canUndoNext({
    record: undoRecord,
    showSummary,
    queueLength: queue.length,
    isWorking
  })
  // 每帧同步门闩，供通知 action 在任意时刻读取
  undoGateRef.current = {
    record: undoRecord,
    showSummary,
    queueLength: queue.length,
    isWorking
  }

  /**
   * 撤销上一篇：先回滚排期（写库），成功后再回插队列并切回。
   * 顺序反过来会出现「UI 已回去但排期仍被污染」的假撤销；失败保留记录以便重试。
   */
  const handleUndoNext = async () => {
    if (!sessionAliveRef.current) return
    if (!undoRecord || !undoAvailable) return
    setIsWorking(true)
    try {
      // 撤销同样是离开当前卡：先排空当前卡断点。断点失败可见（banner + 日志）但不阻断撤销，
      // 否则一次无关的断点写入错误就会把用户困在误点结果里。
      try {
        await breakpoint.flush()
      } catch (flushError) {
        const flushMessage = flushError instanceof Error ? flushError.message : String(flushError)
        console.error("[IR Session] 撤销前断点保存失败:", flushError)
        setBreakpointError(flushMessage)
      }
      await undoPerformNext(undoRecord.cardId, undoRecord.snapshot)
      const restoredEntry = undoRecord.entry.kind === "reading"
        ? {
          ...undoRecord.entry,
          card: applyIRStateToCard(undoRecord.entry.card, undoRecord.snapshot)
        }
        : undoRecord.entry
      const cardType = undoRecord.entry.kind === "reading"
        ? undoRecord.entry.card.cardType
        : undefined
      setQueue((prev: IRSessionEntry[]) => {
        const result = reinsertUndoEntry(prev, restoredEntry, undoRecord.index)
        setCurrentIndex(result.index)
        if (result.inserted) {
          setProgress((p: IRSessionProgress) =>
            syncSessionRemaining(unmarkSessionItemCompleted(p), result.queue.length))
        }
        return result.queue
      })
      metricsRef.current.record("action.next.undo", undefined, cardType ? { cardType } : undefined)
      setUndoRecord(null)
      setEndGateOpen(false)
      orca.notify("success", "已回到上一篇", { title: "渐进阅读" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[IR Session] 撤销上一篇失败:", error)
      orca.notify("error", `撤销上一篇失败：${message}`, { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }
  handleUndoNextRef.current = handleUndoNext

  /**
   * 「下一篇」统一入口：读到文末且停留足够久时先确认，其余情况与既有行为完全一致。
   */
  const requestNext = () => {
    if (isWorking || endGateOpen) return
    // 完成后续小测停留：本章 IR 已归档，下一篇只推进 UI，勿再 performNext
    if (postCompleteQuizHoldRef.current) {
      releasePostCompleteHoldAndAdvance()
      return
    }
    if (!interactionGuards.scheduleActionsEnabled) return
    if (!currentCard) {
      handleNext()
      return
    }
    const gate = shouldGateNext({
      state: endZone.measureNow(),
      now: Date.now(),
      suppressed: endGateSuppressedRef.current
    })
    if (!gate) {
      handleNext()
      return
    }
    setMoreOpen(false)
    setPostponeOpen(false)
    setImportanceOpen(false)
    setEndGateOpen(true)
  }

  const closeEndGate = () => {
    // 任一分支都视为用户已明确处理：本会话不再反复弹
    endGateSuppressedRef.current = true
    setEndGateOpen(false)
  }

  const openImportanceMenu = () => {
    if (!interactionGuards.scheduleActionsEnabled) return
    setImportanceOpen((v: boolean) => {
      const next = !v
      if (next) {
        setMoreOpen(false)
        setPostponeOpen(false)
      }
      return next
    })
  }

  const openPostponeMenu = () => {
    if (!interactionGuards.scheduleActionsEnabled) return
    setPostponeOpen(true)
    setMoreOpen(false)
    setImportanceOpen(false)
  }

  const toggleMorePanel = () => {
    // hold 时不允许打开「更多」：内含推后/转化等写库入口
    if (!interactionGuards.scheduleActionsEnabled) return
    setMoreOpen((v: boolean) => {
      const next = !v
      if (next) {
        setImportanceOpen(false)
        setPostponeOpen(false)
      }
      return next
    })
  }

  const finishClose = () => {
    try {
      settleActiveSegment({ allowWhilePending: true, reason: "close" })
    } catch (error) {
      console.error("[IR Session] 关闭时日统计结算失败:", error)
    }
    pendingDue.clear("close")
    if (onClose) onClose()
  }

  const handleBackToLibrary = () => {
    try {
      settleActiveSegment({ allowWhilePending: true, reason: "back-to-library" })
    } catch (error) {
      console.error("[IR Session] 返回资料库时日统计结算失败:", error)
    }
    // 保留 pending：会话 shell 仍挂载，到期仍可 reopen；仅结算已完成工作
    onBackToLibrary?.()
  }

  const handleClose = async (force = false) => {
    if (!force) {
      try {
        await breakpoint.flush()
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        setBreakpointError(msg)
        orca.notify("error", `关闭前断点保存失败：${msg}。可重试或强制关闭。`, { title: "渐进阅读" })
        return
      }
    }
    finishClose()
  }

  useEffect(() => {
    if (!onCloseHandlerChange) return
    onCloseHandlerChange(() => handleClose())
    return () => onCloseHandlerChange(null)
  }, [onCloseHandlerChange, handleClose])

  const toggleViewMode = () => {
    setViewMode((prev: "reading" | "edit") => (prev === "reading" ? "edit" : "reading"))
  }

  useIRShortcuts({
    // 确认类对话框 / 完成后续 hold：停用会话快捷键，避免 Enter 穿透写库
    enabled: interactionGuards.shortcutsEnabled,
    panelId,
    sessionRootRef,
    handlers: {
      onNext: requestNext,
      onPostpone: openPostponeMenu,
      onPriority: openImportanceMenu,
      onEscape: () => {
        setPostponeOpen(false)
        setMoreOpen(false)
        setImportanceOpen(false)
      },
      onUndoNext: undoAvailable ? () => void handleUndoNext() : undefined
    }
  })

  /** 点击「更多操作」面板外区域时自动收起（「更多/收起」按钮仍由 onMore 切换） */
  useEffect(() => {
    if (!moreOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (shouldDismissIRMorePanel(event.target)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [moreOpen])

  /** 点击「重要性」面板外区域时自动收起 */
  useEffect(() => {
    if (!importanceOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (shouldDismissIRImportancePanel(event.target)) {
        setImportanceOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [importanceOpen])

  const sourceLabel = useMemo(() => {
    if (!currentCard) return null
    return formatIRReadingSourceLabel(currentCard)
  }, [currentCard])

  /**
   * 视图整体替换时归零真实纵向滚动 owner（常见为 host `.orca-block-editor` 祖先）。
   * 结束最后一张长阅读卡后完成页只占一屏，但 owner 仍停在原阅读位置，
   * 用户必须手动上滚才能看到「今日学习完毕」。阅读条目不在此归零：
   * 由断点恢复统一「先归零再对齐」。
   */
  const viewportResetKey = resolveIRSessionViewportResetKey({
    loadFailed,
    showSummary,
    queueLength: queue.length,
    isReviewEntry,
    currentEntryKey: currentEntry?.key
  })

  useEffect(() => {
    if (viewportResetKey == null) return
    // 会话内滚动节点优先：它自身可能被 React 复用而保留 scrollTop；
    // 解析祖先 owner 仍能覆盖「内部无滚动范围、host 才是滚动容器」的运行时形态
    resetViewportScrollTop(scrollContainerRef.current ?? sessionRootRef.current)
  }, [viewportResetKey])

  if (loadFailed) {
    return (
      <div ref={sessionRootRef} className="ir-reading__launch" role="alert">
        <div className="ir-reading__launch-error">
          数据读取失败{loadErrorMessage ? `：${loadErrorMessage}` : ""}
        </div>
        <div className="ir-reading__launch-hint">这不是「暂无到期内容」。</div>
        {onRetryLoad ? <Button tabIndex={0} variant="solid" onClick={onRetryLoad}>重试</Button> : null}
        {embedded && onBackToLibrary ? (
          <Button tabIndex={0} variant="plain" onClick={handleBackToLibrary}>返回资料库</Button>
        ) : null}
        {!embedded && onClose ? <Button tabIndex={0} variant="plain" onClick={onClose}>关闭</Button> : null}
      </div>
    )
  }

  if (showSummary || queue.length === 0) {
    // effect 结算前用会话快照占位；空队列无活动时为零，结算后为今日累计
    const displayMetrics = summaryMetrics ?? metricsRef.current.getSnapshot()
    return (
      <div
        ref={sessionRootRef}
        className="ir-reading"
        data-ir-theme={theme}
        style={readerWidthStyle}
      >
        <IRSessionSummary
          metrics={displayMetrics}
          autoPostponeCount={0}
          reviewCompleted={displayMetrics.reviewProcessed}
          storageWarning={summaryStorageWarning}
          // 本次一条都没处理 = 装配出来就是空队列：今天真的没有更多了，
          // 此时再给「再学一轮」只会重装出同一个空队列（点了像没反应）
          allDoneForToday={!startedRef.current}
          onContinue={startedRef.current ? onContinueSession : undefined}
          onClose={embedded ? handleBackToLibrary : () => void handleClose()}
          closeLabel={embedded ? "返回资料库" : "关闭"}
        />
      </div>
    )
  }

  if (!currentEntry) return null

  if (isReviewEntry && currentEntry.kind === "review") {
    // 不挂 data-ir-theme / 阅读正文宽度：避免绿茶/书卷等纸张主题与 max-width 纸面
    // 污染记忆卡 UI；表面样式对齐独立 SRS 复习（见 ir-workspace.css --mixed-review）
    return (
      <div
        ref={sessionRootRef}
        className="ir-reading ir-reading--mixed-review"
      >
        <IRSessionHeader
          progress={progress}
          elapsedTimeLabel={timer.formattedElapsed}
          autoPostponeLabel={autoPostponeLabel}
          sessionNotice={sessionNotice}
          onUndoAutoPostpone={onUndoAutoPostpone}
          onUndoNext={undoAvailable ? () => void handleUndoNext() : undefined}
          onClose={embedded ? undefined : () => void handleClose()}
          onOpenQueue={onOpenQueue}
          compact={embedded}
          reviewFocus
        />
        <div className="ir-reading__scroll" ref={scrollContainerRef}>
          <IRMixedReviewPane
            card={currentEntry.card}
            panelId={panelId}
            pluginName={pluginName}
            nextBlockId={nextReadingBlockId}
            onComplete={handleReviewEntryComplete}
            onMissing={handleReviewEntryMissing}
          />
        </div>
      </div>
    )
  }

  if (!currentCard) return null

  return (
    <div
      ref={sessionRootRef}
      className="ir-reading"
      data-ir-view-mode={viewMode}
      data-ir-card-type={isTopic ? "topic" : "extract"}
      data-ir-card-id={String(currentCard.id)}
      data-ir-theme={theme}
      data-ir-content-width={String(contentWidth)}
      style={readerWidthStyle}
      onMouseUp={breakpoint.scheduleCapture}
      onKeyUp={breakpoint.scheduleCapture}
    >
      <IRSessionHeader
        progress={progress}
        elapsedTimeLabel={timer.formattedElapsed}
        autoPostponeLabel={autoPostponeLabel}
        sessionNotice={sessionNotice}
        onUndoAutoPostpone={onUndoAutoPostpone}
        onUndoNext={undoAvailable ? () => void handleUndoNext() : undefined}
        onClose={embedded ? undefined : () => void handleClose()}
        onOpenQueue={onOpenQueue}
        compact={embedded}
      />

      {breakpointError ? (
        <div className="ir-reading__banner ir-reading__banner--error" role="alert">
          <span>断点保存失败：{breakpointError}</span>
          <Button
            tabIndex={0}
            variant="plain"
            onClick={() => void breakpoint.flush().then(() => setBreakpointError(null)).catch(() => undefined)}
          >
            重试保存
          </Button>
          {embedded ? (
            <Button tabIndex={0} variant="outline" onClick={() => void handleClose(true)}>强制结束</Button>
          ) : (
            <Button tabIndex={0} variant="outline" onClick={() => void handleClose(true)}>强制关闭</Button>
          )}
        </div>
      ) : null}

      <div className="ir-reading__scroll" ref={scrollContainerRef}>
        <IRReadingPane
          cardId={currentCard.id}
          panelId={panelId}
          cardType={currentCard.cardType}
          contextState={readingContext.contextState}
          containerRef={currentCardContainerRef}
          previewContainerRef={previewContainerRef}
          scrollContainerRef={scrollContainerRef}
          onBreadcrumbClick={readingContext.onBreadcrumbClick}
          onToggleNearContext={readingContext.onToggleNearContext}
          sourceLabel={sourceLabel}
          viewMode={viewMode}
          pluginName={pluginName}
          enableBlockExplain
          sourceTopicId={currentCard.sourceTopicId}
          enableExtractCoach={extractCoachEnabled}
        />
      </div>

      <IRSessionChrome
        isTopic={isTopic}
        isWorking={isWorking}
        isSequentialActive={isSequentialActive}
        sequentialHasNext={sequentialHasNext}
        priority={currentCard.priority}
        theme={theme}
        contentWidth={contentWidth}
        viewMode={viewMode}
        embedded={embedded}
        postponeOpen={postponeOpen}
        importanceOpen={importanceOpen}
        moreOpen={moreOpen}
        completeChapterOpen={completeChapterOpen}
        archiveConfirmOpen={archiveConfirmOpen}
        showReturn={readingContext.showReturn}
        onNext={requestNext}
        onConvertToQA={
          interactionGuards.scheduleActionsEnabled ? handleConvertToQA : undefined
        }
        onConvertToDirection={
          interactionGuards.scheduleActionsEnabled ? handleConvertToDirection : undefined
        }
        onChapterQuiz={
          interactionGuards.scheduleActionsEnabled ? handleChapterQuizRequest : undefined
        }
        onComplete={() => {
          // 已完成且停留做小测时，「完成」改为离开本章 → 下一篇（只推进 UI）
          if (postCompleteQuizHoldRef.current) {
            releasePostCompleteHoldAndAdvance()
            return
          }
          if (!interactionGuards.scheduleActionsEnabled) return
          handleCompleteRequest()
        }}
        onImportance={openImportanceMenu}
        onMore={toggleMorePanel}
        onReturn={readingContext.onReturnFromBrowse}
        onPostponeChoose={(choice) => {
          if (!interactionGuards.scheduleActionsEnabled) return
          handlePostpone(choice)
        }}
        onPostponeClose={() => setPostponeOpen(false)}
        onImportanceChoose={(direction) => {
          if (!interactionGuards.scheduleActionsEnabled) return
          handleImportanceNudge(direction)
        }}
        onImportanceClose={() => setImportanceOpen(false)}
        onOpenPostpone={openPostponeMenu}
        onThemeChange={setTheme}
        onContentWidthChange={setContentWidthSafe}
        onToggleViewMode={toggleViewMode}
        onBackToLibrary={handleBackToLibrary}
        onCompleteChapterClose={() => setCompleteChapterOpen(false)}
        onCompleteChapterToday={() => {
          if (!interactionGuards.scheduleActionsEnabled) return
          void handleArchiveThenOfferQuiz({ nextChapterSchedule: "today" })
        }}
        onCompleteChapterTomorrow={() => {
          if (!interactionGuards.scheduleActionsEnabled) return
          void handleArchiveThenOfferQuiz({ nextChapterSchedule: "tomorrow" })
        }}
        onArchiveConfirmClose={() => setArchiveConfirmOpen(false)}
        onArchiveConfirm={() => {
          if (!interactionGuards.scheduleActionsEnabled) return
          void handleArchiveThenOfferQuiz()
        }}
        chapterQuizConfirmOpen={chapterQuizConfirmOpen}
        chapterQuizMode={postCompleteQuizHold ? "post-complete" : "normal"}
        pluginName={pluginName}
        onChapterQuizConfirmClose={handleChapterQuizConfirmClose}
        onChapterQuizConfirm={(count) => void handleChapterQuizConfirm(count)}
      />

      <IREndOfContentDialog
        open={endGateOpen && interactionGuards.scheduleActionsEnabled}
        isWorking={isWorking}
        isSequentialActive={isSequentialActive}
        onClose={closeEndGate}
        onLater={() => {
          if (!interactionGuards.scheduleActionsEnabled) {
            closeEndGate()
            return
          }
          closeEndGate()
          handleNext()
        }}
        onComplete={() => {
          if (!interactionGuards.scheduleActionsEnabled) {
            closeEndGate()
            return
          }
          closeEndGate()
          // 走现有完成主路径：顺序激活章仍进解锁对话框，其余进归档确认
          handleCompleteRequest()
        }}
      />
    </div>
  )
}
