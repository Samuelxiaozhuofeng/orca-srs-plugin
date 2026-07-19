/**
 * 渐进阅读会话外壳：生命周期、快捷键、断点与主动作
 * 布局：单滚动正文 + 底部固定动作栏；可嵌入统一工作区
 */

import type { CursorData, DbId } from "../../orca.d.ts"
import type { IRCard } from "../../srs/incrementalReadingCollector"
import { createExtract } from "../../srs/extractUtils"
import { convertExtractToItem } from "../../srs/incremental-reading/irConversionService"
import { IRSessionMetrics } from "../../srs/incremental-reading/irMetrics"
import type { IRSessionMetricsSnapshot } from "../../srs/incremental-reading/irMetrics"
import {
  commitIRSessionToDailyStats,
  createIRSessionId,
  dailyTotalsToMetricsSnapshot,
  loadIRDailyStats,
  resolveOrcaRepo
} from "../../srs/incremental-reading/irDailyStatsStorage"
import {
  createSessionProgress,
  markSessionItemCompleted,
  syncSessionRemaining
} from "../../srs/incremental-reading/irSessionProgress"
import {
  performArchive,
  performNext,
  performPostpone,
  performPriorityAdjust,
  performSkipChapter
} from "../../srs/incremental-reading/irSessionService"
import type { NextChapterSchedule } from "../../importers/epub/types"
import { isSequentialActiveChapter } from "../../srs/incremental-reading/irSchedulingHelpers"
import { resolveSessionItemizeIntercept } from "../../srs/incremental-reading/irSessionActionsLogic"
import { postponeDaysForChoice } from "../../srs/incrementalReadingStorage"
import { tierToPriority, priorityToTier } from "../../srs/incremental-reading/irQueuePolicy"
import { recordDwellSample } from "../../srs/incremental-reading/irCostCalibration"
import type { IRSessionProgress } from "../../srs/incremental-reading/irTypes"
import {
  readingCardsToEntries,
  type IRSessionEntry
} from "../../srs/incremental-reading/irMixedQueuePolicy"
import { useIRReadingBreakpoint } from "../../hooks/useIRReadingBreakpoint"
import { useIRShortcuts } from "../../hooks/useIRShortcuts"
import { useIRSessionTimer } from "../../hooks/useIRSessionTimer"
import IRMixedReviewPane from "./IRMixedReviewPane"
import IRActionBar from "./IRActionBar"
import IRPostponeMenu, { type PostponeChoice } from "./IRPostponeMenu"
import IRReadingPane from "./IRReadingPane"
import IRSessionHeader from "./IRSessionHeader"
import IRSessionSummary from "./IRSessionSummary"
import { formatIRReadingSourceLabel } from "./irReadingLabels"
import { readIRReaderTheme, writeIRReaderTheme } from "./irReaderThemeStorage"
import { shouldDismissIRMorePanel } from "./irMorePanelDismiss"

const { useEffect, useMemo, useRef, useState } = window.React
const { Button, ConfirmBox, ModalOverlay } = orca.components

export type IRSessionShellProps = {
  entries?: IRSessionEntry[]
  /** 兼容旧入口：仅阅读卡队列 */
  cards?: IRCard[]
  panelId: string
  pluginName?: string
  timeBudgetMinutes?: number
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
}

