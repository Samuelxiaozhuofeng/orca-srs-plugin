import type { SessionStatsSummary } from "../../srs/sessionProgressTracker"
import {
  formatAccuracyRate,
  formatDuration
} from "../../srs/sessionProgressTracker"
import GradeDistributionBar from "../GradeDistributionBar"

const { Button, ModalOverlay } = orca.components

/** 指标语义色（对应 `srs-review.css` 的 `.srs-review-metric__value--*`） */
type MetricTone = "neutral" | "primary" | "success" | "warning" | "danger"

type ReviewSessionCompletedViewProps = {
  stats: SessionStatsSummary | null
  inSidePanel: boolean
  isRepeatMode: boolean
  currentRound: number
  onRepeatRound?: () => void
  onFinish: () => void
  onClose: () => void
}

export default function ReviewSessionCompletedView({
  stats,
  inSidePanel,
  isRepeatMode,
  currentRound,
  onRepeatRound,
  onFinish,
  onClose
}: ReviewSessionCompletedViewProps) {
  const content = stats == null ? (
    <div className="srs-session-complete-container srs-review-summary">
      <div className="srs-review-summary__loading">
        正在汇总...
      </div>
    </div>
  ) : (
    <div className="srs-session-complete-container srs-review-summary">
      <div className="srs-review-summary__emoji">🎉</div>
      <h2 className="srs-review-summary__title">
        {isRepeatMode ? `第 ${currentRound} 轮复习结束！` : "本次复习结束！"}
      </h2>

      <div className="srs-review-summary__panel">
        <div className="srs-review-summary__grid">
          <SummaryMetric
            value={String(stats.totalReviewed)}
            label="复习卡片"
            tone="primary"
          />
          <SummaryMetric
            value={formatAccuracyRate(stats.accuracyRate)}
            label="准确率"
            tone={
              stats.accuracyRate >= 0.8
                ? "success"
                : stats.accuracyRate >= 0.6 ? "warning" : "danger"
            }
          />
          <SummaryMetric value={formatDuration(stats.totalSessionTime)} label="总时长" />
          <SummaryMetric
            value={stats.totalReviewed > 0
              ? `${Math.round(stats.averageTimePerCard / 1000)}s`
              : "0s"}
            label="平均每卡"
          />
        </div>

        {stats.totalSessionTime > 0 &&
          stats.effectiveReviewTime < stats.totalSessionTime * 0.9 && (
          <div className="srs-review-summary__note">
            有效复习时长: {formatDuration(stats.effectiveReviewTime)}
          </div>
        )}

        <div>
          <div className="srs-review-summary__section-title">
            评分分布
          </div>
          <GradeDistributionBar
            distribution={stats.gradeDistribution}
            showLabels={true}
            height={28}
          />
        </div>
      </div>

      <div className="srs-review-summary__tagline">
        坚持复习，持续进步！
      </div>

      <div className="srs-review-actions">
        {isRepeatMode && onRepeatRound && (
          <Button variant="outline" onClick={onRepeatRound} className="srs-review-secondary-btn">
            再复习一轮
          </Button>
        )}
        <Button variant="solid" onClick={onFinish} className="srs-review-cta">
          完成
        </Button>
      </div>
    </div>
  )

  if (inSidePanel) {
    return (
      <div className="srs-review-center">
        {content}
      </div>
    )
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={onClose}
      className="srs-session-complete-modal"
    >
      {content}
    </ModalOverlay>
  )
}

function SummaryMetric({
  value,
  label,
  tone = "neutral"
}: {
  value: string
  label: string
  tone?: MetricTone
}) {
  return (
    <div className="srs-review-metric">
      <div className={`srs-review-metric__value srs-review-metric__value--${tone}`}>
        {value}
      </div>
      <div className="srs-review-metric__label">
        {label}
      </div>
    </div>
  )
}
