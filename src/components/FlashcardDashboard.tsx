/**
 * Flashcard Dashboard - RemNote 风格的闪卡主页
 * 
 * 包含：
 * - 问候语和每周摘要
 * - 学习热力图（GitHub 风格）
 * - 卡片增长趋势
 * - 未来到期预测
 */

import type { TodayStatistics, ReviewHistory, FutureForecast } from "../srs/types"

const { useMemo } = window.React
const { Button } = orca.components

// ========================================
// 类型定义
// ========================================

interface FlashcardDashboardProps {
  pluginName: string
  todayStats: TodayStatistics | null
  reviewHistory: ReviewHistory | null
  futureForecast: FutureForecast | null
  totalCards: number
  newCards: number
  dueCards: number
  onStartReview: () => void
  onRefresh: () => void
  isLoading: boolean
}

interface HeatmapDay {
  date: Date
  count: number
  level: 0 | 1 | 2 | 3 | 4  // 0=无, 1=少, 2=中, 3=多, 4=很多
}

// ========================================
// 工具函数
// ========================================

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 12) return "早上好"
  if (hour < 14) return "中午好"
  if (hour < 18) return "下午好"
  if (hour < 22) return "晚上好"
  return "夜深了"
}

function getMotivationalMessage(dueCards: number, newCards: number): string {
  if (dueCards === 0 && newCards === 0) {
    return "今天的学习任务已完成！"
  }
  if (dueCards > 50) {
    return "有不少卡片等待复习，加油！"
  }
  if (dueCards > 0) {
    return "开始今天的学习吧"
  }
  return "探索新知识的时候到了"
}

// ========================================
// 子组件：问候卡片
// ========================================

interface GreetingCardProps {
  dueCards: number
  newCards: number
  reviewHistory: ReviewHistory | null
  onStartReview: () => void
}

function GreetingCard({ dueCards, newCards, reviewHistory, onStartReview }: GreetingCardProps) {
  const greeting = getGreeting()
  const message = getMotivationalMessage(dueCards, newCards)
  const totalDue = dueCards + newCards

  // 计算最近7天的平均复习数
  const last7DaysAvg = useMemo(() => {
    if (!reviewHistory || reviewHistory.days.length === 0) return 0
    const last7 = reviewHistory.days.slice(-7)
    const total = last7.reduce((sum, day) => sum + day.total, 0)
    return (total / 7).toFixed(1)
  }, [reviewHistory])

  // 最近7天的柱状图数据
  const weekData = useMemo(() => {
    const days = ["六", "日", "一", "二", "三", "四", "五"]
    const today = new Date()
    const result: { day: string; count: number; isToday: boolean }[] = []
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dayOfWeek = date.getDay()
      
      // 从 reviewHistory 中找到对应日期的数据
      let count = 0
      if (reviewHistory) {
        const historyDay = reviewHistory.days.find(d => {
          const hDate = new Date(d.date)
          return hDate.toDateString() === date.toDateString()
        })
        if (historyDay) {
          count = historyDay.total
        }
      }
      
      result.push({
        day: days[dayOfWeek],
        count,
        isToday: i === 0
      })
    }
    return result
  }, [reviewHistory])

  const maxCount = Math.max(...weekData.map((d: { day: string; count: number; isToday: boolean }) => d.count), 1)

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "16px"
    }}>
      {/* 左侧：问候和图表 */}
      <div style={{
        padding: "20px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "12px",
        border: "1px solid var(--orca-color-border-1)",
        userSelect: "none"
      }}>
        <h2 style={{
          margin: "0 0 4px 0",
          fontSize: "20px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)"
        }}>
          {greeting}
        </h2>
        <p style={{
          margin: "0 0 20px 0",
          fontSize: "14px",
          color: "var(--orca-color-text-3)"
        }}>
          {message}
        </p>

        {/* 最近7天柱状图 */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          height: "80px",
          marginBottom: "12px"
        }}>
          {weekData.map((d: { day: string; count: number; isToday: boolean }, i: number) => (
            <div key={i} style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px"
            }}>
              <div style={{
                width: "100%",
                height: `${Math.max((d.count / maxCount) * 60, 4)}px`,
                backgroundColor: d.isToday ? "#6366f1" : "var(--orca-color-primary-3)",
                borderRadius: "4px 4px 0 0",
                transition: "height 0.3s ease"
              }} />
              <span style={{
                fontSize: "11px",
                color: d.isToday ? "#6366f1" : "var(--orca-color-text-3)"
              }}>
                {d.day}
              </span>
            </div>
          ))}
        </div>

        {/* 统计信息 */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "12px",
          borderTop: "1px solid var(--orca-color-border-1)"
        }}>
          <div>
            <span style={{ fontSize: "12px", color: "#6366f1" }}>日均复习</span>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#6366f1" }}>
              {last7DaysAvg} <span style={{ fontSize: "12px", fontWeight: 400 }}>张</span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--orca-color-text-3)" }}>最近 7 天</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>🎯 今日目标:</span>
            <span style={{ fontSize: "12px", color: "var(--orca-color-text-2)", marginLeft: "4px" }}>
              {totalDue} 张卡片
            </span>
          </div>
        </div>
      </div>

      {/* 右侧：每周摘要 */}
      <WeeklySummaryCard 
        reviewHistory={reviewHistory}
        onStartReview={onStartReview}
        dueCards={dueCards}
      />
    </div>
  )
}

