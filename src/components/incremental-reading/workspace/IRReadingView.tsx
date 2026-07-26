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
  /** 会话启动 auto-postpone banner 文案（无推迟为 null） */
  autoPostponeLabel: string | null
  /** 撤销本次自动推迟（有可撤销批次时提供） */
  onUndoAutoPostpone?: () => void
  mixedDegradedNotice: string | null
  sessionGeneration: number
  onStartSession: (minutes: number, mode: IRSessionLaunchMode) => void
  onRetryLoad: () => void
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
  onUndoAutoPostpone,
  mixedDegradedNotice,
  sessionGeneration,
  onStartSession,
  onRetryLoad,
  onBackToLibrary,
  onQueueSnapshot,
  onOpenQueue,
  onClose,
  onCloseHandlerChange
}: Props) {
  /** 今日学习入口默认混合；启动页不再暴露只读/混合选择 */
  const [reviewStarting, setReviewStarting] = useState(false)
  const [startingMinutes, setStartingMinutes] = useState<number | null>(null)

  const handleStartWithMinutes = useCallback(
    async (mins: number) => {
      if (startingMinutes != null) return
      setStartingMinutes(mins)
      try {
        const {
          writeIrTodayLearningResume,
          reportTodayLearningResumeWriteFailure
        } = await import(
          "../../../srs/todayLearning/todayLearningResumeStorage"
        )
        const writeResult = await writeIrTodayLearningResume({
          pluginName,
          timeBudgetMinutes: mins
        })
        if (!writeResult.ok) {
          reportTodayLearningResumeWriteFailure(pluginName, writeResult.error)
        }
        onStartSession(mins, "mixed")
      } catch (error) {
        console.error("[IR Workspace] 启动阅读会话失败:", error)
        const message = error instanceof Error ? error.message : String(error)
        orca.notify("error", `启动失败：${message}`, { title: "今日学习" })
        setStartingMinutes(null)
      }
    },
    [onStartSession, pluginName, startingMinutes]
  )

  const handleStartReviewSession = useCallback(async () => {
    if (reviewStarting) return
    setReviewStarting(true)
    try {
      const { startReviewSession } = await import("../../../main")
      await startReviewSession()
    } catch (error) {
      console.error("[IR Workspace] 启动独立复习会话失败:", error)
      const message = error instanceof Error ? error.message : String(error)
      orca.notify("error", `启动复习失败：${message}`, { title: "今日学习" })
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
        <div className="ir-reading__launch" role="status">加载学习队列中…</div>
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
          <div className="ir-reading__launch-title">开始今日学习</div>
          <div className="ir-reading__launch-hint">
            选择时间盒即可开始（默认阅读 + 记忆卡混合）
          </div>

          <div className="ir-reading__today-summary" aria-live="polite">
            {todayReadingSummaryLoading ? (
              <div className="ir-reading__today-summary-loading">正在准备今天的学习内容…</div>
            ) : !todayReadingSummaryAvailable ? (
              <>
                <div className="ir-reading__today-summary-main">暂时无法读取今日数量</div>
                <div className="ir-reading__today-summary-reassurance">仍然可以选择时间开始</div>
              </>
            ) : todayReadingSummary.total === 0 ? (
              <>
                <div className="ir-reading__today-summary-main">今天没有需要优先阅读的材料</div>
                <div className="ir-reading__today-summary-reassurance">也可以从资料库选择，或去复习记忆卡</div>
              </>
            ) : (
              <>
                <div className="ir-reading__today-summary-main">
                  今天为你准备了 <strong>{todayReadingSummary.total}</strong> 份阅读材料
                </div>
                <div className="ir-reading__today-summary-breakdown">
                  主题 {todayReadingSummary.topics} · 摘录 {todayReadingSummary.extracts}
                </div>
                <div className="ir-reading__today-summary-reassurance">按自己的节奏，学多少都可以</div>
              </>
            )}
          </div>

          <div className="ir-reading__launch-actions">
            {[10, 20, 30].map(mins => (
              <button
                type="button"
                key={mins}
                className={`ir-timebox-btn${mins === 20 ? " ir-timebox-btn--recommended" : ""}`}
                disabled={startingMinutes != null}
                onClick={() => void handleStartWithMinutes(mins)}
              >
                <span>{startingMinutes === mins ? "…" : mins}</span>
                <small>分钟</small>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ir-text-btn ir-text-btn--command"
            disabled={reviewStarting || startingMinutes != null}
            onClick={() => void handleStartReviewSession()}
          >
            <i className="ti ti-cards" aria-hidden="true" />
            {reviewStarting ? "正在打开复习…" : "只复习记忆卡"}
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
        onUndoAutoPostpone={onUndoAutoPostpone}
        sessionNotice={mixedDegradedNotice}
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
