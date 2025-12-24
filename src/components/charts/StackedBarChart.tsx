/**
 * 堆叠柱状图组件
 * 
 * 使用 SVG 实现轻量级堆叠柱状图，支持多色堆叠显示
 * 
 * Requirements: 3.2
 */

const { useState, useMemo } = window.React

export interface StackedBarSegment {
  key: string
  value: number
  color: string
  label?: string
}

export interface StackedBarData {
  label: string
  segments: StackedBarSegment[]
}

export interface StackedBarChartProps {
  data: StackedBarData[]
  width?: number
  height?: number
  showLabels?: boolean
  showLegend?: boolean
  legendItems?: { key: string; label: string; color: string }[]
  maxValue?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  onSegmentClick?: (item: StackedBarData, segment: StackedBarSegment, index: number) => void
}

export function StackedBarChart({
  data,
  width = 400,
  height = 200,
  showLabels = true,
  showLegend = true,
  legendItems,
  maxValue,
  formatValue = (v) => String(v),
  formatLabel = (l) => l,
  onSegmentClick
}: StackedBarChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<{
    barIndex: number
    segmentKey: string
  } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [tooltipData, setTooltipData] = useState<{
    label: string
    segments: StackedBarSegment[]
    total: number
  } | null>(null)

  // 计算图表尺寸
  const legendHeight = showLegend ? 30 : 0
  const padding = { top: 20, right: 20, bottom: showLabels ? 40 : 20, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom - legendHeight

  // 计算每个柱子的总高度
  const barTotals = useMemo(() => {
    return data.map(d => d.segments.reduce((sum, s) => sum + s.value, 0))
  }, [data])

  // 计算最大值
  const computedMaxValue = useMemo(() => {
    if (maxValue !== undefined) return maxValue
    const max = Math.max(...barTotals, 0)
    return max === 0 ? 1 : max * 1.1
  }, [barTotals, maxValue])

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

  // 获取图例项
  const legend = useMemo(() => {
    if (legendItems) return legendItems
    // 从数据中提取唯一的 segment keys
    const keys = new Map<string, { label: string; color: string }>()
    data.forEach(d => {
      d.segments.forEach(s => {
        if (!keys.has(s.key)) {
          keys.set(s.key, { label: s.label || s.key, color: s.color })
        }
      })
    })
    return Array.from(keys.entries()).map(([key, { label, color }]) => ({
      key,
      label,
      color
    }))
  }, [data, legendItems])

  const handleMouseEnter = (barIndex: number, segmentKey: string, event: React.MouseEvent) => {
    setHoveredSegment({ barIndex, segmentKey })
    const rect = (event.target as SVGElement).getBoundingClientRect()
    const svgRect = (event.currentTarget.closest('svg') as SVGElement)?.getBoundingClientRect()
    if (svgRect) {
      setTooltipPos({
        x: rect.left - svgRect.left + rect.width / 2,
        y: rect.top - svgRect.top - 10
      })
    }
    setTooltipData({
      label: data[barIndex].label,
      segments: data[barIndex].segments,
      total: barTotals[barIndex]
    })
  }

  const handleMouseLeave = () => {
    setHoveredSegment(null)
    setTooltipPos(null)
    setTooltipData(null)
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
      <svg width={width} height={height - legendHeight} style={{ overflow: "visible" }}>
        {/* Y 轴 */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom - legendHeight}
          stroke="var(--orca-color-border-1)"
          strokeWidth={1}
        />

        {/* Y 轴刻度和网格线 */}
        {yTicks.map((tick: number, i: number) => {
          const y = height - padding.bottom - legendHeight - (tick / computedMaxValue) * chartHeight
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
          y1={height - padding.bottom - legendHeight}
          x2={width - padding.right}
          y2={height - padding.bottom - legendHeight}
          stroke="var(--orca-color-border-1)"
          strokeWidth={1}
        />

        {/* 堆叠柱子 */}
        {data.map((item, barIndex) => {
          const x = padding.left + barIndex * (barWidth + barGap)
          let currentY = height - padding.bottom - legendHeight

          return (
            <g key={barIndex}>
              {item.segments.map((segment, segIndex) => {
                const segmentHeight = (segment.value / computedMaxValue) * chartHeight
                currentY -= segmentHeight
                const isHovered = hoveredSegment?.barIndex === barIndex &&
                  hoveredSegment?.segmentKey === segment.key

                return (
                  <rect
                    key={segIndex}
                    x={x}
                    y={currentY}
                    width={barWidth}
                    height={Math.max(segmentHeight, 0)}
                    fill={segment.color}
                    opacity={isHovered ? 1 : 0.8}
                    rx={segIndex === item.segments.length - 1 ? 2 : 0}
                    ry={segIndex === item.segments.length - 1 ? 2 : 0}
                    className="srs-chart-bar-animated srs-chart-bar-hover"
                    style={{
                      cursor: onSegmentClick ? "pointer" : "default",
                      animationDelay: `${barIndex * 0.03 + segIndex * 0.02}s`
                    }}
                    onMouseEnter={(e) => handleMouseEnter(barIndex, segment.key, e)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => onSegmentClick?.(item, segment, barIndex)}
                  />
                )
              })}

              {/* X 轴标签 */}
              {showLabels && (
                <text
                  x={x + barWidth / 2}
                  y={height - padding.bottom - legendHeight + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--orca-color-text-3)"
                >
                  {formatLabel(item.label)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* 图例 */}
      {showLegend && legend.length > 0 && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          marginTop: "8px",
          flexWrap: "wrap"
        }}>
          {legend.map((item: { key: string; label: string; color: string }) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: "var(--orca-color-text-2)"
              }}
            >
              <div style={{
                width: "12px",
                height: "12px",
                backgroundColor: item.color,
                borderRadius: "2px"
              }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* 悬停提示 */}
      {tooltipData && tooltipPos && (
        <div
          className="srs-chart-tooltip-animated"
          style={{
            position: "absolute",
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
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
          <div style={{ fontWeight: 500, marginBottom: "4px" }}>{tooltipData.label}</div>
          {tooltipData.segments.map((seg: StackedBarSegment) => (
            <div
              key={seg.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "2px"
              }}
            >
              <div style={{
                width: "8px",
                height: "8px",
                backgroundColor: seg.color,
                borderRadius: "2px"
              }} />
              <span style={{ color: "var(--orca-color-text-2)" }}>
                {seg.label || seg.key}: {formatValue(seg.value)}
              </span>
            </div>
          ))}
          <div style={{
            marginTop: "4px",
            paddingTop: "4px",
            borderTop: "1px solid var(--orca-color-border-1)",
            color: "var(--orca-color-text-2)"
          }}>
            总计: {formatValue(tooltipData.total)}
          </div>
        </div>
      )}
    </div>
  )
}

export default StackedBarChart