// ========================================
// 子组件：每周摘要
// ========================================

interface WeeklySummaryCardProps {
  reviewHistory: ReviewHistory | null
  onStartReview: () => void
  dueCards: number
}

function WeeklySummaryCard({ reviewHistory, onStartReview, dueCards }: WeeklySummaryCardProps) {
  // 计算本周统计
  const weekStats = useMemo(() => {
    if (!reviewHistory) {
      return { timeStudied: 0, cardsStudied: 0, again: 0, hard: 0, good: 0, easy: 0 }
    }
    
    const last7 = reviewHistory.days.slice(-7)
    const cardsStudied = last7.reduce((sum, d) => sum + d.total, 0)
    const again = last7.reduce((sum, d) => sum + d.again, 0)
    const hard = last7.reduce((sum, d) => sum + d.hard, 0)
    const good = last7.reduce((sum, d) => sum + d.good, 0)
    const easy = last7.reduce((sum, d) => sum + d.easy, 0)
    
    return { timeStudied: 0, cardsStudied, again, hard, good, easy }
  }, [reviewHistory])

  const total = weekStats.again + weekStats.hard + weekStats.good + weekStats.easy
  const getPercent = (val: number) => total > 0 ? Math.round((val / total) * 100) : 0

  return (
    <div style={{
      padding: "20px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "12px",
      border: "1px solid var(--orca-color-border-1)",
      userSelect: "none"
    }}>
      <h3 style={{
        margin: "0 0 16px 0",
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)"
      }}>
        本周摘要
      </h3>

      {/* 时间和卡片统计 */}
      <div style={{
        display: "flex",
        gap: "24px",
        marginBottom: "16px"
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "var(--orca-color-text-3)" }}>已复习卡片</div>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "var(--orca-color-text-1)" }}>
            {weekStats.cardsStudied} <span style={{ fontSize: "14px", fontWeight: 400 }}>张</span>
          </div>
        </div>
      </div>

      {/* 表现分布 */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", color: "var(--orca-color-text-2)", marginBottom: "8px" }}>
          复习表现分布
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <PerformanceRow icon="❌" label="忘记了" percent={getPercent(weekStats.again)} color="#ef4444" />
          <PerformanceRow icon="😐" label="有点难" percent={getPercent(weekStats.hard)} color="#f97316" />
          <PerformanceRow icon="😊" label="想起来了" percent={getPercent(weekStats.good)} color="#22c55e" />
          <PerformanceRow icon="🎉" label="很简单" percent={getPercent(weekStats.easy)} color="#3b82f6" />
        </div>
      </div>

      {/* 开始复习按钮 */}
      {dueCards > 0 && (
        <Button
          variant="solid"
          onClick={onStartReview}
          style={{
            width: "100%",
            padding: "10px",
            fontSize: "14px",
            backgroundColor: "#6366f1",
            borderRadius: "8px"
          }}
        >
          开始今日复习 · {dueCards} 张
        </Button>
      )}
    </div>
  )
}

