/**
 * 选择题统计指示器组件
 *
 * 功能：
 * - 在编辑模式下显示每个选项的选择频率
 * - 对高频错误选项显示警告指示器
 * 
 * Requirements: 8.1, 8.2
 */

const { useState, useEffect, useMemo } = window.React

import type { DbId } from "../orca.d.ts"
import type { ChoiceOption } from "../srs/types"
import { loadChoiceStatistics, calculateOptionFrequency, type OptionFrequency } from "../srs/choiceStatisticsStorage"

interface ChoiceStatisticsIndicatorProps {
  blockId: DbId                    // 选择题卡片块 ID
  options: ChoiceOption[]          // 选项列表
}

// 高频错误阈值：错误选择次数超过总次数的 30% 视为高频错误
const HIGH_FREQUENCY_THRESHOLD = 0.3
// 最小样本数：至少有 3 次选择记录才显示警告
const MIN_SAMPLE_SIZE = 3

/**
 * 选择题统计指示器组件
 * 
 * 显示每个选项的选择频率统计，并对高频错误选项显示警告
 */
export default function ChoiceStatisticsIndicator({
  blockId,
  options
}: ChoiceStatisticsIndicatorProps) {
  const [frequencyMap, setFrequencyMap] = useState<Map<DbId, OptionFrequency>>(new Map())
  const [totalReviews, setTotalReviews] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // 加载统计数据
  useEffect(() => {
    let isMounted = true

    async function loadStats() {
      setIsLoading(true)
      try {
        const entries = await loadChoiceStatistics(blockId)
        if (!isMounted) return

        const optionBlockIds = options.map(opt => opt.blockId)
        const frequency = calculateOptionFrequency(entries, optionBlockIds)
        
        setFrequencyMap(frequency)
        setTotalReviews(entries.length)
      } catch (error) {
        console.warn("[SRS] 加载选择统计失败:", error)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadStats()

    return () => {
      isMounted = false
    }
  }, [blockId, options])

  // 计算每个选项的统计信息
  const optionStats = useMemo(() => {
    return options.map(option => {
      const freq = frequencyMap.get(option.blockId) || { total: 0, incorrect: 0 }
      const selectRate = totalReviews > 0 ? (freq.total / totalReviews) * 100 : 0
      const incorrectRate = freq.total > 0 ? (freq.incorrect / freq.total) * 100 : 0
      
      // 判断是否为高频错误选项
      const isHighFrequencyError = 
        !option.isCorrect && 
        freq.total >= MIN_SAMPLE_SIZE && 
        freq.incorrect / freq.total >= HIGH_FREQUENCY_THRESHOLD

      return {
        blockId: option.blockId,
        text: option.text,
        isCorrect: option.isCorrect,
        total: freq.total,
        incorrect: freq.incorrect,
        selectRate,
        incorrectRate,
        isHighFrequencyError
      }
    })
  }, [options, frequencyMap, totalReviews])

  // 如果没有复习记录，不显示统计
  if (totalReviews === 0 && !isLoading) {
    return null
  }

  return (
    <div className="srs-choice-statistics-indicator" style={containerStyle}>
      {/* 标题栏 */}
      <div style={headerStyle}>
        <i className="ti ti-chart-bar" style={{ fontSize: "14px" }} />
        <span>选择统计</span>
        <span style={reviewCountStyle}>({totalReviews} 次复习)</span>
      </div>

      {/* 加载状态 */}
      {isLoading ? (
        <div style={loadingStyle}>加载中...</div>
      ) : (
        /* 选项统计列表 */
        <div style={statsListStyle}>
          {optionStats.map((stat: OptionStatItemProps['stat'], index: number) => (
            <OptionStatItem
              key={stat.blockId}
              index={index}
              stat={stat}
              totalReviews={totalReviews}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 单个选项的统计项组件
 */
interface OptionStatItemProps {
  index: number
  stat: {
    blockId: DbId
    text: string
    isCorrect: boolean
    total: number
    incorrect: number
    selectRate: number
    incorrectRate: number
    isHighFrequencyError: boolean
  }
  totalReviews: number
}

function OptionStatItem({ index, stat, totalReviews }: OptionStatItemProps) {
  const label = String.fromCharCode(65 + index) // A, B, C, ...
  
  // 截断过长的文本
  const displayText = stat.text.length > 30 
    ? stat.text.substring(0, 30) + "..." 
    : stat.text || "(空)"

  return (
    <div style={statItemStyle}>
      {/* 选项标签 */}
      <div style={{
        ...labelStyle,
        backgroundColor: stat.isCorrect 
          ? "rgba(34, 197, 94, 0.2)" 
          : stat.isHighFrequencyError 
            ? "rgba(239, 68, 68, 0.2)"
            : "var(--orca-color-bg-3)"
      }}>
        {label}
      </div>

      {/* 选项文本 */}
      <div style={textStyle} title={stat.text}>
        {displayText}
      </div>

      {/* 统计数据 */}
      <div style={statsStyle}>
        {/* 选择次数 */}
        <span style={countStyle}>
          {stat.total}次
        </span>

        {/* 选择率进度条 */}
        <div style={progressBarContainerStyle}>
          <div 
            style={{
              ...progressBarStyle,
              width: `${Math.min(stat.selectRate, 100)}%`,
              backgroundColor: stat.isCorrect 
                ? "rgba(34, 197, 94, 0.6)" 
                : stat.isHighFrequencyError
                  ? "rgba(239, 68, 68, 0.6)"
                  : "var(--orca-color-primary-4)"
            }}
          />
        </div>

        {/* 选择率百分比 */}
        <span style={percentStyle}>
          {stat.selectRate.toFixed(0)}%
        </span>

        {/* 高频错误警告 */}
        {stat.isHighFrequencyError && (
          <div style={warningStyle} title="高频错误选项：该干扰项经常被错误选择">
            <i className="ti ti-alert-triangle" style={{ fontSize: "14px" }} />
          </div>
        )}

        {/* 正确选项标记 */}
        {stat.isCorrect && (
          <div style={correctStyle} title="正确选项">
            <i className="ti ti-check" style={{ fontSize: "14px" }} />
          </div>
        )}
      </div>
    </div>
  )
}

// 样式定义
const containerStyle: React.CSSProperties = {
  marginTop: "12px",
  padding: "12px",
  backgroundColor: "var(--orca-color-bg-2)",
  borderRadius: "8px",
  border: "1px solid var(--orca-color-border-1)",
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginBottom: "10px",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--orca-color-text-2)",
}

const reviewCountStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--orca-color-text-3)",
  fontWeight: 400,
}

const loadingStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "12px",
  color: "var(--orca-color-text-3)",
  fontSize: "12px",
}

const statsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
}

const statItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 8px",
  backgroundColor: "var(--orca-color-bg-1)",
  borderRadius: "6px",
  fontSize: "12px",
}

const labelStyle: React.CSSProperties = {
  width: "20px",
  height: "20px",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: "11px",
  flexShrink: 0,
  color: "var(--orca-color-text-1)",
}

const textStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--orca-color-text-2)",
  minWidth: 0,
}

const statsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexShrink: 0,
}

const countStyle: React.CSSProperties = {
  color: "var(--orca-color-text-3)",
  fontSize: "11px",
  minWidth: "28px",
  textAlign: "right",
}

const progressBarContainerStyle: React.CSSProperties = {
  width: "60px",
  height: "6px",
  backgroundColor: "var(--orca-color-bg-3)",
  borderRadius: "3px",
  overflow: "hidden",
}

const progressBarStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "3px",
  transition: "width 0.3s ease",
}

const percentStyle: React.CSSProperties = {
  color: "var(--orca-color-text-2)",
  fontSize: "11px",
  minWidth: "28px",
  textAlign: "right",
}

const warningStyle: React.CSSProperties = {
  color: "rgba(239, 68, 68, 0.9)",
  display: "flex",
  alignItems: "center",
  cursor: "help",
}

const correctStyle: React.CSSProperties = {
  color: "rgba(34, 197, 94, 0.9)",
  display: "flex",
  alignItems: "center",
}
