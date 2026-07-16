/**
 * 统计页：卡片状态 / 间隔 / 难度分布类图表
 */

import type {
  CardStateDistribution,
  IntervalDistribution,
  DifficultyDistribution
} from "../../srs/types"
import { BarChart, PieChart } from "../charts"

// ========================================
// 子组件：卡片状态分布
// Requirements: 4.1, 4.2, 4.3, 4.4
// ========================================

interface CardStateDistributionChartProps {
  distribution: CardStateDistribution | null
  isLoading: boolean
  onSliceClick?: (state: string) => void
}

export function CardStateDistributionChart({ distribution, isLoading, onSliceClick }: CardStateDistributionChartProps) {
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

  if (!distribution || distribution.total === 0) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无卡片数据
      </div>
    )
  }

  const pieData = [
    { key: "new", value: distribution.new, color: "#3b82f6", label: "新卡" },
    { key: "learning", value: distribution.learning, color: "#f97316", label: "学习中" },
    { key: "review", value: distribution.review, color: "#22c55e", label: "已掌握" },
    { key: "suspended", value: distribution.suspended, color: "#9ca3af", label: "暂停" }
  ].filter(item => item.value > 0)

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
        卡片状态分布
      </h3>

      <PieChart
        data={pieData}
        width={300}
        height={280}
        innerRadius={50}
        showLegend={true}
        showPercentage={true}
        onSliceClick={onSliceClick ? (item) => onSliceClick(item.key) : undefined}
      />
    </div>
  )
}

// ========================================
// 子组件：卡片间隔分布
// Requirements: 6.1, 6.2, 6.3
// ========================================

interface IntervalDistributionChartProps {
  distribution: IntervalDistribution | null
  isLoading: boolean
}

export function IntervalDistributionChart({ distribution, isLoading }: IntervalDistributionChartProps) {
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

  if (!distribution || distribution.buckets.every(b => b.count === 0)) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无间隔数据
      </div>
    )
  }

  const barData = distribution.buckets.map(bucket => ({
    label: bucket.label,
    value: bucket.count
  }))

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
        卡片间隔分布
      </h3>

      <div style={{
        display: "flex",
        gap: "16px",
        marginBottom: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        <span>平均间隔: {distribution.averageInterval.toFixed(1)} 天</span>
        <span>最大间隔: {distribution.maxInterval} 天</span>
      </div>

      <BarChart
        data={barData}
        width={400}
        height={180}
        barColor="var(--orca-color-success-5)"
        showLabels={true}
        formatValue={(v) => `${v}张`}
      />
    </div>
  )
}

// ========================================
// 子组件：难度分布
// Requirements: 10.1, 10.2, 10.3
// ========================================

interface DifficultyDistributionChartProps {
  distribution: DifficultyDistribution | null
  isLoading: boolean
}

export function DifficultyDistributionChart({ distribution, isLoading }: DifficultyDistributionChartProps) {
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

  if (!distribution || distribution.buckets.every(b => b.count === 0)) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无难度数据
      </div>
    )
  }

  const barData = distribution.buckets.map(bucket => ({
    label: bucket.label,
    value: bucket.count
  }))

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
        卡片难度分布
      </h3>

      <div style={{
        display: "flex",
        gap: "16px",
        marginBottom: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        <span>平均难度: {distribution.averageDifficulty.toFixed(2)}</span>
        <span>范围: {distribution.minDifficulty.toFixed(1)} - {distribution.maxDifficulty.toFixed(1)}</span>
      </div>

      <BarChart
        data={barData}
        width={400}
        height={180}
        barColor="var(--orca-color-warning-5)"
        showLabels={true}
        formatValue={(v) => `${v}张`}
      />
    </div>
  )
}
