export function calculateElapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/**
 * 判断本计时周期是否应触发 onExpire。
 * 到期后若计时继续 running，elapsed 每秒仍会更新；用 hasFiredThisCycle 保证只触发一次。
 */
export function shouldFireExpire(
  elapsedSeconds: number,
  budgetSeconds: number,
  hasFiredThisCycle: boolean
): boolean {
  return !hasFiredThisCycle && elapsedSeconds >= budgetSeconds
}
