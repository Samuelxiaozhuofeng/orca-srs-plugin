export function calculateElapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/**
 * 活跃累计：在已冻结的秒数上叠加当前活跃区间。
 * paused 时 currentSegmentStartedAt 为 null，只返回 accumulatedSeconds。
 */
export function calculateActiveElapsedSeconds(params: {
  accumulatedSeconds: number
  currentSegmentStartedAt: number | null
  now: number
}): number {
  const base = Math.max(0, Math.floor(params.accumulatedSeconds))
  if (params.currentSegmentStartedAt == null) return base
  return base + calculateElapsedSeconds(params.currentSegmentStartedAt, params.now)
}

/**
 * 已投入时长展示：mm:ss，满 1 小时后 h:mm:ss。
 * 无时间盒后计时只做「陈述」，不再有到期判定与打断。
 */
export function formatElapsedLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${m}:${String(s).padStart(2, "0")}`
}
