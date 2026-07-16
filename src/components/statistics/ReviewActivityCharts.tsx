/**
 * 统计页：复习活动 / 时间类图表
 */

import type {
  FutureForecast,
  ReviewHistory,
  ReviewTimeStats,
  AnswerButtonStats
} from "../../srs/types"
import { BarChart, StackedBarChart, PieChart, LineChart } from "../charts"
import { formatDateShort, formatTime } from "./formatUtils"

// ========================================
// 子组件：未来预测图表
// Requirements: 2.1, 2.2, 2.3, 2.4
// ========================================

interface FutureForecastChartProps {
  forecast: FutureForecast | null
  isLoading: boolean
}

export function FutureForecastChart({ forecast, isLoading }: FutureForecastChartProps) {
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

  if (!forecast || forecast.days.length === 0) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无预测数据
      </div>
    )
  }

  // 准备堆叠柱状图数据
  const barData = forecast.days.map(day => ({
    label: formatDateShort(day.date),
    segments: [
      { key: "review", value: day.reviewDue, color: "#22c55e", label: "复习" },
      { key: "new", value: day.newAvailable, color: "#3b82f6", label: "新卡" }
    ]
  }))

  // 准备累计趋势线数据
  const lineData = forecast.days.map(day => ({
    label: formatDateShort(day.date),
    value: day.cumulative
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
        未来30天到期预测
      </h3>

      <div style={{ marginBottom: "16px" }}>
        <StackedBarChart
          data={barData}
          width={600}
          height={200}
          showLabels={true}
          showLegend={true}
          legendItems={[
            { key: "review", label: "复习卡", color: "#22c55e" },
            { key: "new", label: "新卡", color: "#3b82f6" }
          ]}
        />
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
          累计到期趋势
        </div>
        <LineChart
          data={lineData}
          width={600}
          height={150}
          lineColor="var(--orca-color-warning-5)"
          fillColor="var(--orca-color-warning-2)"
          showArea={true}
          showDots={false}
          showLabels={false}
        />
      </div>
    </div>
  )
}

// ========================================
// 子组件：复习历史图表
// Requirements: 3.1, 3.2, 3.3, 3.4
// ========================================

interface ReviewHistoryChartProps {
  history: ReviewHistory | null
  isLoading: boolean
}

export function ReviewHistoryChart({ history, isLoading }: ReviewHistoryChartProps) {
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

  if (!history || history.days.length === 0) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无复习历史
      </div>
    )
  }

  // 准备堆叠柱状图数据
  const barData = history.days.map(day => ({
    label: formatDateShort(day.date),
    segments: [
      { key: "again", value: day.again, color: "#ef4444", label: "Again" },
      { key: "hard", value: day.hard, color: "#f97316", label: "Hard" },
      { key: "good", value: day.good, color: "#22c55e", label: "Good" },
      { key: "easy", value: day.easy, color: "#3b82f6", label: "Easy" }
    ]
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
        复习历史
      </h3>

      <div style={{
        display: "flex",
        gap: "16px",
        marginBottom: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        <span>总复习: {history.totalReviews} 次</span>
        <span>日均: {history.averagePerDay.toFixed(1)} 次</span>
      </div>

      <StackedBarChart
        data={barData}
        width={600}
        height={200}
        showLabels={true}
        showLegend={true}
        legendItems={[
          { key: "again", label: "Again", color: "#ef4444" },
          { key: "hard", label: "Hard", color: "#f97316" },
          { key: "good", label: "Good", color: "#22c55e" },
          { key: "easy", label: "Easy", color: "#3b82f6" }
        ]}
      />
    </div>
  )
}

// ========================================
// 子组件：复习时间统计
// Requirements: 5.1, 5.2, 5.3, 5.4
// ========================================

interface ReviewTimeChartProps {
  stats: ReviewTimeStats | null
  isLoading: boolean
}

export function ReviewTimeChart({ stats, isLoading }: ReviewTimeChartProps) {
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

  if (!stats || stats.dailyTime.length === 0) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无复习时间数据
      </div>
    )
  }

  const barData = stats.dailyTime.map(day => ({
    label: formatDateShort(day.date),
    value: Math.round(day.time / 60000) // 转换为分钟
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
        复习时间统计
      </h3>

      <div style={{
        display: "flex",
        gap: "16px",
        marginBottom: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        <span>总时间: {formatTime(stats.totalTime)}</span>
        <span>日均: {formatTime(stats.averagePerDay)}</span>
      </div>

      <BarChart
        data={barData}
        width={600}
        height={180}
        barColor="var(--orca-color-primary-5)"
        showLabels={true}
        formatValue={(v) => `${v}分钟`}
      />
    </div>
  )
}

// ========================================
// 子组件：答题按钮统计
// Requirements: 7.1, 7.2, 7.3, 7.4
// ========================================

interface AnswerButtonChartProps {
  stats: AnswerButtonStats | null
  isLoading: boolean
}

export function AnswerButtonChart({ stats, isLoading }: AnswerButtonChartProps) {
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

  if (!stats || stats.total === 0) {
    return (
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无答题数据
      </div>
    )
  }

  const pieData = [
    { key: "again", value: stats.again, color: "#ef4444", label: "Again" },
    { key: "hard", value: stats.hard, color: "#f97316", label: "Hard" },
    { key: "good", value: stats.good, color: "#22c55e", label: "Good" },
    { key: "easy", value: stats.easy, color: "#3b82f6", label: "Easy" }
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
        答题按钮统计
      </h3>

      <div style={{
        display: "flex",
        gap: "16px",
        marginBottom: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        <span>总答题: {stats.total} 次</span>
        <span>正确率: {(stats.correctRate * 100).toFixed(1)}%</span>
      </div>

      <PieChart
        data={pieData}
        width={300}
        height={250}
        innerRadius={0}
        showLegend={true}
        showPercentage={true}
      />
    </div>
  )
}

