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

function ProgressSegment({ label, count }: { label: string; count: number }) {
  return (
    <span>
      {label}{" "}
      <span className="ir-funnel__count">{count}</span>
    </span>
  )
}

function SectionDivider() {
  return <div className="ir-funnel__divider" role="separator" />
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
    <div className="ir-funnel">
      <div className="ir-funnel__title">
        漏斗诊断
      </div>

      <div className="ir-funnel__section">
        <div className="ir-funnel__section-title">📚 阅读进度</div>
        <div className="ir-funnel__progress-row">
          <ProgressSegment label="未读" count={unread} />
          <span className="ir-funnel__flow-step">
            <span className="ir-funnel__arrow">→</span>
            <ProgressSegment label="阅读中" count={reading} />
          </span>
          <span className="ir-funnel__flow-step">
            <span className="ir-funnel__arrow">→</span>
            <span>
              摘录：待整理{" "}
              <span className="ir-funnel__count">{raw}</span>
              、已整理{" "}
              <span className="ir-funnel__count">{refined}</span>
              、待制卡{" "}
              <span className="ir-funnel__count">{candidate}</span>
            </span>
          </span>
          {other > 0 ? (
            <span className="ir-funnel__flow-step">
              <span className="ir-funnel__arrow">→</span>
              <ProgressSegment label="其他阶段" count={other} />
            </span>
          ) : null}
        </div>
        {showConversion ? (
          <div className="ir-funnel__muted">
            已开始阅读{" "}
            <span className="ir-funnel__count">{startedRate}%</span>
            （{reading}/{topicTotal}）
          </div>
        ) : null}
        {showGuideHint ? (
          <div className="ir-funnel__muted ir-funnel__muted--hint">
            💡 在资料库中打开一个 Topic 开始渐进阅读吧
          </div>
        ) : null}
      </div>

      <SectionDivider />

      <div className="ir-funnel__section ir-funnel__section--spaced">
        <div className="ir-funnel__section-title">⏰ 到期提醒</div>
        {!hasDueContent ? (
          <div className="ir-funnel__body ir-funnel__body--ok">
            ✅ 一切正常，没有到期待处理的内容
          </div>
        ) : risk.atRisk ? (
          <div className="ir-funnel__body ir-funnel__body--warn">
            ⚠️ 注意：{risk.dueTopics} 个 Topic 到期待复习，{risk.overdueExtracts} 个摘录逾期未处理
          </div>
        ) : (
          <div className="ir-funnel__body">
            {risk.dueTopics} 个 Topic 到期待复习，{risk.overdueExtracts} 个摘录逾期未处理
          </div>
        )}
      </div>

      <SectionDivider />

      <div className="ir-funnel__section ir-funnel__section--spaced">
        <div className="ir-funnel__section-title">🕐 陈旧摘录</div>
        {stale.length === 0 ? (
          <div className="ir-funnel__body ir-funnel__body--ok">
            ✅ 没有超过 14 天未处理的摘录
          </div>
        ) : (
          <div className="ir-funnel__body">
            {stale.length} 个摘录已超过 14 天未处理，建议尽快整理或归档
          </div>
        )}
      </div>
    </div>
  )
}
