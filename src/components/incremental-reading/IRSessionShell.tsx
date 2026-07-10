/**
 * 渐进阅读会话外壳：生命周期、布局、快捷键、断点与主动作
 */

import type { CursorData, DbId } from "../../orca.d.ts"
import type { IRCard } from "../../srs/incrementalReadingCollector"
import { createExtract } from "../../srs/extractUtils"
import { convertExtractToItem } from "../../srs/incremental-reading/irConversionService"
import { IRSessionMetrics } from "../../srs/incremental-reading/irMetrics"
import {
  createSessionProgress,
  markSessionItemCompleted,
  syncSessionRemaining
} from "../../srs/incremental-reading/irSessionProgress"
import {
  performArchive,
  performNext,
  performPostpone,
  performPriorityAdjust
} from "../../srs/incremental-reading/irSessionService"
import { postponeDaysForChoice } from "../../srs/incrementalReadingStorage"
import { tierToPriority, priorityToTier } from "../../srs/incremental-reading/irQueuePolicy"
import { recordDwellSample } from "../../srs/incremental-reading/irCostCalibration"
import type { IRSessionProgress } from "../../srs/incremental-reading/irTypes"
import { useIRReadingBreakpoint } from "../../hooks/useIRReadingBreakpoint"
import { useIRShortcuts } from "../../hooks/useIRShortcuts"
import { useIRSessionTimer } from "../../hooks/useIRSessionTimer"
import IRActionBar from "./IRActionBar"
import IRPostponeMenu, { type PostponeChoice } from "./IRPostponeMenu"
import IRReadingPane from "./IRReadingPane"
import IRSelectionToolbar from "./IRSelectionToolbar"
import IRSessionHeader from "./IRSessionHeader"
import IRSessionSummary from "./IRSessionSummary"

const { useEffect, useMemo, useRef, useState } = window.React
const { Button, ConfirmBox } = orca.components

export type IRSessionShellProps = {
  cards: IRCard[]
  panelId: string
  pluginName?: string
  timeBudgetMinutes?: number
  loadFailed?: boolean
  loadErrorMessage?: string | null
  onRetryLoad?: () => void
  autoPostponeLabel?: string | null
  onUndoAutoPostpone?: () => void
  onClose?: () => void
}