function PerformanceRow({ icon, label, percent, color }: {
  icon: string
  label: string
  percent: number
  color: string
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }}>
      <span style={{ fontSize: "14px" }}>{icon}</span>
      <span style={{ fontSize: "13px", color: "var(--orca-color-text-2)", flex: 1 }}>{label}</span>
      <div style={{
        width: "80px",
        height: "6px",
        backgroundColor: "var(--orca-color-bg-3)",
        borderRadius: "3px",
        overflow: "hidden"
      }}>
        <div style={{
          width: `${percent}%`,
          height: "100%",
          backgroundColor: color,
          borderRadius: "3px",
          transition: "width 0.3s ease"
        }} />
      </div>
      <span style={{ fontSize: "12px", color: "var(--orca-color-text-3)", width: "40px", textAlign: "right" }}>
        {percent}%
      </span>
    </div>
  )
}

// ========================================
// 子组件：学习热力图
// ========================================

interface HeatmapCardProps {
  reviewHistory: ReviewHistory | null
}

function HeatmapCard({ reviewHistory }: HeatmapCardProps) {
  // 生成热力图数据（最近6个月）
  const heatmapData = useMemo(() => {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setMonth(startDate.getMonth() - 6)
    startDate.setDate(1)
    
    // 创建日期到复习次数的映射
    const reviewMap = new Map<string, number>()
    if (reviewHistory) {
      for (const day of reviewHistory.days) {
        const key = new Date(day.date).toDateString()
        reviewMap.set(key, day.total)
      }
    }

    // 生成热力图数据
    const weeks: HeatmapDay[][] = []
    let currentWeek: HeatmapDay[] = []
    const current = new Date(startDate)
    
    // 填充第一周开始前的空白
    const firstDayOfWeek = current.getDay()
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push({ date: new Date(0), count: -1, level: 0 })
    }

    while (current <= today) {
      const count = reviewMap.get(current.toDateString()) || 0
      let level: 0 | 1 | 2 | 3 | 4 = 0
      if (count > 0) level = 1
      if (count >= 10) level = 2
      if (count >= 20) level = 3
      if (count >= 30) level = 4

      currentWeek.push({
        date: new Date(current),
        count,
        level
      })

      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }

      current.setDate(current.getDate() + 1)
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek)
    }

    return weeks
  }, [reviewHistory])

  // 计算统计
  const stats = useMemo(() => {
    let daysStudied = 0
    let bestStreak = 0
    let tempStreak = 0

    const allDays = heatmapData.flat().filter((d: HeatmapDay) => d.count >= 0)
    
    for (let i = 0; i < allDays.length; i++) {
      if (allDays[i].count > 0) {
        daysStudied++
        tempStreak++
        if (tempStreak > bestStreak) bestStreak = tempStreak
      } else {
        tempStreak = 0
      }
    }

    return { daysStudied, bestStreak }
  }, [heatmapData])

  // 月份标签 - 简化版，只显示每个月第一周的位置
  const monthLabels = useMemo(() => {
    const labels: { month: string; weekIndex: number }[] = []
    let lastMonth = -1
    
    heatmapData.forEach((week: HeatmapDay[], weekIndex: number) => {
      const firstValidDay = week.find((d: HeatmapDay) => d.count >= 0)
      if (firstValidDay && firstValidDay.date.getMonth() !== lastMonth) {
        lastMonth = firstValidDay.date.getMonth()
        const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
        labels.push({ month: months[lastMonth], weekIndex })
      }
    })
    
    return labels
  }, [heatmapData])

  // 使用固定颜色，不依赖 CSS 变量
  const levelColors = [
    "#ebedf0",  // 0: 无 - 浅灰色
    "#c6e48b",  // 1: 少
    "#7bc96f",  // 2: 中
    "#239a3b",  // 3: 多
    "#196127"   // 4: 很多
  ]

  return (
    <div style={{
      padding: "20px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "12px",
      border: "1px solid var(--orca-color-border-1)",
      userSelect: "none"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "16px"
      }}>
        <h3 style={{
          margin: 0,
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)"
        }}>
          学习历史
        </h3>
        <div style={{ display: "flex", gap: "24px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--orca-color-text-3)" }}>学习天数</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" }}>
              {stats.daysStudied} <span style={{ fontSize: "12px", fontWeight: 400 }}>天</span>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--orca-color-text-3)" }}>最长连续</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" }}>
              {stats.bestStreak} <span style={{ fontSize: "12px", fontWeight: 400 }}>天</span>
            </div>
          </div>
        </div>
      </div>

      {/* 热力图容器 */}
      <div style={{ overflowX: "auto" }}>
        {/* 月份标签 */}
        <div style={{
          display: "flex",
          marginLeft: "20px",
          marginBottom: "4px"
        }}>
          {monthLabels.map((label: { month: string; weekIndex: number }, i: number) => (
            <span
              key={i}
              style={{
                fontSize: "11px",
                color: "var(--orca-color-text-3)",
                width: `${(monthLabels[i + 1]?.weekIndex || heatmapData.length) - label.weekIndex}` + "2px",
                minWidth: "36px"
              }}
            >
              {label.month}
            </span>
          ))}
        </div>

        {/* 热力图主体 */}
        <div style={{ display: "flex", gap: "2px" }}>
          {/* 星期标签 */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            marginRight: "4px"
          }}>
            {["一", "", "三", "", "五", "", "日"].map((day, i) => (
              <div
                key={i}
                style={{
                  width: "12px",
                  height: "10px",
                  fontSize: "9px",
                  color: "var(--orca-color-text-3)",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 热力图格子 */}
          {heatmapData.map((week: HeatmapDay[], weekIndex: number) => (
            <div
              key={weekIndex}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px"
              }}
            >
              {week.map((day: HeatmapDay, dayIndex: number) => (
                <div
                  key={dayIndex}
                  style={{
                    width: "10px",
                    height: "10px",
                    backgroundColor: day.count < 0 ? "transparent" : levelColors[day.level],
                    borderRadius: "2px"
                  }}
                  title={day.count >= 0 ? `${day.date.toLocaleDateString()}: ${day.count} 次复习` : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "4px",
        marginTop: "12px",
        fontSize: "11px",
        color: "var(--orca-color-text-3)"
      }}>
        <span>无</span>
        {levelColors.map((color, i) => (
          <div
            key={i}
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: color,
              borderRadius: "2px"
            }}
          />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}

// ========================================
// 子组件：未来到期预测
// ========================================

interface UpcomingCardsProps {
  forecast: FutureForecast | null
}

function UpcomingCards({ forecast }: UpcomingCardsProps) {
  const chartData = useMemo(() => {
    if (!forecast) return []
    return forecast.days.slice(0, 30).map(day => ({
      date: day.date,
      count: day.reviewDue + day.newAvailable
    }))
  }, [forecast])

  const totalCards = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData.reduce((sum: number, d: { date: Date; count: number }) => sum + d.count, 0)
  }, [chartData])

  const maxCount = Math.max(...chartData.map((d: { date: Date; count: number }) => d.count), 1)

  if (!forecast || chartData.length === 0) {
    return null
  }

  return (
    <div style={{
      padding: "20px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "12px",
      border: "1px solid var(--orca-color-border-1)",
      userSelect: "none"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "16px"
      }}>
        <h3 style={{
          margin: 0,
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)"
        }}>
          未来 30 天到期预测
        </h3>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "var(--orca-color-text-3)" }}>总计</div>
          <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" }}>
            {totalCards} <span style={{ fontSize: "12px", fontWeight: 400 }}>张</span>
          </div>
        </div>
      </div>

      {/* 简化的柱状图 - 不显示 X 轴标签 */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "3px",
        height: "80px"
      }}>
        {chartData.map((d: { date: Date; count: number }, i: number) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 8 : 2)}%`,
              backgroundColor: d.count > 0 ? "#22c55e" : "#e5e7eb",
              borderRadius: "2px 2px 0 0",
              minWidth: "6px"
            }}
            title={`${(d.date.getMonth() + 1)}/${d.date.getDate()}: ${d.count} 张卡片`}
          />
        ))}
      </div>

      {/* 简化的日期范围显示 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: "8px",
        fontSize: "11px",
        color: "var(--orca-color-text-3)"
      }}>
        <span>今天</span>
        <span>30 天后</span>
      </div>
    </div>
  )
}

// ========================================
// 主组件
// ========================================

export default function FlashcardDashboard({
  reviewHistory,
  futureForecast,
  newCards,
  dueCards,
  onStartReview,
  isLoading
}: FlashcardDashboardProps) {
  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "200px",
        color: "var(--orca-color-text-3)"
      }}>
        加载中...
      </div>
    )
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    }}>
      {/* 问候和每周摘要 */}
      <GreetingCard
        dueCards={dueCards}
        newCards={newCards}
        reviewHistory={reviewHistory}
        onStartReview={onStartReview}
      />

      {/* 学习热力图 */}
      <HeatmapCard
        reviewHistory={reviewHistory}
      />

      {/* 未来到期预测 */}
      <UpcomingCards forecast={futureForecast} />
    </div>
  )
}
