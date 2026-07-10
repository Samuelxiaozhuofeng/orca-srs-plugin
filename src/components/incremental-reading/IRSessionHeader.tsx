/**
 * 会话标题栏：已完成进度、剩余时间、关闭
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
}

export default function IRSessionHeader({
  progress,
  remainingTimeLabel,
  autoPostponeLabel,
  onUndoAutoPostpone,
  onClose
}: Props) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap"
    }}>
      <div style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>
        已完成 {formatSessionProgress(progress)}
        <span style={{ marginLeft: "8px", color: "var(--orca-color-text-3)" }}>
          剩余 {progress.remaining}
        </span>
        {remainingTimeLabel ? (
          <span style={{ marginLeft: "12px" }}>⏱ {remainingTimeLabel}</span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        {autoPostponeLabel ? (
          <>
            <span style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
              {autoPostponeLabel}
            </span>
            {onUndoAutoPostpone ? (
              <Button variant="plain" onClick={onUndoAutoPostpone}>
                撤销
              </Button>
            ) : null}
          </>
        ) : null}
        {onClose ? (
          <Button variant="plain" onClick={onClose}>
            关闭
          </Button>
        ) : null}
      </div>
    </div>
  )
}
