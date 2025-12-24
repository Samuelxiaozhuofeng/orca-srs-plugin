/**
 * GradeDistributionBar Component
 * 
 * 评分分布可视化组件，使用 CSS Flex 布局实现颜色条。
 * 颜色：Again(红) / Hard(黄) / Good(绿) / Easy(蓝)
 * 
 * Requirements: 1.4, 2.2
 */

import type { GradeDistribution } from "../srs/sessionProgressTracker"

const { useMemo } = window.React

// ============================================
// Type Definitions
// ============================================

export interface GradeDistributionBarProps {
  /** 评分分布数据 */
  distribution: GradeDistribution
  /** 是否显示数字标签 */
  showLabels?: boolean
  /** 容器高度（默认 24px） */
  height?: number
}

// ============================================
// Constants
// ============================================

/** 评分颜色配置 */
const GRADE_COLORS = {
  again: "#ef4444", // 红色
  hard: "#f59e0b",  // 黄色
  good: "#22c55e",  // 绿色
  easy: "#3b82f6",  // 蓝色
} as const

/** 评分标签 */
const GRADE_LABELS = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
} as const

// ============================================
// Component
// ============================================

export function GradeDistributionBar({
  distribution,
  showLabels = false,
  height = 24,
}: GradeDistributionBarProps) {
  // 计算总数和百分比
  const { total, percentages } = useMemo(() => {
    const total = distribution.again + distribution.hard + distribution.good + distribution.easy
    
    if (total === 0) {
      return {
        total: 0,
        percentages: { again: 0, hard: 0, good: 0, easy: 0 },
      }
    }
    
    return {
      total,
      percentages: {
        again: (distribution.again / total) * 100,
        hard: (distribution.hard / total) * 100,
        good: (distribution.good / total) * 100,
        easy: (distribution.easy / total) * 100,
      },
    }
  }, [distribution])

  // 空状态：显示灰色占位条
  if (total === 0) {
    return (
      <div
        className="srs-grade-distribution-bar"
        style={{
          display: "flex",
          height: `${height}px`,
          borderRadius: "4px",
          overflow: "hidden",
          backgroundColor: "var(--orca-color-bg-3)",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            color: "var(--orca-color-text-3)",
          }}
        >
          暂无评分数据
        </div>
      </div>
    )
  }

  const grades = ["again", "hard", "good", "easy"] as const

  return (
    <div className="srs-grade-distribution-bar">
      {/* 颜色条 */}
      <div
        style={{
          display: "flex",
          height: `${height}px`,
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        {grades.map((grade) => {
          const percentage = percentages[grade]
          const count = distribution[grade]
          
          // 跳过 0% 的部分
          if (percentage === 0) return null
          
          return (
            <div
              key={grade}
              title={`${GRADE_LABELS[grade]}: ${count} (${percentage.toFixed(1)}%)`}
              style={{
                flexBasis: `${percentage}%`,
                backgroundColor: GRADE_COLORS[grade],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "flex-basis 0.3s ease",
                minWidth: percentage > 0 ? "4px" : "0",
              }}
            >
              {/* 仅当宽度足够时显示数字 */}
              {showLabels && percentage >= 10 && (
                <span
                  style={{
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 600,
                    textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                  }}
                >
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* 图例（可选） */}
      {showLabels && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            marginTop: "8px",
            fontSize: "12px",
          }}
        >
          {grades.map((grade) => {
            const count = distribution[grade]
            if (count === 0) return null
            
            return (
              <div
                key={grade}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "2px",
                    backgroundColor: GRADE_COLORS[grade],
                  }}
                />
                <span style={{ color: "var(--orca-color-text-2)" }}>
                  {GRADE_LABELS[grade]}: {count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default GradeDistributionBar
