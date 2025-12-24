/**
 * 趋势线组件
 * 
 * 使用 SVG 实现轻量级折线图，用于显示累计趋势
 * 
 * Requirements: 2.3
 */

const { useState, useMemo } = window.React

export interface LineChartData {
  label: string
  value: number
}

export interface LineChartProps {
  data: LineChartData[]
  width?: number
  height?: number
  lineColor?: string
  fillColor?: string
  showArea?: boolean
  showDots?: boolean
  showLabels?: boolean
  showValues?: boolean
  maxValue?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  onPointClick?: (item: LineChartData, index: number) => void
}

export function LineChart({
  data,
  width = 400,
  height = 200,
  lineColor = "var(--orca-color-primary-5)",
  fillColor = "var(--orca-color-primary-2)",
  showArea = true,
  showDots = true,
  showLabels = true,
  showValues = false,
  maxValue,
  formatValue = (v) => String(v),
  formatLabel = (l) => l,
  onPointClick
}: LineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  // 计算图表尺寸
  const padding = { top: 20, right: 20, bottom: showLabels ? 40 : 20, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // 计算最大值
  const computedMaxValue = useMemo(() => {
    if (maxValue !== undefined) return maxValue
    const max = Math.max(...data.map(d => d.value), 0)
    return max === 0 ? 1 : max * 1.1
  }, [data, maxValue])

  // 计算点的位置
  const points = useMemo(() => {
    if (data.length === 0) return []
    const xStep = data.length > 1 ? chartWidth / (data.length - 1) : 0
    return data.map((item, index) => ({
      ...item,
      x: padding.left + index * xStep,
      y: height - padding.bottom - (item.value / computedMaxValue) * chartHeight
    }))
  }, [data, chartWidth, chartHeight, computedMaxValue, padding, height])

  // 生成折线路径
  const linePath = useMemo(() => {
    if (points.length === 0) return ""
    return points.map((p: typeof points[number], i: number) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  }, [points])

  // 生成填充区域路径
  const areaPath = useMemo(() => {
    if (points.length === 0) return ""
    const baseline = height - padding.bottom
    return `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
  }, [linePath, points, height, padding.bottom])

  // 计算 Y 轴刻度
  const yTicks = useMemo(() => {
    const tickCount = 5
    const step = computedMaxValue / tickCount
    return Array.from({ length: tickCount + 1 }, (_, i) => Math.round(step * i))
  }, [computedMaxValue])

  const handleMouseEnter = (index: number, _event: React.MouseEvent) => {
    setHoveredIndex(index)
    const point = points[index]
    setTooltipPos({ x: point.x, y: point.y - 10 })
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

        {/* 填充区域 */}
        {showArea && (
          <path
            d={areaPath}
            fill={fillColor}
            className="srs-chart-line-area"
          />
        )}

        {/* 折线 */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="srs-chart-line-path"
        />

        {/* 数据点 */}
        {showDots && points.map((point: typeof points[number], index: number) => {
          const isHovered = hoveredIndex === index
          return (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r={isHovered ? 6 : 4}
                fill={lineColor}
                stroke="var(--orca-color-bg-1)"
                strokeWidth={2}
                className="srs-chart-line-dot"
                style={{
                  cursor: onPointClick ? "pointer" : "default",
                  animationDelay: `${0.5 + index * 0.03}s`
                }}
                onMouseEnter={(e) => handleMouseEnter(index, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onPointClick?.(point, index)}
              />

              {/* X 轴标签 */}
              {showLabels && (
                <text
                  x={point.x}
                  y={height - padding.bottom + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--orca-color-text-3)"
                >
                  {formatLabel(point.label)}
                </text>
              )}

              {/* 点上方数值 */}
              {showValues && (
                <text
                  x={point.x}
                  y={point.y - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--orca-color-text-2)"
                >
                  {formatValue(point.value)}
                </text>
              )}
            </g>
          )
        })}

        {/* 悬停时的垂直参考线 */}
        {hoveredIndex !== null && (
          <line
            x1={points[hoveredIndex].x}
            y1={padding.top}
            x2={points[hoveredIndex].x}
            y2={height - padding.bottom}
            stroke={lineColor}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.5}
          />
        )}
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

export default LineChart
