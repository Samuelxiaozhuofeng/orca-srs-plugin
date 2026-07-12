/**
 * 管理面板漏斗诊断区
 */

import type { IRCard } from "../../srs/incrementalReadingCollector"
import {
  computeFunnelStageDistribution,
  findStaleExtracts,
  findTopicStarvationRisk
} from "../../srs/incremental-reading/irFunnelDiagnostics"

const { useMemo } = window.React

type Props = {
  cards: IRCard[]
}

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--orca-color-text-1)",
  lineHeight: 1.4
} as const

const bodyStyle = {
  fontSize: 12,
  color: "var(--orca-color-text-2)",
  lineHeight: 1.5,
  wordBreak: "break-word" as const
}

const mutedStyle = {
  fontSize: 12,
  color: "var(--orca-color-text-3)",
  lineHeight: 1.5,
  wordBreak: "break-word" as const
}

const dividerStyle = {
  borderTop: "1px solid var(--orca-color-border-1)",
  margin: 0
} as const

const progressRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "baseline",
  gap: "4px 2px",
  fontSize: 12,
  color: "var(--orca-color-text-2)",
  lineHeight: 1.5,
  wordBreak: "break-word" as const
}

const countStyle = {
  color: "var(--orca-color-text-1)",
  fontWeight: 600
} as const

const arrowStyle = {
  color: "var(--orca-color-text-3)",
  flexShrink: 0
} as const

const flowStepStyle = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 2,
  minWidth: 0
} as const

function ProgressSegment({ label, count }: { label: string; count: number }) {
  return (
    <span>
      {label}{" "}
      <span style={countStyle}>{count}</span>
    </span>
  )
}

function SectionDivider() {
  return <div style={dividerStyle} role="separator" />
}

export default function IRFunnelDiagnosticsPanel({ cards }: Props) {
  const dist = useMemo(() => computeFunnelStageDistribution(cards), [cards])
  const risk = useMemo(() => findTopicStarvationRisk(cards), [cards])
  const stale = useMemo(() => findStaleExtracts(cards), [cards])

  const unread = dist["topic.preview"]
  const reading = dist["topic.work"]
  const raw = dist["extract.raw"]
  const refined = dist["extract.refined"]
  const candidate = dist["extract.item_candidate"]
  const other = dist.other

  const topicTotal = unread + reading
  const startedRate = topicTotal > 0 ? Math.round(reading / topicTotal * 100) : 0
  const showConversion = topicTotal > 0
  const showGuideHint = unread > 0 && topicTotal > 0 && reading / topicTotal < 0.1

  const hasDueContent = risk.dueTopics > 0 || risk.overdueExtracts > 0

  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      border: "1px solid var(--orca-color-border-1)",
      background: "var(--orca-color-bg-2)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontSize: 12,
      color: "var(--orca-color-text-2)"
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--orca-color-text-1)" }}>
        漏斗诊断
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={sectionTitleStyle}>📚 阅读进度</div>
        <div style={progressRowStyle}>
          <ProgressSegment label="未读" count={unread} />
          <span style={flowStepStyle}>
            <span style={arrowStyle}>→</span>
            <ProgressSegment label="阅读中" count={reading} />
          </span>
          <span style={flowStepStyle}>
            <span style={arrowStyle}>→</span>
            <span>
              摘录：待整理{" "}
              <span style={countStyle}>{raw}</span>
              、已整理{" "}
              <span style={countStyle}>{refined}</span>
              、待制卡{" "}
              <span style={countStyle}>{candidate}</span>
            </span>
          </span>
          {other > 0 ? (
            <span style={flowStepStyle}>
              <span style={arrowStyle}>→</span>
              <ProgressSegment label="其他阶段" count={other} />
            </span>
          ) : null}
        </div>
        {showConversion ? (
          <div style={mutedStyle}>
            已开始阅读{" "}
            <span style={countStyle}>{startedRate}%</span>
            （{reading}/{topicTotal}）
          </div>
        ) : null}
        {showGuideHint ? (
          <div style={{ ...mutedStyle, color: "var(--orca-color-primary-6)" }}>
            💡 在资料库中打开一个 Topic 开始渐进阅读吧
          </div>
        ) : null}
      </div>

      <SectionDivider />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
        <div style={sectionTitleStyle}>⏰ 到期提醒</div>
        {!hasDueContent ? (
          <div style={{ ...bodyStyle, color: "var(--orca-color-success-6)" }}>
            ✅ 一切正常，没有到期待处理的内容
          </div>
        ) : risk.atRisk ? (
          <div style={{ ...bodyStyle, color: "var(--orca-color-warning-6)" }}>
            ⚠️ 注意：{risk.dueTopics} 个 Topic 到期待复习，{risk.overdueExtracts} 个摘录逾期未处理
          </div>
        ) : (
          <div style={bodyStyle}>
            {risk.dueTopics} 个 Topic 到期待复习，{risk.overdueExtracts} 个摘录逾期未处理
          </div>
        )}
      </div>

      <SectionDivider />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
        <div style={sectionTitleStyle}>🕐 陈旧摘录</div>
        {stale.length === 0 ? (
          <div style={{ ...bodyStyle, color: "var(--orca-color-success-6)" }}>
            ✅ 没有超过 14 天未处理的摘录
          </div>
        ) : (
          <div style={bodyStyle}>
            {stale.length} 个摘录已超过 14 天未处理，建议尽快整理或归档
          </div>
        )}
      </div>
    </div>
  )
}
