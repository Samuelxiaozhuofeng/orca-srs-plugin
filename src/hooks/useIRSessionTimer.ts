/**
 * 会话已投入时长计时（只陈述，不打断）
 *
 * 无时间盒：不存在「到期」，因此不再有 budget / onExpire。
 */

import { calculateElapsedSeconds, formatElapsedLabel } from "./irSessionTimerUtils"

const { useEffect, useMemo, useState, useCallback } = window.React

export type UseIRSessionTimerOptions = {
  running?: boolean
}

export type UseIRSessionTimerResult = {
  elapsedSeconds: number
  formattedElapsed: string
  reset: () => void
}

export function useIRSessionTimer(
  options: UseIRSessionTimerOptions = {}
): UseIRSessionTimerResult {
  const running = options.running !== false
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(calculateElapsedSeconds(startedAt, Date.now()))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, startedAt])

  const reset = useCallback(() => {
    setStartedAt(Date.now())
    setElapsedSeconds(0)
  }, [])

  return useMemo(() => ({
    elapsedSeconds,
    formattedElapsed: formatElapsedLabel(elapsedSeconds),
    reset
  }), [elapsedSeconds, reset])
}

export default useIRSessionTimer
