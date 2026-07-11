/**
 * 会话结束摘要
 */

import type { IRSessionMetricsSnapshot } from "../../srs/incremental-reading/irMetrics"

const { Button } = orca.components

type Props = {
  metrics: IRSessionMetricsSnapshot
  autoPostponeCount?: number
  onClose?: () => void
  closeLabel?: string
}

export default function IRSessionSummary({
  metrics,
  autoPostponeCount = 0,
  onClose,
  closeLabel = "关闭"
}: Props) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "24px",
      alignItems: "flex-start",
      maxWidth: 420
    }}>
      <div style={{ fontSize: "16px", fontWeight: 600 }}>会话结束</div>
      <div style={{ color: "var(--orca-color-text-2)", fontSize: "13px", lineHeight: 1.7 }}>
        <div>计划 {metrics.plannedCount} 条，完成 {metrics.completedCount} 条</div>
        <div>Topic {metrics.topicProcessed} · Extract {metrics.extractProcessed}</div>
        <div>新建 Extract {metrics.extractCreated} · Item {metrics.itemCreated}</div>
        {autoPostponeCount > 0 ? <div>自动顺延 {autoPostponeCount} 条</div> : null}
        {metrics.durationMs != null ? (
          <div>用时 {Math.round(metrics.durationMs / 60000)} 分钟</div>
        ) : null}
      </div>
      {onClose ? (
        <Button variant="solid" onClick={onClose}>{closeLabel}</Button>
      ) : null}
    </div>
  )
}
