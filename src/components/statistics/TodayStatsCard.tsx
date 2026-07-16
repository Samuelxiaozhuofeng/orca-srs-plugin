/**
 * 今日统计摘要卡片
 */

import type { TodayStatistics } from "../../srs/types"
import { formatTime } from "./formatUtils"

// ========================================
// 子组件：今日统计卡片
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
// ========================================

interface TodayStatsCardProps {
  stats: TodayStatistics | null
  isLoading: boolean
}

export function TodayStatsCard({ stats, isLoading }: TodayStatsCardProps) {
  if (isLoading) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        加载中...
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const { reviewedCount, newLearnedCount, relearnedCount, totalTime, gradeDistribution } = stats

  return (
    <div style={{
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px"
    }}>
      <h3 style={{
        margin: "0 0 12px 0",
        fontSize: "15px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)"
      }}>
        今日统计
      </h3>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
        gap: "12px"
      }}>
        <StatItem label="已复习" value={reviewedCount} color="var(--orca-color-primary-6)" />
        <StatItem label="新学" value={newLearnedCount} color="var(--orca-color-success-6)" />
        <StatItem label="重学" value={relearnedCount} color="var(--orca-color-danger-6)" />
        <StatItem label="复习时间" value={formatTime(totalTime)} />
      </div>

      <div style={{
        marginTop: "16px",
        paddingTop: "12px",
        borderTop: "1px solid var(--orca-color-border-1)"
      }}>
        <div style={{
          fontSize: "13px",
          color: "var(--orca-color-text-2)",
          marginBottom: "8px"
        }}>
          评分分布
        </div>
        <div style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap"
        }}>
          <GradeItem label="Again" value={gradeDistribution.again} color="#ef4444" />
          <GradeItem label="Hard" value={gradeDistribution.hard} color="#f97316" />
          <GradeItem label="Good" value={gradeDistribution.good} color="#22c55e" />
          <GradeItem label="Easy" value={gradeDistribution.easy} color="#3b82f6" />
        </div>
      </div>
    </div>
  )
}

function StatItem({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "8px",
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "6px"
    }}>
      <div style={{
        fontSize: "20px",
        fontWeight: 600,
        color: color || "var(--orca-color-text-1)"
      }}>
        {value}
      </div>
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

function GradeItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px"
    }}>
      <div style={{
        width: "10px",
        height: "10px",
        backgroundColor: color,
        borderRadius: "2px"
      }} />
      <span style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>
        {label}: {value}
      </span>
    </div>
  )
}
