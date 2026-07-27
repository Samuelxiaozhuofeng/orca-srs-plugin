/**
 * 会话状态条：进度、剩余时间、自动顺延
 */

import { formatSessionProgress } from "../../srs/incremental-reading/irSessionProgress"
import type { IRSessionProgress } from "../../srs/incremental-reading/irTypes"

const { Button } = orca.components

type Props = {
  progress: IRSessionProgress
  /** 已投入时长（只陈述，不是倒计时） */
  elapsedTimeLabel?: string | null
  autoPostponeLabel?: string | null
  /** 事实型会话提示（如混合退化为纯阅读） */
  sessionNotice?: string | null
  onUndoAutoPostpone?: () => void
  /** 会话内「撤销上一篇」：仅在刚执行过下一篇且此后无写库动作时出现 */
  onUndoNext?: () => void
  onClose?: () => void
  onOpenQueue?: () => void
  compact?: boolean
  /** mixed 复习卡：中性进度条样式，弱化阅读横幅感 */
  reviewFocus?: boolean
}

export default function IRSessionHeader({
  progress,
  elapsedTimeLabel,
  autoPostponeLabel,
  sessionNotice = null,
  onUndoAutoPostpone,
  onUndoNext,
  onClose,
  onOpenQueue,
  compact = false,
  reviewFocus = false
}: Props) {
  return (
    <>
      <div
        className={
          reviewFocus
            ? "ir-reading__banner ir-reading__banner--review-focus"
            : "ir-reading__banner ir-reading__banner--info"
        }
      >
        <span className="ir-session-header__progress">
          已完成 {formatSessionProgress(progress)}
          <span className="ir-session-header__remaining">
            剩余 {progress.remaining}
          </span>
          {elapsedTimeLabel ? (
            <span className="ir-session-header__eta" title="本次已投入时长">
              <i className="ti ti-clock" aria-hidden="true" /> {elapsedTimeLabel}
            </span>
          ) : null}
        </span>
        <span className="ir-session-header__spacer" />
        {autoPostponeLabel && !reviewFocus ? (
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
        {onUndoNext && !reviewFocus ? (
          <Button
            tabIndex={0}
            variant="outline"
            onClick={onUndoNext}
            title="回到刚才那篇并恢复阅读位置（Alt+U；或点右下角「下一篇」成功通知）"
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