export default function IRSessionShell({
  entries: entriesProp,
  cards,
  panelId,
  pluginName = "orca-srs",
  timeBudgetMinutes = 20,
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
  onCloseHandlerChange
}: IRSessionShellProps) {
  const initialEntries = entriesProp ?? readingCardsToEntries(cards ?? [])
  const [queue, setQueue] = useState<IRSessionEntry[]>(initialEntries)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState<IRSessionProgress>(() => createSessionProgress(initialEntries.length))
  const [previewBlockId, setPreviewBlockId] = useState<DbId | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [postponeOpen, setPostponeOpen] = useState(false)
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
  /** 顺序解锁「完成本章」：询问下一章 today / tomorrow；取消不得推进 */
  const [completeChapterOpen, setCompleteChapterOpen] = useState(false)
  const [isSequentialActive, setIsSequentialActive] = useState(false)
  const themeStorageWarnedRef = useRef(false)
  /** 完成页展示的今日累计（或会话回退）指标 */
  const [summaryMetrics, setSummaryMetrics] = useState<IRSessionMetricsSnapshot | null>(null)
  const [summaryStorageWarning, setSummaryStorageWarning] = useState<string | null>(null)

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

  const sessionRootRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const currentCardContainerRef = useRef<HTMLDivElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const metricsRef = useRef(new IRSessionMetrics())
  const startedRef = useRef(false)
  const cardEnteredAtRef = useRef<number>(Date.now())
  /** 本 Shell 挂载的稳定会话 ID，完成时一次性 commit 去重 */
  const sessionIdRef = useRef(createIRSessionId())
  const sessionMetricsFinalizedRef = useRef(false)
  const dailyStatsSettledRef = useRef(false)
  const dailyStatsWarnedRef = useRef(false)

  const currentEntry = queue[currentIndex]
  const currentCard = currentEntry?.kind === "reading" ? currentEntry.card : undefined
  const isReviewEntry = currentEntry?.kind === "review"
  const isTopic = currentCard?.cardType === "topic"
  const nextEntry = queue[currentIndex + 1]
  const nextReadingBlockId = nextEntry?.kind === "reading"
    ? nextEntry.card.id
    : undefined

  const timer = useIRSessionTimer({
    budgetMinutes: timeBudgetMinutes,
    running: !showSummary && !loadFailed && queue.length > 0,
    onExpire: () => {
      // 时间盒到期：仅通知一次，不打断阅读（摘要页仅在队列读完时展示）
      orca.notify(
        "info",
        `本次专注阅读已达到 ${timeBudgetMinutes} 分钟，你可以继续阅读`,
        { title: "渐进阅读" }
      )
    }
  })

  const breakpoint = useIRReadingBreakpoint({
    cardId: currentCard?.id ?? null,
    panelId,
    containerRef: currentCardContainerRef,
    scrollContainerRef,
    previewContainerRef,
    previewBlockId,
    initialBreakpoint: currentCard?.readingBreakpoint ?? null,
    initialResumeBlockId: currentCard?.resumeBlockId ?? null,
    enabled: Boolean(currentCard) && !showSummary && !isReviewEntry,
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

  useEffect(() => {
    cardEnteredAtRef.current = Date.now()
  }, [currentEntry?.key])

  useEffect(() => {
    let cancelled = false
    const cardId = currentCard?.id
    if (cardId == null) {
      setIsSequentialActive(false)
      setCompleteChapterOpen(false)
      return
    }
    setIsSequentialActive(false)
    setCompleteChapterOpen(false)
    void isSequentialActiveChapter(cardId)
      .then((active) => {
        if (!cancelled) {
          setIsSequentialActive(active)
          if (!active) setCompleteChapterOpen(false)
        }
      })
      .catch((error) => {
        console.error("[IR Session] 检测顺序激活章失败:", error)
        if (!cancelled) setIsSequentialActive(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentCard?.id])

  const sessionSeed = entriesProp ?? cards
  useEffect(() => {
    const nextEntries = entriesProp ?? readingCardsToEntries(cards ?? [])
    setQueue(nextEntries)
    setCurrentIndex(0)
    setProgress(createSessionProgress(nextEntries.length))
    setShowSummary(false)
    setMoreOpen(false)
    setPostponeOpen(false)
    setViewMode("reading")
    setSummaryMetrics(null)
    setSummaryStorageWarning(null)
    sessionMetricsFinalizedRef.current = false
    dailyStatsSettledRef.current = false
    if (!startedRef.current && nextEntries.length > 0) {
      startedRef.current = true
      metricsRef.current.record("session.start", nextEntries.length)
    }
  }, [sessionSeed])

  /**
   * 完成页：结束指标只在 effect 中结算一次；有活动会话才 commit 日统计；
   * 初始空队列只读取今日累计，不写入全零会话。
   */
  useEffect(() => {
    if (loadFailed) return
    const isCompleteView = showSummary || queue.length === 0
    if (!isCompleteView) return
    if (dailyStatsSettledRef.current) return
    dailyStatsSettledRef.current = true

    const repo = resolveOrcaRepo()
    const hasSessionActivity = startedRef.current

    const finalizeSessionMetricsOnce = (): IRSessionMetricsSnapshot => {
      if (!sessionMetricsFinalizedRef.current) {
        sessionMetricsFinalizedRef.current = true
        const snap = metricsRef.current.getSnapshot()
        if (!snap.sessionStartedAt && progress.planned > 0) {
          metricsRef.current.record("session.start", progress.planned)
        }
        if (metricsRef.current.getSnapshot().sessionEndedAt == null) {
          metricsRef.current.record("session.end", progress.completed)
        }
      }
      return metricsRef.current.getSnapshot()
    }

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

    if (hasSessionActivity) {
      const sessionSnap = finalizeSessionMetricsOnce()
      const commitResult = commitIRSessionToDailyStats({
        sessionId: sessionIdRef.current,
        snapshot: sessionSnap,
        repo,
        pluginName
      })
      if (!commitResult.ok) {
        notifyStorageFailure(
          `今日统计保存失败，仍显示当前会话数据：${commitResult.error.message}`
        )
        setSummaryMetrics(sessionSnap)
        return
      }
      setSummaryMetrics(dailyTotalsToMetricsSnapshot(commitResult.record.totals))
      setSummaryStorageWarning(null)
      return
    }

    // 初始空队列：只读今日累计
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
  }, [loadFailed, showSummary, queue.length, progress.planned, progress.completed, pluginName])

  useEffect(() => {
    onQueueSnapshot?.({ queue, currentIndex })
  }, [queue, currentIndex, onQueueSnapshot])

  useEffect(() => {
    if (!currentCard) return
    const nextPreview = currentCard.readingBreakpoint?.previewBlockId
    setPreviewBlockId(nextPreview && nextPreview !== currentCard.id ? nextPreview : null)
  }, [currentCard?.id])

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        action?: string
        panelId?: string
        targetBlockId?: DbId
      } | undefined
      if (!detail?.action || showSummary || loadFailed) return
      if (detail.panelId !== panelId) return
      if (detail.action === "next") void handleNext()
      if (detail.action === "postpone") setPostponeOpen(true)
      if (detail.action === "priority") setMoreOpen(true)
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
          orca.notify("warn", "请先创建 Extract，再将精炼内容制成记忆卡片", { title: "渐进阅读" })
        } else {
          void handleItemize()
        }
      }
    }
    window.addEventListener("orca-srs:ir-session-action", onAction as EventListener)
    return () => window.removeEventListener("orca-srs:ir-session-action", onAction as EventListener)
  })

  const removeCurrent = (options?: { metric?: "action.review" }) => {
    if (options?.metric === "action.review") {
      metricsRef.current.record("action.review")
    }
    setQueue((prev: IRSessionEntry[]) => {
      const next = prev.filter((_: IRSessionEntry, idx: number) => idx !== currentIndex)
      const nextIndex = next.length === 0 ? 0 : Math.min(currentIndex, next.length - 1)
      setCurrentIndex(nextIndex)
      setProgress((p: IRSessionProgress) => syncSessionRemaining(markSessionItemCompleted(p), next.length))
      if (next.length === 0) setShowSummary(true)
      return next
    })
  }

  const withWork = async (fn: () => Promise<void>) => {
    if (isWorking) return
    setIsWorking(true)
    try {
      await fn()
    } finally {
      setIsWorking(false)
    }
  }

  const recordDwell = (card: IRCard) => {
    const dwellMs = Math.max(0, Date.now() - cardEnteredAtRef.current)
    recordDwellSample({
      cardType: card.cardType,
      isLong: !card.isNew && card.readCount > 1,
      dwellMs
    })
    return dwellMs
  }

  const handleNext = () => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      const dwellMs = recordDwell(currentCard)
      await performNext(currentCard.id)
      metricsRef.current.record("action.next", dwellMs, { cardType: currentCard.cardType })
      removeCurrent()
      orca.notify("success", "已进入下一篇", { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "next" })
      console.error("[IR Session] 下一篇失败:", error)
      orca.notify("error", "下一篇失败", { title: "渐进阅读" })
    }
  })

  const handlePostpone = (choice?: PostponeChoice) => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      recordDwell(currentCard)
      const days = choice ? postponeDaysForChoice(choice) : undefined
      const result = await performPostpone(currentCard.id, days)
      metricsRef.current.record("action.postpone")
      removeCurrent()
      setPostponeOpen(false)
      orca.notify("success", `已推后 ${result.days} 天`, { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "postpone" })
      console.error("[IR Session] 推后失败:", error)
      orca.notify("error", "推后失败", { title: "渐进阅读" })
    }
  })

  const handleExtract = () => withWork(async () => {
    if (!currentCard) return
    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection) as CursorData | null
    if (!cursor) {
      orca.notify("warn", "请先选择要摘录的文本", { title: "渐进阅读" })
      return
    }
    try {
      const result = await createExtract(cursor, pluginName)
      if (!result) {
        metricsRef.current.record("action.failure", undefined, { kind: "extract" })
        return
      }
      await breakpoint.flush()
      metricsRef.current.record("action.extract")
      orca.notify("success", "已创建摘录", { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "extract" })
      console.error("[IR Session] 摘录失败:", error)
      orca.notify("error", "摘录失败", { title: "渐进阅读" })
    }
  })

  const handleItemize = () => withWork(async () => {
    if (!currentCard || isTopic) return
    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection) as CursorData | null
    if (!cursor) {
      orca.notify("warn", "请先选择要记住的文本", { title: "渐进阅读" })
      return
    }
    if (cursor.rootBlockId !== currentCard.id) {
      orca.notify("warn", "请在当前 Extract 正文中选择要记住的文本", { title: "渐进阅读" })
      return
    }
    try {
      await breakpoint.flush()
      const result = await convertExtractToItem({
        extractId: currentCard.id,
        cursor,
        pluginName,
        strategy: "complete_extract"
      })
      if (!result.ok) {
        metricsRef.current.record("action.failure", undefined, { kind: "itemize" })
        orca.notify("error", `制卡失败（${result.step}）：${result.error}`, { title: "渐进阅读" })
        return
      }
      metricsRef.current.record("action.itemize")
      removeCurrent()
      orca.notify("success", "已创建记忆卡片", { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "itemize" })
      console.error("[IR Session] 制卡失败:", error)
      orca.notify("error", "制卡失败，Extract 已保留", { title: "渐进阅读" })
    }
  })

  const handleArchive = (options?: { nextChapterSchedule?: NextChapterSchedule }) => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      const outcome = await performArchive(currentCard.id, pluginName, options)
      metricsRef.current.record("action.archive")
      setCompleteChapterOpen(false)
      // Sequential partial may keep the current chapter live (strip/plan incomplete).
      // Only leave the session card when the service reports leftCard.
      if (outcome.leftCard) {
        removeCurrent()
      }
      // 顺序推进服务自身也会 notify 详细结果；此处仅对普通归档补一条成功提示
      if (!options?.nextChapterSchedule && !outcome.sequential) {
        orca.notify("success", "已归档", { title: "渐进阅读" })
      }
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "archive" })
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[IR Session] 归档/完成本章失败:", error)
      orca.notify("error", `归档失败：${msg}`, { title: "渐进阅读" })
    }
  })

  const handleSkipChapter = () => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      const outcome = await performSkipChapter(currentCard.id, pluginName)
      metricsRef.current.record("action.archive")
      if (outcome.leftCard) {
        removeCurrent()
      }
    } catch (error) {
      console.error("[IR Session] 跳过章节失败:", error)
      orca.notify("error", error instanceof Error ? error.message : "跳过章节失败", {
        title: "渐进阅读"
      })
    }
  })

  const handlePriorityTier = (tier: "low" | "medium" | "high") => withWork(async () => {
    if (!currentCard) return
    try {
      const next = await performPriorityAdjust(currentCard.id, tierToPriority(tier))
      setQueue((prev: IRSessionEntry[]) => prev.map((entry: IRSessionEntry, i: number) => {
        if (i !== currentIndex || entry.kind !== "reading") return entry
        return {
          ...entry,
          card: {
            ...entry.card,
            priority: next.priority,
            intervalDays: next.intervalDays,
            due: next.due,
            lastAction: next.lastAction
          }
        }
      }))
      orca.notify("success", `重要性已设为${tier === "high" ? "高" : tier === "medium" ? "中" : "低"}`, { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 调整重要性失败:", error)
      orca.notify("error", "调整重要性失败", { title: "渐进阅读" })
    }
  })

  const finishClose = () => {
    if (!sessionMetricsFinalizedRef.current && startedRef.current) {
      sessionMetricsFinalizedRef.current = true
      if (metricsRef.current.getSnapshot().sessionEndedAt == null) {
        metricsRef.current.record("session.end", progress.completed)
      }
    }
    if (onClose) onClose()
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
    enabled: !showSummary && !loadFailed && !isReviewEntry,
    panelId,
    sessionRootRef,
    handlers: {
      onNext: handleNext,
      onPostpone: () => setPostponeOpen(true),
      onPriority: () => setMoreOpen(true),
      onEscape: () => {
        setPostponeOpen(false)
        setMoreOpen(false)
      }
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

  const sourceLabel = useMemo(() => {
    if (!currentCard) return null
    return formatIRReadingSourceLabel(currentCard)
  }, [currentCard])

  if (loadFailed) {
    return (
      <div className="ir-reading__launch" role="alert">
        <div style={{ color: "var(--orca-color-danger-5)" }}>
          数据读取失败{loadErrorMessage ? `：${loadErrorMessage}` : ""}
        </div>
        <div className="ir-reading__launch-hint">这不是「暂无到期内容」。</div>
        {onRetryLoad ? <Button tabIndex={0} variant="solid" onClick={onRetryLoad}>重试</Button> : null}
        {embedded && onBackToLibrary ? (
          <Button tabIndex={0} variant="plain" onClick={onBackToLibrary}>返回资料库</Button>
        ) : null}
        {!embedded && onClose ? <Button tabIndex={0} variant="plain" onClick={onClose}>关闭</Button> : null}
      </div>
    )
  }

  if (showSummary || queue.length === 0) {
    // effect 结算前用会话快照占位；空队列无活动时为零，结算后为今日累计
    const displayMetrics = summaryMetrics ?? metricsRef.current.getSnapshot()
    return (
      <div className="ir-reading" data-ir-theme={theme}>
        <IRSessionSummary
          metrics={displayMetrics}
          autoPostponeCount={0}
          reviewCompleted={displayMetrics.reviewProcessed}
          storageWarning={summaryStorageWarning}
          onClose={embedded ? onBackToLibrary : () => void handleClose()}
          closeLabel={embedded ? "返回资料库" : "关闭"}
        />
      </div>
    )
  }

  if (!currentEntry) return null

  if (isReviewEntry && currentEntry.kind === "review") {
    return (
      <div ref={sessionRootRef} className="ir-reading ir-reading--mixed-review" data-ir-theme={theme}>
        <IRSessionHeader
          progress={progress}
          remainingTimeLabel={timer.formattedRemaining}
          autoPostponeLabel={autoPostponeLabel}
          sessionNotice={sessionNotice}
          onUndoAutoPostpone={onUndoAutoPostpone}
          onClose={embedded ? undefined : () => void handleClose()}
          onOpenQueue={onOpenQueue}
          compact={embedded}
        />
        <div className="ir-reading__scroll">
          <IRMixedReviewPane
            card={currentEntry.card}
            panelId={panelId}
            pluginName={pluginName}
            nextBlockId={nextReadingBlockId}
            onComplete={() => removeCurrent({ metric: "action.review" })}
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
      data-ir-theme={theme}
      onMouseUp={breakpoint.scheduleCapture}
      onKeyUp={breakpoint.scheduleCapture}
    >
      <IRSessionHeader
        progress={progress}
        remainingTimeLabel={timer.formattedRemaining}
        autoPostponeLabel={autoPostponeLabel}
        sessionNotice={sessionNotice}
        onUndoAutoPostpone={onUndoAutoPostpone}
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
          previewBlockId={previewBlockId}
          containerRef={currentCardContainerRef}
          previewContainerRef={previewContainerRef}
          onBreadcrumbClick={(id) => {
            const next = id === currentCard.id ? null : (previewBlockId === id ? null : id)
            setPreviewBlockId(next)
          }}
          sourceLabel={sourceLabel}
          viewMode={viewMode}
        />
      </div>

      <IRPostponeMenu
        open={postponeOpen}
        isWorking={isWorking}
        onChoose={(c) => void handlePostpone(c)}
        onClose={() => setPostponeOpen(false)}
      />

      {moreOpen ? (
        <div className="ir-reading__more" style={{ padding: "6px 12px" }}>
          <span style={{ fontSize: 12, color: "var(--orca-color-text-3)" }}>
            重要性（当前 {priorityToTier(currentCard.priority)}）
          </span>
          <Button tabIndex={0} variant="plain" onClick={() => void handlePriorityTier("low")}>低</Button>
          <Button tabIndex={0} variant="plain" onClick={() => void handlePriorityTier("medium")}>中</Button>
          <Button tabIndex={0} variant="plain" onClick={() => void handlePriorityTier("high")}>高</Button>
          <span style={{ fontSize: 12, color: "var(--orca-color-text-3)" }}>
            主题模式
          </span>
          <Button
            tabIndex={0}
            variant={theme === "mint" ? "solid" : "plain"}
            onClick={() => setTheme("mint")}
            style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0" }}
          >
            绿茶
          </Button>
          <Button
            tabIndex={0}
            variant={theme === "sepia" ? "solid" : "plain"}
            onClick={() => setTheme("sepia")}
            style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0" }}
          >
            书卷
          </Button>
          <Button
            tabIndex={0}
            variant={theme === "academic" ? "solid" : "plain"}
            onClick={() => setTheme("academic")}
            style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0" }}
          >
            文献
          </Button>
          <Button
            tabIndex={0}
            variant="plain"
            onClick={toggleViewMode}
            aria-label={viewMode === "reading" ? "编辑模式" : "阅读模式"}
            title={viewMode === "reading" ? "编辑模式" : "阅读模式"}
          >
            {viewMode === "reading" ? "编辑模式" : "阅读模式"}
          </Button>
          {isSequentialActive ? (
            <Button
              tabIndex={0}
              variant="plain"
              onClick={() => {
                if (isWorking) return
                setCompleteChapterOpen(true)
              }}
              style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              完成本章
            </Button>
          ) : (
            <ConfirmBox
              text="确认归档？将清除 IR 身份并保留正文。"
              onConfirm={async (_e: unknown, close: () => void) => {
                await handleArchive()
                close()
              }}
            >
              {(open) => (
                <Button tabIndex={0} variant="plain" onClick={open}>
                  {currentCard?.sourceBookId != null ? "完成本章" : "归档"}
                </Button>
              )}
            </ConfirmBox>
          )}
          {isSequentialActive ? (
            <ConfirmBox
              text="确认跳过本章并继续？与「完成」结果不同，但同样会解锁下一章并保留笔记。下一章默认安排到今天。"
              onConfirm={async (_e: unknown, close: () => void) => {
                await handleSkipChapter()
                close()
              }}
            >
              {(open) => (
                <Button tabIndex={0} variant="plain" onClick={open}>跳过本章并继续</Button>
              )}
            </ConfirmBox>
          ) : null}
          {embedded && onBackToLibrary ? (
            <Button tabIndex={0} variant="plain" onClick={onBackToLibrary}>返回资料库</Button>
          ) : null}
        </div>
      ) : null}

      <IRActionBar
        isTopic={isTopic}
        isWorking={isWorking}
        onNext={handleNext}
        onPostpone={() => setPostponeOpen(true)}
        onExtract={handleExtract}
        onItemize={handleItemize}
        onMore={() => setMoreOpen((v: boolean) => !v)}
        moreOpen={moreOpen}
      />

      {completeChapterOpen ? (
        <ModalOverlay
          visible={true}
          canClose={!isWorking}
          onClose={() => {
            if (isWorking) return
            setCompleteChapterOpen(false)
          }}
        >
          <div
            style={{
              minWidth: 320,
              maxWidth: 420,
              padding: "18px 20px",
              borderRadius: 12,
              background: "var(--orca-color-bg-1)",
              border: "1px solid var(--orca-color-border-1)",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--orca-color-text-1)" }}>
              完成本章
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
              当前章节将标记为<strong>已完成</strong>，并清除其 IR 身份（正文与笔记保留）。
              若还有下一章，请选择如何安排：
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
              <li><strong>今天安排下一章</strong>：下一章 due 为今天，立即进入今日 IR 队列。</li>
              <li><strong>明天安排下一章</strong>：下一章写入计划为当前激活章，但 due 从明天起，今日不作为到期卡。</li>
            </ul>
            <div style={{ fontSize: 12, color: "var(--orca-color-text-3)", lineHeight: 1.45 }}>
              取消不会清理当前章节，也不会解锁下一章。若无下一章，完成本章后书籍计划正常结束。
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  setCompleteChapterOpen(false)
                }}
                style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                取消
              </Button>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  void handleArchive({ nextChapterSchedule: "tomorrow" })
                }}
                style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                {isWorking ? "处理中…" : "明天安排下一章"}
              </Button>
              <Button
                tabIndex={0}
                variant="solid"
                onClick={() => {
                  if (isWorking) return
                  void handleArchive({ nextChapterSchedule: "today" })
                }}
                style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                {isWorking ? "处理中…" : "今天安排下一章"}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  )
}
