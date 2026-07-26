/**
 * 「今日学习」环形进度（纯 SVG donut，无第三方依赖）。
 *
 * 数据口径遵守 todayLearningSummary 硬规则：
 * - 只有 completed 与 remaining 均为可信数字（loadStatus=ok / done）时才画真实进度环并显示百分比。
 * - partial / 任一为 null 时禁止把 lower-bound 当真实进度：渲染灰色虚线占位环，心内显示「—」。
 * - done（remaining=0）时满环 + ✓。
 */

type TodayProgressRingState =
  | { kind: "ok"; completed: number; remaining: number }
  | { kind: "done"; completed: number }
  | { kind: "unknown" }

export type TodayProgressRingProps = {
  state: TodayProgressRingState
}

const SIZE = 84
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export default function TodayProgressRing({ state }: TodayProgressRingProps) {
  const center = SIZE / 2

  // 计算已完成占比（done → 1；unknown → 不画进度弧）
  let fraction: number | null = null
  let centerText = "—"
  if (state.kind === "done") {
    fraction = 1
    centerText = "100%"
  } else if (state.kind === "ok") {
    const total = state.completed + state.remaining
    fraction = total > 0 ? clampFraction(state.completed / total) : 0
    centerText = `${Math.round(fraction * 100)}%`
  }

  const isUnknown = state.kind === "unknown"
  const dashOffset =
    fraction == null ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - fraction)

  return (
    <div
      className="srs-today-progress-ring"
      role="img"
      aria-label={
        isUnknown ? "今日进度暂不可用" : `今日已完成 ${centerText}`
      }
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        {/* 轨道 */}
        <circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke="var(--orca-color-border-1)"
          strokeWidth={STROKE}
          strokeDasharray={isUnknown ? "4 5" : undefined}
        />
        {/* 已完成弧（从 12 点方向顺时针） */}
        {fraction != null ? (
          <circle
            cx={center}
            cy={center}
            r={RADIUS}
            fill="none"
            stroke="var(--orca-color-primary-6)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        ) : null}
      </svg>
      <div className="srs-today-progress-ring__center">
        {state.kind === "done" ? (
          <i className="ti ti-check srs-today-progress-ring__check" />
        ) : (
          <span className="srs-today-progress-ring__pct">{centerText}</span>
        )}
      </div>
    </div>
  )
}
