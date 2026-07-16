import type { SessionStatsSummary } from "../../srs/sessionProgressTracker"
import {
  formatAccuracyRate,
  formatDuration
} from "../../srs/sessionProgressTracker"
import GradeDistributionBar from "../GradeDistributionBar"

const { Button, ModalOverlay } = orca.components

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
    <div className="srs-session-complete-container" style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px 48px",
      maxWidth: "520px",
      width: "100%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      textAlign: "center"
    }}>
      <div style={{ fontSize: "16px", color: "var(--orca-color-text-2)" }}>
        正在汇总...
      </div>
    </div>
  ) : (
    <div className="srs-session-complete-container" style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px 48px",
      maxWidth: "520px",
      width: "100%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      textAlign: "center"
    }}>
      <div style={{ fontSize: "56px", marginBottom: "16px" }}>🎉</div>
      <h2 style={{
        fontSize: "22px",
        fontWeight: "600",
        color: "var(--orca-color-text-1)",
        marginBottom: "24px"
      }}>
        {isRepeatMode ? `第 ${currentRound} 轮复习结束！` : "本次复习结束！"}
      </h2>

      <div style={{
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        padding: "20px",
        marginBottom: "24px",
        textAlign: "left"
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "16px",
          marginBottom: "20px"
        }}>
          <SummaryMetric
            value={String(stats.totalReviewed)}
            label="复习卡片"
            color="var(--orca-color-primary-5)"
          />
          <SummaryMetric
            value={formatAccuracyRate(stats.accuracyRate)}
            label="准确率"
            color={
              stats.accuracyRate >= 0.8
                ? "#22c55e"
                : stats.accuracyRate >= 0.6 ? "#f59e0b" : "#ef4444"
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
          <div style={{
            fontSize: "12px",
            color: "var(--orca-color-text-3)",
            textAlign: "center",
            marginBottom: "16px"
          }}>
            有效复习时长: {formatDuration(stats.effectiveReviewTime)}
          </div>
        )}

        <div>
          <div style={{
            fontSize: "13px",
            color: "var(--orca-color-text-2)",
            marginBottom: "8px",
            textAlign: "center"
          }}>
            评分分布
          </div>
          <GradeDistributionBar
            distribution={stats.gradeDistribution}
            showLabels={true}
            height={28}
          />
        </div>
      </div>

      <div style={{
        fontSize: "14px",
        color: "var(--orca-color-text-2)",
        marginBottom: "24px"
      }}>
        坚持复习，持续进步！
      </div>

      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        {isRepeatMode && onRepeatRound && (
          <Button variant="outline" onClick={onRepeatRound} style={{ padding: "12px 24px", fontSize: "16px" }}>
            再复习一轮
          </Button>
        )}
        <Button variant="solid" onClick={onFinish} style={{ padding: "12px 32px", fontSize: "16px" }}>
          完成
        </Button>
      </div>
    </div>
  )

  if (inSidePanel) {
    return (
      <div style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}>
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
  color = "var(--orca-color-text-1)"
}: {
  value: string
  label: string
  color?: string
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "28px", fontWeight: "600", color }}>{value}</div>
      <div style={{
        fontSize: "12px",
        color: "var(--orca-color-text-3)",
        marginTop: "4px"
      }}>
        {label}
      </div>
    </div>
  )
}
