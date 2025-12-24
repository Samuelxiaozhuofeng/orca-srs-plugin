/**
 * 统计视图主组件
 * 
 * 提供 Anki 风格的学习统计数据可视化
 * 包括今日统计、未来预测、复习历史、卡片状态分布等
 * 
 * Requirements: 12.1, 12.2, 12.3
 */

import type { 
  TimeRange, 
  TodayStatistics, 
  FutureForecast, 
  ReviewHistory, 
  CardStateDistribution,
  ReviewTimeStats,
  IntervalDistribution,
  AnswerButtonStats,
  DifficultyDistribution,
  DeckInfo
} from "../srs/types"
import { BarChart, StackedBarChart, PieChart, LineChart } from "./charts"

const { useState, useEffect, useCallback, useMemo } = window.React
const { Button } = orca.components

// ========================================
// 类型定义
// ========================================

interface StatisticsViewProps {
  panelId: string
  pluginName: string
  onBack: () => void
  decks: DeckInfo[]
}

// ========================================
// 时间范围选项
// ========================================

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "1month", label: "1个月" },
  { key: "3months", label: "3个月" },
  { key: "1year", label: "1年" },
  { key: "all", label: "全部" }
]

// ========================================
// 工具函数
// ========================================

/**
 * 格式化时间（毫秒转分钟/小时）
 */
