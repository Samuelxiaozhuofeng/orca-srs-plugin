/**
 * 今日学习模式：一键开始 + 嵌入会话外壳
 *
 * 无时间盒：队列长度由各自的每日上限决定，用户想停随时可停（关闭 / 返回资料库）。
 */

import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import type { IRSessionEntry } from "../../../srs/incremental-reading/irMixedQueuePolicy"
import { getCollectPartialNotice } from "../../../srs/incremental-reading/irCollectResult"
import IRSessionShell from "../IRSessionShell"
import type { IRSessionLaunchMode } from "./irSessionLaunchMode"

const { useCallback, useState } = window.React
const { Button } = orca.components

type Props = {
  workspaceId: string
  panelId: string
  pluginName: string
  sessionReady: boolean
  sessionLoading: boolean
  sessionEntries: IRSessionEntry[]
  collectResult: IRCollectResult | null
  /** 会话启动 auto-postpone banner 文案（无推迟为 null） */
  autoPostponeLabel: string | null
  /** 撤销本次自动推迟（有可撤销批次时提供） */
  onUndoAutoPostpone?: () => void
  mixedDegradedNotice: string | null
  sessionGeneration: number
  onStartSession: (mode: IRSessionLaunchMode) => void
  /** 完成页「再学一轮」：沿用本次会话已记录的模式，不得强制改成 mixed */
  onContinueSession: () => void
  onRetryLoad: () => void
  onBackToLibrary: () => void
  onQueueSnapshot: (snapshot: { queue: IRSessionEntry[]; currentIndex: number }) => void
  onOpenQueue: () => void
  onClose: () => void
  onCloseHandlerChange?: (handler: (() => Promise<void>) | null) => void
  /** 工作区前台为阅读时 true；资料库隐藏挂载时 false，用于活跃计时 */
  sessionActive?: boolean
}

export default function IRReadingView({
  workspaceId,
  panelId,
  pluginName,
  sessionReady,
  sessionLoading,
  sessionEntries,
  collectResult,
  autoPostponeLabel,
  onUndoAutoPostpone,
  mixedDegradedNotice,
  sessionGeneration,
  onStartSession,
  onContinueSession,
  onRetryLoad,
  onBackToLibrary,
  onQueueSnapshot,
  onOpenQueue,
  onClose,
  onCloseHandlerChange,
  sessionActive = true
}: Props) {
  /** 今日学习入口默认混合；启动页不再暴露只读/混合与时长选择 */
  const [reviewStarting, setReviewStarting] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleStart = useCallback(async () => {
    if (starting) return
    setStarting(true)
    try {
      // 不预写 resume；队列装配成功且非空后再写（见 useIRWorkspaceSession）
      onStartSession("mixed")
    } catch (error) {
      console.error("[IR Workspace] 启动学习会话失败:", error)
      const message = error instanceof Error ? error.message : String(error)
      orca.notify("error", `启动失败：${message}`, { title: "今日学习" })
      setStarting(false)
    }
  }, [onStartSession, starting])

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
            阅读材料与记忆卡会在同一个会话里交错出现，学多少都算数，随时可以停
          </div>

          <div className="ir-reading__launch-actions">
            <button
              type="button"
              className="ir-start-btn"
              disabled={starting}
              onClick={() => void handleStart()}
            >
              <i className="ti ti-player-play" aria-hidden="true" />
              {starting ? "正在准备…" : "开始学习"}
            </button>
          </div>

          <button
            type="button"
            className="ir-text-btn ir-text-btn--command"
            disabled={reviewStarting || starting}
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
  const partialNotice = getCollectPartialNotice(collectResult)

  return (
    <div
      id={`${workspaceId}-reading-panel`}
      className="ir-reading"
      role="tabpanel"
      aria-labelledby={`${workspaceId}-mode-reading`}
    >
      {partialNotice && !loadFailed ? (
        <div
          className="ir-reading__banner ir-reading__banner--partial"
          role="status"
          data-ir-collect-partial="true"
        >
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <span>{partialNotice.message}</span>
          <Button tabIndex={0} variant="plain" onClick={onRetryLoad}>
            重新加载
          </Button>
        </div>
      ) : null}
      <IRSessionShell
        key={sessionGeneration}
        entries={sessionEntries}
        panelId={panelId}
        pluginName={pluginName}
        loadFailed={loadFailed}
        loadErrorMessage={collectResult?.errorMessage ?? null}
        onRetryLoad={onRetryLoad}
        autoPostponeLabel={autoPostponeLabel}
        onUndoAutoPostpone={onUndoAutoPostpone}
        sessionNotice={mixedDegradedNotice}
        embedded
        sessionActive={sessionActive}
        onBackToLibrary={onBackToLibrary}
        onQueueSnapshot={onQueueSnapshot}
        onOpenQueue={onOpenQueue}
        onClose={onClose}
        onCloseHandlerChange={onCloseHandlerChange}
        onContinueSession={onContinueSession}
      />
    </div>
  )
}
