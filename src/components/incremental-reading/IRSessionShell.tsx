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
  loadIRDailyStats,
  resolveOrcaRepo
} from "../../srs/incremental-reading/irDailyStatsStorage"
import {
  createSessionProgress,
  markSessionItemCompleted,
  syncSessionRemaining
} from "../../srs/incremental-reading/irSessionProgress"
import { loadSequentialSessionMeta } from "../../srs/incremental-reading/irSequentialSessionMeta"
import { resolveSessionItemizeIntercept } from "../../srs/incremental-reading/irSessionActionsLogic"
import type { IRSessionProgress } from "../../srs/incremental-reading/irTypes"
import {
  readingCardsToEntries,
  type IRSessionEntry
} from "../../srs/incremental-reading/irMixedQueuePolicy"
import { useIRReadingBreakpoint } from "../../hooks/useIRReadingBreakpoint"
import { useIRShortcuts } from "../../hooks/useIRShortcuts"
import { useIRSessionTimer } from "../../hooks/useIRSessionTimer"
import IRMixedReviewPane from "./IRMixedReviewPane"
import IRReadingPane from "./IRReadingPane"
import IRSessionHeader from "./IRSessionHeader"
import IRSessionSummary from "./IRSessionSummary"
import IRSessionChrome from "./IRSessionChrome"
import { createIRSessionCardActions } from "./useIRSessionCardActions"
import { useIRReadingContext } from "./useIRReadingContext"
import { formatIRReadingSourceLabel } from "./irReadingLabels"
import { readIRReaderTheme, writeIRReaderTheme } from "./irReaderThemeStorage"
import {
  shouldDismissIRImportancePanel,
  shouldDismissIRMorePanel
} from "./irMorePanelDismiss"

const { useEffect, useMemo, useRef, useState } = window.React
const { Button } = orca.components

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
  /** 顺序解锁「完成本章」：询问下一章 today / tomorrow；取消不得推进 */
  const [completeChapterOpen, setCompleteChapterOpen] = useState(false)
  /** 非顺序 / 摘录「完成」确认 */
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [isSequentialActive, setIsSequentialActive] = useState(false)
  const [sequentialHasNext, setSequentialHasNext] = useState(true)
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

  const readingContext = useIRReadingContext(currentCard)

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
    previewBlockId: readingContext.breakpointPreviewId,
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
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        action?: string
        panelId?: string
        targetBlockId?: DbId
      } | undefined
      if (!detail?.action || showSummary || loadFailed) return
      if (detail.panelId !== panelId) return
      if (detail.action === "next") void handleNext()
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

  const {
    handleNext,
    handlePostpone,
    handleExtract,
    handleItemize,
    handleArchive,
    handleCompleteRequest,
    handleSkipChapter,
    handleImportanceNudge
  } = createIRSessionCardActions({
    currentCard,
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
    removeCurrent
  })

  const openImportanceMenu = () => {
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
    setPostponeOpen(true)
    setMoreOpen(false)
    setImportanceOpen(false)
  }

  const toggleMorePanel = () => {
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
      onPostpone: openPostponeMenu,
      onPriority: openImportanceMenu,
      onEscape: () => {
        setPostponeOpen(false)
        setMoreOpen(false)
        setImportanceOpen(false)
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
        />
      </div>

      <IRSessionChrome
        isTopic={isTopic}
        isWorking={isWorking}
        isSequentialActive={isSequentialActive}
        sequentialHasNext={sequentialHasNext}
        priority={currentCard.priority}
        theme={theme}
        viewMode={viewMode}
        embedded={embedded}
        postponeOpen={postponeOpen}
        importanceOpen={importanceOpen}
        moreOpen={moreOpen}
        completeChapterOpen={completeChapterOpen}
        archiveConfirmOpen={archiveConfirmOpen}
        showReturn={readingContext.showReturn}
        onNext={handleNext}
        onExtract={handleExtract}
        onItemize={handleItemize}
        onComplete={handleCompleteRequest}
        onImportance={openImportanceMenu}
        onMore={toggleMorePanel}
        onReturn={readingContext.onReturnFromBrowse}
        onPostponeChoose={handlePostpone}
        onPostponeClose={() => setPostponeOpen(false)}
        onImportanceChoose={handleImportanceNudge}
        onImportanceClose={() => setImportanceOpen(false)}
        onOpenPostpone={openPostponeMenu}
        onThemeChange={setTheme}
        onToggleViewMode={toggleViewMode}
        onBackToLibrary={onBackToLibrary}
        onCompleteChapterClose={() => setCompleteChapterOpen(false)}
        onCompleteChapterToday={() => void handleArchive({ nextChapterSchedule: "today" })}
        onCompleteChapterTomorrow={() => void handleArchive({ nextChapterSchedule: "tomorrow" })}
        onArchiveConfirmClose={() => setArchiveConfirmOpen(false)}
        onArchiveConfirm={() => void handleArchive()}
      />
    </div>
  )
}