function formatTime(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}秒`
  }
  if (ms < 3600000) {
    return `${Math.round(ms / 60000)}分钟`
  }
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.round((ms % 3600000) / 60000)
  return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
}

/**
 * 格式化日期为短格式
 */
function formatDateShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}


// ========================================
// 子组件：时间范围选择器
// Requirements: 8.1, 8.2
// ========================================

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div style={{
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    }}>
      {TIME_RANGE_OPTIONS.map(option => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          style={{
            padding: "6px 12px",
            borderRadius: "16px",
            border: "1px solid",
            borderColor: value === option.key
              ? "var(--orca-color-primary-5)"
              : "var(--orca-color-border-1)",
            backgroundColor: value === option.key
              ? "var(--orca-color-primary-1)"
              : "transparent",
            color: value === option.key
              ? "var(--orca-color-primary-6)"
              : "var(--orca-color-text-2)",
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ========================================
// 子组件：牌组筛选器
// Requirements: 9.1, 9.2, 9.3
// ========================================

interface DeckFilterProps {
  decks: DeckInfo[]
  selectedDeck: string | undefined
  onChange: (deckName: string | undefined) => void
}

function DeckFilter({ decks, selectedDeck, onChange }: DeckFilterProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }}>
      <span style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>牌组:</span>
      <select
        value={selectedDeck || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-1)",
          color: "var(--orca-color-text-1)",
          fontSize: "13px",
          cursor: "pointer",
          minWidth: "120px"
        }}
      >
        <option value="">全部牌组</option>
        {decks.map(deck => (
          <option key={deck.name} value={deck.name}>{deck.name}</option>
        ))}
      </select>
    </div>
  )
}

// ========================================
// 子组件：今日统计卡片
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
// ========================================

interface TodayStatsCardProps {
  stats: TodayStatistics | null
  isLoading: boolean
}

function TodayStatsCard({ stats, isLoading }: TodayStatsCardProps) {
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


// ========================================
// 子组件：未来预测图表
// Requirements: 2.1, 2.2, 2.3, 2.4
// ========================================

interface FutureForecastChartProps {
  forecast: FutureForecast | null
  isLoading: boolean
}

function FutureForecastChart({ forecast, isLoading }: FutureForecastChartProps) {
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

function ReviewHistoryChart({ history, isLoading }: ReviewHistoryChartProps) {
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
// 子组件：卡片状态分布
// Requirements: 4.1, 4.2, 4.3, 4.4
// ========================================

interface CardStateDistributionChartProps {
  distribution: CardStateDistribution | null
  isLoading: boolean
  onSliceClick?: (state: string) => void
}

function CardStateDistributionChart({ distribution, isLoading, onSliceClick }: CardStateDistributionChartProps) {
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
// 子组件：复习时间统计
// Requirements: 5.1, 5.2, 5.3, 5.4
// ========================================

interface ReviewTimeChartProps {
  stats: ReviewTimeStats | null
  isLoading: boolean
}

function ReviewTimeChart({ stats, isLoading }: ReviewTimeChartProps) {
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
// 子组件：卡片间隔分布
// Requirements: 6.1, 6.2, 6.3
// ========================================

interface IntervalDistributionChartProps {
  distribution: IntervalDistribution | null
  isLoading: boolean
}

function IntervalDistributionChart({ distribution, isLoading }: IntervalDistributionChartProps) {
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
// 子组件：答题按钮统计
// Requirements: 7.1, 7.2, 7.3, 7.4
// ========================================

interface AnswerButtonChartProps {
  stats: AnswerButtonStats | null
  isLoading: boolean
}

function AnswerButtonChart({ stats, isLoading }: AnswerButtonChartProps) {
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

// ========================================
// 子组件：难度分布
// Requirements: 10.1, 10.2, 10.3
// ========================================

interface DifficultyDistributionChartProps {
  distribution: DifficultyDistribution | null
  isLoading: boolean
}

function DifficultyDistributionChart({ distribution, isLoading }: DifficultyDistributionChartProps) {
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


// ========================================
// 主组件：统计视图
// ========================================

export default function StatisticsView({ panelId, pluginName, onBack, decks }: StatisticsViewProps) {
  // 状态
  const [timeRange, setTimeRange] = useState<TimeRange>("1month")
  const [selectedDeck, setSelectedDeck] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  
  // 统计数据
  const [todayStats, setTodayStats] = useState<TodayStatistics | null>(null)
  const [futureForecast, setFutureForecast] = useState<FutureForecast | null>(null)
  const [reviewHistory, setReviewHistory] = useState<ReviewHistory | null>(null)
  const [cardDistribution, setCardDistribution] = useState<CardStateDistribution | null>(null)
  const [reviewTimeStats, setReviewTimeStats] = useState<ReviewTimeStats | null>(null)
  const [intervalDistribution, setIntervalDistribution] = useState<IntervalDistribution | null>(null)
  const [answerButtonStats, setAnswerButtonStats] = useState<AnswerButtonStats | null>(null)
  const [difficultyDistribution, setDifficultyDistribution] = useState<DifficultyDistribution | null>(null)

  // 刷新状态
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 加载统计数据
  const loadStatistics = useCallback(async (clearCache = false) => {
    setIsLoading(true)
    if (clearCache) {
      setIsRefreshing(true)
    }
    try {
      const {
        getTodayStatistics,
        getFutureForecast,
        getReviewHistory,
        getCardStateDistribution,
        getReviewTimeStats,
        getIntervalDistribution,
        getAnswerButtonStats,
        getDifficultyDistribution,
        getStatisticsPreferences,
        saveStatisticsPreferences,
        clearStatisticsCache
      } = await import("../srs/statisticsManager")

      // 如果需要清除缓存
      if (clearCache) {
        clearStatisticsCache()
      }

      // 加载用户偏好
      const preferences = await getStatisticsPreferences(pluginName)
      setTimeRange(preferences.timeRange)
      if (preferences.selectedDeck) {
        setSelectedDeck(preferences.selectedDeck)
      }

      // 并行加载所有统计数据
      const [
        today,
        forecast,
        history,
        cardDist,
        timeStats,
        intervalDist,
        answerStats,
        difficultyDist
      ] = await Promise.all([
        getTodayStatistics(pluginName, selectedDeck),
        getFutureForecast(pluginName, 30, selectedDeck),
        getReviewHistory(pluginName, timeRange, selectedDeck),
        getCardStateDistribution(pluginName, selectedDeck),
        getReviewTimeStats(pluginName, timeRange, selectedDeck),
        getIntervalDistribution(pluginName, selectedDeck),
        getAnswerButtonStats(pluginName, timeRange, selectedDeck),
        getDifficultyDistribution(pluginName, selectedDeck)
      ])

      setTodayStats(today)
      setFutureForecast(forecast)
      setReviewHistory(history)
      setCardDistribution(cardDist)
      setReviewTimeStats(timeStats)
      setIntervalDistribution(intervalDist)
      setAnswerButtonStats(answerStats)
      setDifficultyDistribution(difficultyDist)
    } catch (error) {
      console.error(`[${pluginName}] 加载统计数据失败:`, error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [pluginName, timeRange, selectedDeck])

  // 初始加载
  useEffect(() => {
    void loadStatistics()
  }, [loadStatistics])

  // 处理时间范围变更
  const handleTimeRangeChange = useCallback(async (range: TimeRange) => {
    setTimeRange(range)
    try {
      const { saveTimeRangePreference } = await import("../srs/statisticsManager")
      await saveTimeRangePreference(pluginName, range)
    } catch (error) {
      console.error(`[${pluginName}] 保存时间范围偏好失败:`, error)
    }
  }, [pluginName])

  // 处理牌组筛选变更
  const handleDeckChange = useCallback(async (deckName: string | undefined) => {
    setSelectedDeck(deckName)
    try {
      const { saveSelectedDeckPreference } = await import("../srs/statisticsManager")
      await saveSelectedDeckPreference(pluginName, deckName)
    } catch (error) {
      console.error(`[${pluginName}] 保存牌组偏好失败:`, error)
    }
  }, [pluginName])

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      height: "100%",
      overflow: "auto"
    }}>
      {/* 头部 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <Button variant="plain" onClick={onBack} style={{ fontSize: "13px", padding: "6px 12px" }}>
          ← 返回
        </Button>
        <div style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          flex: 1
        }}>
          学习统计
        </div>
        <Button
          variant="plain"
          onClick={() => !isRefreshing && void loadStatistics(true)}
          style={{ 
            fontSize: "13px", 
            padding: "6px 12px",
            opacity: isRefreshing ? 0.6 : 1,
            cursor: isRefreshing ? "not-allowed" : "pointer"
          }}
          title="刷新数据（清除缓存）"
        >
          <i 
            className={`ti ti-refresh ${isRefreshing ? "srs-refresh-spinning" : ""}`} 
            style={{ marginRight: "4px" }} 
          />
          {isRefreshing ? "刷新中..." : "刷新"}
        </Button>
      </div>

      {/* 筛选器 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px"
      }}>
        <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
        <div style={{ width: "1px", height: "24px", backgroundColor: "var(--orca-color-border-1)" }} />
        <DeckFilter decks={decks} selectedDeck={selectedDeck} onChange={handleDeckChange} />
      </div>

      {/* 今日统计 */}
      <TodayStatsCard stats={todayStats} isLoading={isLoading} />

      {/* 图表区域 - 两列布局 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
        gap: "16px"
      }}>
        {/* 卡片状态分布 */}
        <CardStateDistributionChart distribution={cardDistribution} isLoading={isLoading} />
        
        {/* 答题按钮统计 */}
        <AnswerButtonChart stats={answerButtonStats} isLoading={isLoading} />
      </div>

      {/* 未来预测 */}
      <FutureForecastChart forecast={futureForecast} isLoading={isLoading} />

      {/* 复习历史 */}
      <ReviewHistoryChart history={reviewHistory} isLoading={isLoading} />

      {/* 复习时间统计 */}
      <ReviewTimeChart stats={reviewTimeStats} isLoading={isLoading} />

      {/* 间隔和难度分布 - 两列布局 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
        gap: "16px"
      }}>
        {/* 卡片间隔分布 */}
        <IntervalDistributionChart distribution={intervalDistribution} isLoading={isLoading} />
        
        {/* 难度分布 */}
        <DifficultyDistributionChart distribution={difficultyDistribution} isLoading={isLoading} />
      </div>
    </div>
  )
}

