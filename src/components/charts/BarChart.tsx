/**
 * 基础柱状图组件
 * 
 * 使用 SVG 实现轻量级图表，支持悬停显示详情
 * 
 * Requirements: 2.1, 3.1, 5.1, 6.1
 */

const { useState, useMemo } = window.React

export interface BarChartData {
  label: string
  value: number
  color?: string
}

export interface BarChartProps {
  data: BarChartData[]
  width?: number
  height?: number
  barColor?: string
  showLabels?: boolean
  showValues?: boolean
  maxValue?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  onBarClick?: (item: BarChartData, index: number) => void
}

export function BarChart({
  data,
  width = 400,
  height = 200,
  barColor = "var(--orca-color-primary-5)",
  showLabels = true,
  showValues = false,
  maxValue,
  formatValue = (v) => String(v),
  formatLabel = (l) => l,
  onBarClick
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  // 计算图表尺寸
  const padding = { top: 20, right: 20, bottom: showLabels ? 40 : 20, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // 计算最大值
  const computedMaxValue = useMemo(() => {
    if (maxValue !== undefined) return maxValue
    const max = Math.max(...data.map(d => d.value), 0)
    return max === 0 ? 1 : max * 1.1 // 留出 10% 空间
  }, [data, maxValue])

  // 计算柱子宽度和间距
  const barCount = data.length
  const barGap = Math.min(8, chartWidth / barCount * 0.2)
  const barWidth = barCount > 0 ? (chartWidth - barGap * (barCount - 1)) / barCount : 0

  // 计算 Y 轴刻度
  const yTicks = useMemo(() => {
    const tickCount = 5
    const step = computedMaxValue / tickCount
    return Array.from({ length: tickCount + 1 }, (_, i) => Math.round(step * i))
  }, [computedMaxValue])

  const handleMouseEnter = (index: number, event: React.MouseEvent) => {
    setHoveredIndex(index)
    const rect = (event.target as SVGElement).getBoundingClientRect()
    const svgRect = (event.currentTarget.closest('svg') as SVGElement)?.getBoundingClientRect()
    if (svgRect) {
      setTooltipPos({
        x: rect.left - svgRect.left + rect.width / 2,
        y: rect.top - svgRect.top - 10
      })
    }
  }

  const handleMouseLeave = () => {
    setHoveredIndex(null)
    setTooltipPos(null)
  }

  if (data.length === 0) {
    return (
      <div style={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--orca-color-text-3)",
        fontSize: "14px"
      }}>
        暂无数据
      </div>
    )
  }

  return (
    <div style={{ position: "relative", width, height }}>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {/* Y 轴 */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="var(--orca-color-border-1)"
          strokeWidth={1}
        />

        {/* Y 轴刻度和网格线 */}
        {yTicks.map((tick: number, i: number) => {
          const y = height - padding.bottom - (tick / computedMaxValue) * chartHeight
          return (
            <g key={i}>
              <line
                x1={padding.left - 4}
                y1={y}
                x2={padding.left}
                y2={y}
                stroke="var(--orca-color-border-1)"
                strokeWidth={1}
              />
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--orca-color-border-1)"
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.5}
              />
              <text
                x={padding.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--orca-color-text-3)"
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* X 轴 */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="var(--orca-color-border-1)"
          strokeWidth={1}
        />

        {/* 柱子 */}
        {data.map((item, index) => {
          const x = padding.left + index * (barWidth + barGap)
          const barHeight = (item.value / computedMaxValue) * chartHeight
          const y = height - padding.bottom - barHeight
          const isHovered = hoveredIndex === index

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 0)}
                fill={item.color || barColor}
                opacity={isHovered ? 1 : 0.8}
                rx={2}
                ry={2}
                className="srs-chart-bar-animated srs-chart-bar-hover"
                style={{
                  cursor: onBarClick ? "pointer" : "default",
                  animationDelay: `${index * 0.05}s`
                }}
                onMouseEnter={(e) => handleMouseEnter(index, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onBarClick?.(item, index)}
              />

              {/* X 轴标签 */}
              {showLabels && (
                <text
                  x={x + barWidth / 2}
                  y={height - padding.bottom + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--orca-color-text-3)"
                  style={{
                    maxWidth: barWidth,
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {formatLabel(item.label)}
                </text>
              )}

              {/* 柱子上方数值 */}
              {showValues && item.value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--orca-color-text-2)"
                >
                  {formatValue(item.value)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* 悬停提示 */}
      {hoveredIndex !== null && tooltipPos && (
        <div
          className="srs-chart-tooltip-animated"
          style={{
            position: "absolute",
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
            backgroundColor: "var(--orca-color-bg-4)",
            color: "var(--orca-color-text-1)",
            padding: "6px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 100
          }}
        >
          <div style={{ fontWeight: 500 }}>{data[hoveredIndex].label}</div>
          <div style={{ color: "var(--orca-color-text-2)", marginTop: "2px" }}>
            {formatValue(data[hoveredIndex].value)}
          </div>
        </div>
      )}
    </div>
  )
}

export default BarChart
