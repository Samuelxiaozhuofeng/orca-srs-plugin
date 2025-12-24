/**
 * 饼图/环形图组件
 * 
 * 使用 SVG 实现轻量级饼图，支持点击交互
 * 
 * Requirements: 4.2, 7.2
 */

const { useState, useMemo } = window.React

export interface PieChartData {
  key: string
  value: number
  color: string
  label?: string
}

export interface PieChartProps {
  data: PieChartData[]
  width?: number
  height?: number
  innerRadius?: number  // 0 为实心饼图，> 0 为环形图
  showLabels?: boolean
  showLegend?: boolean
  showPercentage?: boolean
  formatValue?: (value: number) => string
  onSliceClick?: (item: PieChartData, index: number) => void
}

// 计算扇形路径
function describeArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle)
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle)
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle)
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle)

  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

  if (innerRadius === 0) {
    // 实心饼图
    return [
      "M", cx, cy,
      "L", endOuter.x, endOuter.y,
      "A", outerRadius, outerRadius, 0, largeArcFlag, 1, startOuter.x, startOuter.y,
      "Z"
    ].join(" ")
  }

  // 环形图
  return [
    "M", startOuter.x, startOuter.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ")
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  }
}

export function PieChart({
  data,
  width = 300,
  height = 300,
  innerRadius = 0,
  showLabels = false,
  showLegend = true,
  showPercentage = true,
  formatValue = (v) => String(v),
  onSliceClick
}: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // 计算总值
  const total = useMemo(() => {
    return data.reduce((sum, d) => sum + d.value, 0)
  }, [data])

  // 计算图表尺寸
  const legendHeight = showLegend ? Math.ceil(data.length / 2) * 24 + 16 : 0
  const chartSize = Math.min(width, height - legendHeight)
  const cx = width / 2
  const cy = (height - legendHeight) / 2
  const outerRadius = chartSize / 2 - 20
  const computedInnerRadius = innerRadius > 0 ? Math.min(innerRadius, outerRadius * 0.8) : 0

  // 计算每个扇形的角度
  const slices = useMemo(() => {
    let currentAngle = 0
    return data.map((item, index) => {
      const percentage = total > 0 ? item.value / total : 0
      const angle = percentage * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle

      // 计算标签位置（扇形中心）
      const midAngle = startAngle + angle / 2
      const labelRadius = (outerRadius + computedInnerRadius) / 2
      const labelPos = polarToCartesian(cx, cy, labelRadius, midAngle)

      return {
        ...item,
        index,
        startAngle,
        endAngle,
        percentage,
        labelPos
      }
    })
  }, [data, total, cx, cy, outerRadius, computedInnerRadius])

  const handleMouseEnter = (index: number) => {
    setHoveredIndex(index)
  }

  const handleMouseLeave = () => {
    setHoveredIndex(null)
  }

  if (data.length === 0 || total === 0) {
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
      <svg width={width} height={height - legendHeight} style={{ overflow: "visible" }}>
        {/* 扇形 */}
        {slices.map((slice: typeof slices[number]) => {
          const isHovered = hoveredIndex === slice.index
          const scale = isHovered ? 1.05 : 1
          const transform = isHovered
            ? `translate(${cx * (1 - scale)}, ${cy * (1 - scale)}) scale(${scale})`
            : undefined

          return (
            <g key={slice.key} transform={transform} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <path
                d={describeArc(
                  cx,
                  cy,
                  outerRadius,
                  computedInnerRadius,
                  slice.startAngle,
                  slice.endAngle
                )}
                fill={slice.color}
                opacity={isHovered ? 1 : 0.85}
                className="srs-chart-pie-slice srs-chart-pie-hover"
                style={{
                  cursor: onSliceClick ? "pointer" : "default",
                  animationDelay: `${slice.index * 0.1}s`
                }}
                onMouseEnter={() => handleMouseEnter(slice.index)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onSliceClick?.(slice, slice.index)}
              />

              {/* 扇形内标签 */}
              {showLabels && slice.percentage > 0.05 && (
                <text
                  x={slice.labelPos.x}
                  y={slice.labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="white"
                  fontWeight={500}
                  style={{ pointerEvents: "none" }}
                >
                  {showPercentage
                    ? `${Math.round(slice.percentage * 100)}%`
                    : formatValue(slice.value)}
                </text>
              )}
            </g>
          )
        })}

        {/* 中心文字（环形图） */}
        {computedInnerRadius > 0 && (
          <g>
            <text
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={20}
              fontWeight={600}
              fill="var(--orca-color-text-1)"
            >
              {formatValue(total)}
            </text>
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12}
              fill="var(--orca-color-text-3)"
            >
              总计
            </text>
          </g>
        )}
      </svg>

      {/* 图例 */}
      {showLegend && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 16px",
          marginTop: "8px",
          padding: "0 8px"
        }}>
          {data.map((item, index) => {
            const percentage = total > 0 ? (item.value / total * 100).toFixed(1) : "0"
            const isHovered = hoveredIndex === index

            return (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: isHovered ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
                  cursor: onSliceClick ? "pointer" : "default",
                  transition: "color 0.15s ease"
                }}
                onMouseEnter={() => handleMouseEnter(index)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onSliceClick?.(item, index)}
              >
                <div style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: item.color,
                  borderRadius: "2px",
                  flexShrink: 0
                }} />
                <span>{item.label || item.key}</span>
                <span style={{ color: "var(--orca-color-text-3)" }}>
                  {formatValue(item.value)} ({percentage}%)
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 悬停提示 */}
      {hoveredIndex !== null && (
        <div
          className="srs-chart-tooltip-animated"
          style={{
            position: "absolute",
            left: cx,
            top: cy - outerRadius - 40,
            transform: "translateX(-50%)",
            backgroundColor: "var(--orca-color-bg-4)",
            color: "var(--orca-color-text-1)",
            padding: "8px 12px",
            borderRadius: "4px",
            fontSize: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 100
          }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}>
            <div style={{
              width: "10px",
              height: "10px",
              backgroundColor: data[hoveredIndex].color,
              borderRadius: "2px"
            }} />
            <span style={{ fontWeight: 500 }}>
              {data[hoveredIndex].label || data[hoveredIndex].key}
            </span>
          </div>
          <div style={{ marginTop: "4px", color: "var(--orca-color-text-2)" }}>
            {formatValue(data[hoveredIndex].value)} ({(data[hoveredIndex].value / total * 100).toFixed(1)}%)
          </div>
        </div>
      )}
    </div>
  )
}

export default PieChart
