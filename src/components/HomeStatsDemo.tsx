/**
 * Flash Home 顶部统计卡片演示组件
 * 
 * 展示未学习、学习中、待复习三个统计卡片的显示效果
 */

const { useState } = window.React

// 统计卡片组件
function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "12px 16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      minWidth: "80px"
    }}>
      <div style={{
        fontSize: "24px",
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

// 模拟统计数据
const mockStats = [
  {
    name: "轻量学习",
    newCount: 5,
    todayCount: 8,
    overdueCount: 2,
    description: "少量卡片，适合新手"
  },
  {
    name: "中等学习",
    newCount: 25,
    todayCount: 30,
    overdueCount: 15,
    description: "中等数量，日常学习"
  },
  {
    name: "重度学习",
    newCount: 50,
    todayCount: 80,
    overdueCount: 45,
    description: "大量卡片，密集学习"
  }
]

export default function HomeStatsDemo() {
  const [selectedStats, setSelectedStats] = useState(mockStats[1])

  return (
    <div style={{
      padding: "20px",
      maxWidth: "800px",
      margin: "0 auto"
    }}>
      <h2 style={{
        fontSize: "24px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)",
        marginBottom: "20px"
      }}>
        Flash Home 顶部统计演示
      </h2>

      {/* 功能说明 */}
      <div style={{
        marginBottom: "20px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)"
      }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          marginBottom: "8px"
        }}>
          统计卡片说明
        </h3>
        <ul style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          lineHeight: "1.5",
          paddingLeft: "20px"
        }}>
          <li><strong>未学习</strong>：新卡数量，从未复习过的卡片</li>
          <li><strong>学习中</strong>：今天到期的复习卡片，需要今天复习</li>
          <li><strong>待复习</strong>：已到期但不是今天到期的卡片，积压的复习任务</li>
        </ul>
      </div>

      {/* 场景选择 */}
      <div style={{
        marginBottom: "20px",
        display: "flex",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        <span style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          alignSelf: "center"
        }}>
          选择学习场景：
        </span>
        {mockStats.map((stats, index) => (
          <button
            key={index}
            onClick={() => setSelectedStats(stats)}
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              border: "1px solid",
              borderColor: selectedStats === stats
                ? "var(--orca-color-primary-5)"
                : "var(--orca-color-border-1)",
              backgroundColor: selectedStats === stats
                ? "var(--orca-color-primary-1)"
                : "var(--orca-color-bg-1)",
              color: selectedStats === stats
                ? "var(--orca-color-primary-6)"
                : "var(--orca-color-text-2)",
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            {stats.name}
          </button>
        ))}
      </div>

      {/* 统计卡片展示 */}
      <div style={{
        padding: "24px",
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        border: "1px solid var(--orca-color-border-1)",
        marginBottom: "20px"
      }}>
        <div style={{
          display: "flex",
          gap: "12px",
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: "16px"
        }}>
          <StatCard 
            label="未学习" 
            value={selectedStats.newCount} 
            color="var(--orca-color-primary-6)" 
          />
          <StatCard 
            label="学习中" 
            value={selectedStats.todayCount} 
            color="var(--orca-color-danger-6)" 
          />
          <StatCard 
            label="待复习" 
            value={selectedStats.overdueCount} 
            color="var(--orca-color-success-6)" 
          />
        </div>
        
        <div style={{
          textAlign: "center",
          fontSize: "13px",
          color: "var(--orca-color-text-3)"
        }}>
          {selectedStats.description}
        </div>
      </div>

      {/* 颜色说明 */}
      <div style={{
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)"
      }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          marginBottom: "8px"
        }}>
          颜色含义
        </h3>
        <div style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          fontSize: "14px",
          color: "var(--orca-color-text-2)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "12px",
              height: "12px",
              backgroundColor: "var(--orca-color-primary-6)",
              borderRadius: "2px"
            }} />
            <span>蓝色 - 未学习（新内容）</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "12px",
              height: "12px",
              backgroundColor: "var(--orca-color-danger-6)",
              borderRadius: "2px"
            }} />
            <span>红色 - 学习中（今日任务）</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "12px",
              height: "12px",
              backgroundColor: "var(--orca-color-success-6)",
              borderRadius: "2px"
            }} />
            <span>绿色 - 待复习（积压任务）</span>
          </div>
        </div>
      </div>

      {/* 使用建议 */}
      <div style={{
        marginTop: "20px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)"
      }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          marginBottom: "8px"
        }}>
          学习建议
        </h3>
        <div style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          lineHeight: "1.5"
        }}>
          <p><strong>优先级建议：</strong></p>
          <ol style={{ paddingLeft: "20px", marginTop: "4px" }}>
            <li><strong>待复习</strong>（绿色）- 优先处理积压的复习任务</li>
            <li><strong>学习中</strong>（红色）- 完成今天的复习计划</li>
            <li><strong>未学习</strong>（蓝色）- 有余力时学习新内容</li>
          </ol>
          <p style={{ marginTop: "12px" }}>
            <strong>平衡建议：</strong>保持待复习数量较低，避免积压过多任务影响学习效果。
          </p>
        </div>
      </div>
    </div>
  )
}