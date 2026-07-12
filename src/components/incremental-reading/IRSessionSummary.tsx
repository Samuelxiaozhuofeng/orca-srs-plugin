/**
 * 会话结束摘要
 */

import type { IRSessionMetricsSnapshot } from "../../srs/incremental-reading/irMetrics"

const { Button } = orca.components

type Props = {
  metrics: IRSessionMetricsSnapshot
  autoPostponeCount?: number
  reviewCompleted?: number
  onClose?: () => void
  closeLabel?: string
}

export default function IRSessionSummary({
  metrics,
  autoPostponeCount = 0,
  reviewCompleted = 0,
  onClose,
  closeLabel = "关闭"
}: Props) {
  const readingCompleted = Math.max(0, metrics.completedCount - reviewCompleted)
  const durationMins = metrics.durationMs != null ? Math.round(metrics.durationMs / 60000) : 0

  return (
    <div className="ir-session-summary">
      <div className="ir-session-summary__card">
        <div className="ir-session-summary__header">
          <div className="ir-session-summary__icon">
            <i className="ti ti-circle-check" aria-hidden="true" />
          </div>
          <div>
            <h3 className="ir-session-summary__title">专注阅读结束</h3>
            <p className="ir-session-summary__subtitle">本次渐进阅读会话已顺利完成</p>
          </div>
        </div>

        <div className="ir-session-summary__stats">
          <div className="ir-stat-box">
            <span className="ir-stat-box__label">进度 (完成 / 计划)</span>
            <div className="ir-stat-box__value">
              <strong>{metrics.completedCount}</strong> / {metrics.plannedCount}
            </div>
          </div>
          <div className="ir-stat-box">
            <span className="ir-stat-box__label">已处理条目</span>
            <div className="ir-stat-box__value">
              Topic <strong>{metrics.topicProcessed}</strong> · Extract <strong>{metrics.extractProcessed}</strong>
              {reviewCompleted > 0 ? (
                <> · 复习 <strong>{reviewCompleted}</strong></>
              ) : null}
            </div>
          </div>
          {reviewCompleted > 0 ? (
            <div className="ir-stat-box">
              <span className="ir-stat-box__label">阅读 / 复习完成</span>
              <div className="ir-stat-box__value">
                阅读 <strong>{readingCompleted}</strong> · 复习 <strong>{reviewCompleted}</strong>
              </div>
            </div>
          ) : null}
          <div className="ir-stat-box">
            <span className="ir-stat-box__label">新产出</span>
            <div className="ir-stat-box__value">
              Extract <strong>{metrics.extractCreated}</strong> · Item <strong>{metrics.itemCreated}</strong>
            </div>
          </div>
          {durationMins > 0 ? (
            <div className="ir-stat-box">
              <span className="ir-stat-box__label">投入用时</span>
              <div className="ir-stat-box__value">
                <strong>{durationMins}</strong> 分钟
              </div>
            </div>
          ) : null}
        </div>

        {autoPostponeCount > 0 ? (
          <div className="ir-session-summary__hint">
            <i className="ti ti-info-circle" aria-hidden="true" />
            自动顺延了 {autoPostponeCount} 条卡片
          </div>
        ) : null}

        {onClose ? (
          <div className="ir-session-summary__actions">
            <Button tabIndex={0} variant="solid" onClick={onClose} className="ir-summary-close-btn">
              <i className="ti ti-arrow-left" aria-hidden="true" style={{ marginRight: 6 }} />
              {closeLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