export default function IRSessionShell({
  cards,
  panelId,
  pluginName = "orca-srs",
  timeBudgetMinutes = 20,
  loadFailed = false,
  loadErrorMessage = null,
  onRetryLoad,
  autoPostponeLabel = null,
  onUndoAutoPostpone,
  onClose
}: IRSessionShellProps) {
  const [queue, setQueue] = useState<IRCard[]>(cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState<IRSessionProgress>(() => createSessionProgress(cards.length))
  const [previewBlockId, setPreviewBlockId] = useState<DbId | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [postponeOpen, setPostponeOpen] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [selectionActive, setSelectionActive] = useState(false)
  const [breakpointError, setBreakpointError] = useState<string | null>(null)

  const sessionRootRef = useRef<HTMLDivElement | null>(null)
  const currentCardContainerRef = useRef<HTMLDivElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const metricsRef = useRef(new IRSessionMetrics())
  const startedRef = useRef(false)
  const cardEnteredAtRef = useRef<number>(Date.now())

  const currentCard = queue[currentIndex]
  const isTopic = currentCard?.cardType === "topic"

  const timer = useIRSessionTimer({
    budgetMinutes: timeBudgetMinutes,
    running: !showSummary && !loadFailed && queue.length > 0,
    onExpire: () => setShowSummary(true)
  })

  const breakpoint = useIRReadingBreakpoint({
    cardId: currentCard?.id ?? null,
    panelId,
    containerRef: currentCardContainerRef,
    previewContainerRef,
    previewBlockId,
    initialBreakpoint: currentCard?.readingBreakpoint ?? null,
    initialResumeBlockId: currentCard?.resumeBlockId ?? null,
    enabled: Boolean(currentCard) && !showSummary,
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
  }, [currentCard?.id])

  useEffect(() => {
    setQueue(cards)
    setCurrentIndex(0)
    setProgress(createSessionProgress(cards.length))
    if (!startedRef.current && cards.length > 0) {
      startedRef.current = true
      metricsRef.current.record("session.start", cards.length)
    }
  }, [cards])

  useEffect(() => {
    if (!currentCard) return
    const nextPreview = currentCard.readingBreakpoint?.previewBlockId
    setPreviewBlockId(nextPreview && nextPreview !== currentCard.id ? nextPreview : null)
  }, [currentCard?.id])

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection()
      setSelectionActive(Boolean(sel && !sel.isCollapsed && sel.toString().trim()))
    }
    document.addEventListener("selectionchange", onSel)
    return () => document.removeEventListener("selectionchange", onSel)
  }, [])

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent).detail as { action?: string; panelId?: string } | undefined
      if (!detail?.action || showSummary || loadFailed) return
      // 多面板隔离：无 panelId 时忽略（避免全局误触）
      if (detail.panelId !== panelId) return
      if (detail.action === "next") void handleNext()
      if (detail.action === "postpone") setPostponeOpen(true)
      if (detail.action === "priority") setMoreOpen(true)
      if (detail.action === "itemize") {
        event.preventDefault()
        if (isTopic) {
          orca.notify("warn", "请先创建 Extract，再将精炼内容制成记忆卡片", { title: "渐进阅读" })
        } else {
          void handleItemize()
        }
      }
    }
    window.addEventListener("orca-srs:ir-session-action", onAction as EventListener)
    return () => window.removeEventListener("orca-srs:ir-session-action", onAction as EventListener)
  })

  const removeCurrent = () => {
    setQueue((prev: IRCard[]) => {
      const next = prev.filter((_: IRCard, idx: number) => idx !== currentIndex)
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
      // 转化成功会移除 IR 调度字段，因此必须先把最后断点写完。
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

  const handleArchive = () => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      await performArchive(currentCard.id, pluginName)
      metricsRef.current.record("action.archive")
      removeCurrent()
      orca.notify("success", "已归档", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 归档失败:", error)
      orca.notify("error", "归档失败", { title: "渐进阅读" })
    }
  })

  const handlePriorityTier = (tier: "low" | "medium" | "high") => withWork(async () => {
    if (!currentCard) return
    try {
      const next = await performPriorityAdjust(currentCard.id, tierToPriority(tier))
      setQueue((prev: IRCard[]) => prev.map((c: IRCard, i: number) => i === currentIndex ? {
        ...c,
        priority: next.priority,
        intervalDays: next.intervalDays,
        due: next.due,
        lastAction: next.lastAction
      } : c))
      orca.notify("success", `重要性已设为${tier === "high" ? "高" : tier === "medium" ? "中" : "低"}`, { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 调整重要性失败:", error)
      orca.notify("error", "调整重要性失败", { title: "渐进阅读" })
    }
  })

  const finishClose = () => {
    metricsRef.current.record("session.end", progress.completed)
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

  useIRShortcuts({
    enabled: !showSummary && !loadFailed,
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

  const sourceLabel = useMemo(() => {
    if (!currentCard) return null
    const parts = [
      currentCard.sourceBookTitle,
      currentCard.cardType === "extracts" ? "Extract" : "Topic"
    ].filter(Boolean)
    return parts.join(" · ")
  }, [currentCard])

  if (loadFailed) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--orca-color-danger-5)" }}>
          数据读取失败{loadErrorMessage ? `：${loadErrorMessage}` : ""}
        </div>
        <div style={{ fontSize: 12, color: "var(--orca-color-text-3)" }}>
          这不是“暂无到期内容”。
        </div>
        {onRetryLoad ? <Button variant="solid" onClick={onRetryLoad}>重试</Button> : null}
        {onClose ? <Button variant="plain" onClick={onClose}>关闭</Button> : null}
      </div>
    )
  }

  if (showSummary || queue.length === 0) {
    const snap = metricsRef.current.getSnapshot()
    if (!snap.sessionStartedAt && progress.planned > 0) {
      metricsRef.current.record("session.start", progress.planned)
    }
    metricsRef.current.record("session.end", progress.completed)
    return (
      <IRSessionSummary
        metrics={metricsRef.current.getSnapshot()}
        autoPostponeCount={0}
        onClose={handleClose}
      />
    )
  }

  if (!currentCard) return null

  return (
    <div
      ref={sessionRootRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        height: "100%",
        overflow: "auto"
      }}
      onMouseUp={breakpoint.scheduleCapture}
      onKeyUp={breakpoint.scheduleCapture}
    >
      <IRSessionHeader
        progress={progress}
        remainingTimeLabel={timer.formattedRemaining}
        autoPostponeLabel={autoPostponeLabel}
        onUndoAutoPostpone={onUndoAutoPostpone}
        onClose={handleClose}
      />

      {breakpointError ? (
        <div style={{ color: "var(--orca-color-danger-5)", fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>断点保存失败：{breakpointError}</span>
          <Button variant="plain" onClick={() => void breakpoint.flush().then(() => setBreakpointError(null)).catch(() => undefined)}>
            重试保存
          </Button>
          <Button variant="outline" onClick={() => void handleClose(true)}>
            强制关闭
          </Button>
        </div>
      ) : null}

      <IRSelectionToolbar
        visible={selectionActive}
        isTopic={isTopic}
        isWorking={isWorking}
        onExtract={handleExtract}
        onCloze={handleItemize}
      />

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
      />

      <IRPostponeMenu
        open={postponeOpen}
        isWorking={isWorking}
        onChoose={(c) => void handlePostpone(c)}
        onClose={() => setPostponeOpen(false)}
      />

      {moreOpen ? (
        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: 8,
          border: "1px solid var(--orca-color-border-1)",
          borderRadius: 8,
          background: "var(--orca-color-bg-2)"
        }}>
          <span style={{ fontSize: 12, color: "var(--orca-color-text-3)", alignSelf: "center" }}>
            重要性（当前 {priorityToTier(currentCard.priority)}）
          </span>
          <Button variant="plain" onClick={() => void handlePriorityTier("low")}>低</Button>
          <Button variant="plain" onClick={() => void handlePriorityTier("medium")}>中</Button>
          <Button variant="plain" onClick={() => void handlePriorityTier("high")}>高</Button>
          <ConfirmBox
            text="确认归档？将清除 IR 身份并保留正文。"
            onConfirm={async (_e, close) => {
              await handleArchive()
              close()
            }}
          >
            {(open) => (
              <Button variant="plain" onClick={open}>归档</Button>
            )}
          </ConfirmBox>
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
    </div>
  )
}
