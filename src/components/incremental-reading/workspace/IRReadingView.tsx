/**
 * 专注阅读模式：时间盒启动 + 嵌入会话外壳
 */

import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import type { IRSessionEntry } from "../../../srs/incremental-reading/irMixedQueuePolicy"
import IRSessionShell from "../IRSessionShell"
import type { IRSessionLaunchMode } from "./irSessionLaunchMode"

const { useCallback, useState } = window.React

type Props = {
  workspaceId: string
  panelId: string
  pluginName: string
  sessionReady: boolean
  sessionLoading: boolean
  sessionEntries: IRSessionEntry[]
  timeBudgetMinutes: number
  todayReadingSummary: {
    total: number
    topics: number
    extracts: number
  }
  todayReadingSummaryLoading: boolean
  todayReadingSummaryAvailable: boolean
  collectResult: IRCollectResult | null
  autoPostponeLabel: string | null
  mixedDegradedNotice: string | null
  sessionGeneration: number
  onStartSession: (minutes: number, mode: IRSessionLaunchMode) => void
  onRetryLoad: () => void
  onUndoAutoPostpone: () => void
  onBackToLibrary: () => void
  onQueueSnapshot: (snapshot: { queue: IRSessionEntry[]; currentIndex: number }) => void
  onOpenQueue: () => void
  onClose: () => void
  onCloseHandlerChange?: (handler: (() => Promise<void>) | null) => void
}

export default function IRReadingView({
  workspaceId,
  panelId,
  pluginName,
  sessionReady,
  sessionLoading,
  sessionEntries,
  timeBudgetMinutes,
  todayReadingSummary,
  todayReadingSummaryLoading,
  todayReadingSummaryAvailable,
  collectResult,
  autoPostponeLabel,
  mixedDegradedNotice,
  sessionGeneration,
  onStartSession,
  onRetryLoad,
  onUndoAutoPostpone,
  onBackToLibrary,
  onQueueSnapshot,
  onOpenQueue,
  onClose,
  onCloseHandlerChange
}: Props) {
  /** 启动页本次模式；默认只读（保守，不替老用户自动开混合），不写回全局设置 */
  const [launchMode, setLaunchMode] = useState<IRSessionLaunchMode>("read-only")
  const [reviewStarting, setReviewStarting] = useState(false)

  const handleStartReviewSession = useCallback(async () => {
    if (reviewStarting) return
    setReviewStarting(true)
    try {
      const { startReviewSession } = await import("../../../main")
      await startReviewSession()
    } catch (error) {
      console.error("[IR Workspace] 启动独立复习会话失败:", error)
      const message = error instanceof Error ? error.message : String(error)
      orca.notify("error", `启动复习失败：${message}`, { title: "渐进阅读" })
    } finally {
      setReviewStarting(false)
    }
  }, [reviewStarting])

  if (sessionLoading) {
    return (
      <div
        id={`${workspaceId}-reading-panel`}
        className="ir-reading"
        role="tabpanel"
        aria-labelledby={`${workspaceId}-mode-reading`}
      >
        <div className="ir-reading__launch" role="status">加载阅读队列中…</div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div
        id={`${workspaceId}-reading-panel`}
        className="ir-reading"
        role="tabpanel"
        aria-labelledby={`${workspaceId}-mode-reading`}
      >
        <div className="ir-reading__launch">
          <div className="ir-reading__launch-title">开始专注阅读</div>
          <div className="ir-reading__launch-hint">选择本次会话模式与时间盒，系统将生成有限队列</div>

          <div className="ir-reading__today-summary" aria-live="polite">
            {todayReadingSummaryLoading ? (
              <div className="ir-reading__today-summary-loading">正在准备今天的阅读内容…</div>
            ) : !todayReadingSummaryAvailable ? (
              <>
                <div className="ir-reading__today-summary-main">暂时无法读取今日数量</div>
                <div className="ir-reading__today-summary-reassurance">仍然可以选择时间开始阅读</div>
              </>
            ) : todayReadingSummary.total === 0 ? (
              <>
                <div className="ir-reading__today-summary-main">今天没有需要优先阅读的卡片</div>
                <div className="ir-reading__today-summary-reassurance">也可以从资料库选择想读的内容</div>
              </>
            ) : (
              <>
                <div className="ir-reading__today-summary-main">
                  今天为你准备了 <strong>{todayReadingSummary.total}</strong> 张
                </div>
                <div className="ir-reading__today-summary-breakdown">
                  主题 {todayReadingSummary.topics} · 摘录 {todayReadingSummary.extracts}
                </div>
                <div className="ir-reading__today-summary-reassurance">按自己的节奏，读多少都可以</div>
              </>
            )}
          </div>

          <div className="ir-reading__launch-field">
            <div className="ir-reading__launch-label" id={`${workspaceId}-session-mode-label`}>
              本次模式
            </div>
            <div
              className="ir-session-mode"
              role="radiogroup"
              aria-labelledby={`${workspaceId}-session-mode-label`}
            >
              <button
                type="button"
                role="radio"
                className="ir-session-mode__btn"
                aria-checked={launchMode === "read-only"}
                onClick={() => setLaunchMode("read-only")}
              >
                只读
              </button>
              <button
                type="button"
                role="radio"
                className="ir-session-mode__btn"
                aria-checked={launchMode === "mixed"}
                onClick={() => setLaunchMode("mixed")}
              >
                混合
                <span className="ir-session-mode__badge">推荐</span>
              </button>
            </div>
          </div>

          <div className="ir-reading__launch-actions">
            {[10, 20, 30].map(mins => (
              <button
                type="button"
                key={mins}
                className={`ir-timebox-btn${mins === 20 ? " ir-timebox-btn--recommended" : ""}`}
                onClick={() => onStartSession(mins, launchMode)}
              >
                <span>{mins}</span>
                <small>分钟</small>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ir-text-btn ir-text-btn--command"
            disabled={reviewStarting}
            onClick={() => void handleStartReviewSession()}
          >
            <i className="ti ti-cards" aria-hidden="true" />
            {reviewStarting ? "正在打开复习…" : "去复习到期卡"}
          </button>

          <button type="button" className="ir-text-btn" onClick={onBackToLibrary}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
            返回资料库
          </button>
        </div>
      </div>
    )
  }

  const loadFailed = collectResult?.status === "error"

  return (
    <div
      id={`${workspaceId}-reading-panel`}
      className="ir-reading"
      role="tabpanel"
      aria-labelledby={`${workspaceId}-mode-reading`}
    >
      <IRSessionShell
        key={sessionGeneration}
        entries={sessionEntries}
        panelId={panelId}
        pluginName={pluginName}
        timeBudgetMinutes={timeBudgetMinutes}
        loadFailed={loadFailed}
        loadErrorMessage={collectResult?.errorMessage ?? null}
        onRetryLoad={onRetryLoad}
        autoPostponeLabel={autoPostponeLabel}
        sessionNotice={mixedDegradedNotice}
        onUndoAutoPostpone={onUndoAutoPostpone}
        embedded
        onBackToLibrary={onBackToLibrary}
        onQueueSnapshot={onQueueSnapshot}
        onOpenQueue={onOpenQueue}
        onClose={onClose}
        onCloseHandlerChange={onCloseHandlerChange}
      />
    </div>
  )
}
