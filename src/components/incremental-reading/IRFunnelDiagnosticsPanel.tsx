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

export default function IRFunnelDiagnosticsPanel({ cards }: Props) {
  const dist = useMemo(() => computeFunnelStageDistribution(cards), [cards])
  const risk = useMemo(() => findTopicStarvationRisk(cards), [cards])
  const stale = useMemo(() => findStaleExtracts(cards), [cards])

  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      border: "1px solid var(--orca-color-border-1)",
      background: "var(--orca-color-bg-2)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      fontSize: 12,
      color: "var(--orca-color-text-2)"
    }}>
      <div style={{ fontWeight: 600, color: "var(--orca-color-text-1)" }}>漏斗诊断</div>
      <div>
        topic.preview {dist["topic.preview"]} · topic.work {dist["topic.work"]} ·
        extract.raw {dist["extract.raw"]} · refined {dist["extract.refined"]} ·
        item_candidate {dist["extract.item_candidate"]}
      </div>
      <div>
        {risk.atRisk
          ? `⚠ Topic 饥饿风险：逾期 Extract ${risk.overdueExtracts}，到期 Topic ${risk.dueTopics}`
          : `Topic 曝光：到期 Topic ${risk.dueTopics}，逾期 Extract ${risk.overdueExtracts}`}
      </div>
      <div>长期未加工 Extract：{stale.length}</div>
    </div>
  )
}
