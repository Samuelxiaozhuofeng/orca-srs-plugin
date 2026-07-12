/**
 * 专注阅读模式：时间盒启动 + 嵌入会话外壳
 */

import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import type { IRSessionEntry } from "../../../srs/incremental-reading/irMixedQueuePolicy"
import IRSessionShell from "../IRSessionShell"

type Props = {
  workspaceId: string
  panelId: string
  pluginName: string
  sessionReady: boolean
  sessionLoading: boolean
  sessionEntries: IRSessionEntry[]
  timeBudgetMinutes: number
  collectResult: IRCollectResult | null
  autoPostponeLabel: string | null
  sessionGeneration: number
  onStartSession: (minutes: number) => void
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
  collectResult,
  autoPostponeLabel,
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
          <div className="ir-reading__launch-hint">选择本次时间盒，系统将生成有限队列</div>
          <div className="ir-reading__launch-actions">
            {[10, 20, 30].map(mins => (
              <button
                type="button"
                key={mins}
                className={`ir-timebox-btn${mins === 20 ? " ir-timebox-btn--recommended" : ""}`}
                onClick={() => onStartSession(mins)}
              >
                <span>{mins}</span>
                <small>分钟</small>
              </button>
            ))}
          </div>
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
