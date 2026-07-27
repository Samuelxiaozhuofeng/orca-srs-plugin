/**
 * 会话状态条：进度、剩余时间、自动顺延
 */

import { formatSessionProgress } from "../../srs/incremental-reading/irSessionProgress"
import type { IRSessionProgress } from "../../srs/incremental-reading/irTypes"

const { Button } = orca.components

type Props = {
  progress: IRSessionProgress
  remainingTimeLabel?: string | null
  autoPostponeLabel?: string | null
  /** 事实型会话提示（如混合退化为纯阅读） */
  sessionNotice?: string | null
  onUndoAutoPostpone?: () => void
  /** 会话内「撤销上一篇」：仅在刚执行过下一篇且此后无写库动作时出现 */
  onUndoNext?: () => void
  onClose?: () => void
  onOpenQueue?: () => void
  compact?: boolean
}

export default function IRSessionHeader({
  progress,
  remainingTimeLabel,
  autoPostponeLabel,
  sessionNotice = null,
  onUndoAutoPostpone,
  onUndoNext,
  onClose,
  onOpenQueue,
  compact = false
}: Props) {
  return (
    <>
      <div className="ir-reading__banner ir-reading__banner--info">
        <span className="ir-session-header__progress">
          已完成 {formatSessionProgress(progress)}
          <span className="ir-session-header__remaining">
            剩余 {progress.remaining}
          </span>
          {remainingTimeLabel ? (
            <span className="ir-session-header__eta">
              <i className="ti ti-clock" aria-hidden="true" /> {remainingTimeLabel}
            </span>
          ) : null}
        </span>
        <span className="ir-session-header__spacer" />
        {autoPostponeLabel ? (
          <>
            <span className="ir-session-header__note">
              {autoPostponeLabel}
            </span>
            {onUndoAutoPostpone ? (
              <Button tabIndex={0} variant="plain" onClick={onUndoAutoPostpone}>
                撤销
              </Button>
            ) : null}
          </>
        ) : null}
        {onUndoNext ? (
          <Button
            tabIndex={0}
            variant="outline"
            onClick={onUndoNext}
            title="回到刚才那篇并恢复阅读位置（Alt+U）"
          >
            撤销上一篇
          </Button>
        ) : null}
        {onOpenQueue ? (
          <Button tabIndex={0} variant="plain" onClick={onOpenQueue} title="查看队列">
            队列
          </Button>
        ) : null}
        {!compact && onClose ? (
          <Button tabIndex={0} variant="plain" onClick={onClose}>
            关闭
          </Button>
        ) : null}
      </div>
      {sessionNotice ? (
        <div className="ir-reading__banner ir-reading__banner--notice" role="status">
          <i className="ti ti-info-circle" aria-hidden="true" />
          <span>{sessionNotice}</span>
        </div>
      ) : null}
    </>
  )
}
