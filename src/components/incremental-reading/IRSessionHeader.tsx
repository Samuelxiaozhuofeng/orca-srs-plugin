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
  onUndoAutoPostpone?: () => void
  onClose?: () => void
  onOpenQueue?: () => void
  compact?: boolean
}

export default function IRSessionHeader({
  progress,
  remainingTimeLabel,
  autoPostponeLabel,
  onUndoAutoPostpone,
  onClose,
  onOpenQueue,
  compact = false
}: Props) {
  return (
    <div className="ir-reading__banner ir-reading__banner--info">
      <span>
        已完成 {formatSessionProgress(progress)}
        <span style={{ marginLeft: 8, color: "var(--orca-color-text-3)" }}>
          剩余 {progress.remaining}
        </span>
        {remainingTimeLabel ? (
          <span style={{ marginLeft: 12 }}>
            <i className="ti ti-clock" aria-hidden="true" /> {remainingTimeLabel}
          </span>
        ) : null}
      </span>
      <span style={{ flex: 1 }} />
      {autoPostponeLabel ? (
        <>
          <span style={{ fontSize: 12, color: "var(--orca-color-text-3)" }}>
            {autoPostponeLabel}
          </span>
          {onUndoAutoPostpone ? (
            <Button variant="plain" onClick={onUndoAutoPostpone}>
              撤销
            </Button>
          ) : null}
        </>
      ) : null}
      {onOpenQueue ? (
        <Button variant="plain" onClick={onOpenQueue} title="查看队列">
          队列
        </Button>
      ) : null}
      {!compact && onClose ? (
        <Button variant="plain" onClick={onClose}>
          关闭
        </Button>
      ) : null}
    </div>
  )
}
