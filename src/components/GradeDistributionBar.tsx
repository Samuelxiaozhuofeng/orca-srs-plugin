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

/**
 * 评分语义色由 CSS 承担（`srs-review.css` 的 `.srs-grade-dist__segment--*` /
 * `.srs-grade-dist__swatch--*`），取自 Orca 主题变量：
 * Again=danger / Hard=warning / Good=primary / Easy=success，
 * 与评分按钮组保持同一语义映射（见 模块文档/SRS_UI设计规范.md）。
 */

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

  // 空状态：显示灰色占位条（height 为 prop 传入的运行时几何量，保留内联）
  if (total === 0) {
    return (
      <div
        className="srs-grade-distribution-bar srs-grade-dist__track srs-grade-dist__track--empty"
        style={{ height: `${height}px` }}
      >
        <div className="srs-grade-dist__empty-text">
          暂无评分数据
        </div>
      </div>
    )
  }

  const grades = ["again", "hard", "good", "easy"] as const

  return (
    <div className="srs-grade-distribution-bar">
      {/* 颜色条 */}
      <div className="srs-grade-dist__track" style={{ height: `${height}px` }}>
        {grades.map((grade) => {
          const percentage = percentages[grade]
          const count = distribution[grade]

          // 跳过 0% 的部分
          if (percentage === 0) return null

          return (
            <div
              key={grade}
              title={`${GRADE_LABELS[grade]}: ${count} (${percentage.toFixed(1)}%)`}
              className={`srs-grade-dist__segment srs-grade-dist__segment--${grade}`}
              style={{ flexBasis: `${percentage}%` }}
            >
              {/* 仅当宽度足够时显示数字 */}
              {showLabels && percentage >= 10 && (
                <span className="srs-grade-dist__count">
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* 图例（可选） */}
      {showLabels && (
        <div className="srs-grade-dist__legend">
          {grades.map((grade) => {
            const count = distribution[grade]
            if (count === 0) return null

            return (
              <div key={grade} className="srs-grade-dist__legend-item">
                <div className={`srs-grade-dist__swatch srs-grade-dist__swatch--${grade}`} />
                <span>
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
