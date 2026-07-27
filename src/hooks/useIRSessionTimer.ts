/**
 * 会话已投入时长计时（只陈述，不打断）
 *
 * 无时间盒：不存在「到期」，因此不再有 budget / onExpire。
 * `running=false` 时冻结累计，不把资料库/隐藏时间算进去。
 */

import {
  calculateActiveElapsedSeconds,
  formatElapsedLabel
} from "./irSessionTimerUtils"

const { useEffect, useMemo, useState, useCallback, useRef } = window.React

export type UseIRSessionTimerOptions = {
  /** false 时暂停累计（库模式 display:none、完成页等） */
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
  const accumulatedRef = useRef(0)
  const segmentStartedAtRef = useRef<number | null>(running ? Date.now() : null)
  const runningRef = useRef(running)

  // running 边沿：pause 冻结；resume 开新区间
  useEffect(() => {
    const wasRunning = runningRef.current
    runningRef.current = running
    const now = Date.now()
    if (wasRunning && !running) {
      if (segmentStartedAtRef.current != null) {
        accumulatedRef.current = calculateActiveElapsedSeconds({
          accumulatedSeconds: accumulatedRef.current,
          currentSegmentStartedAt: segmentStartedAtRef.current,
          now
        })
        segmentStartedAtRef.current = null
      }
      setElapsedSeconds(accumulatedRef.current)
      return
    }
    if (!wasRunning && running) {
      segmentStartedAtRef.current = now
    }
  }, [running])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(
        calculateActiveElapsedSeconds({
          accumulatedSeconds: accumulatedRef.current,
          currentSegmentStartedAt: segmentStartedAtRef.current,
          now: Date.now()
        })
      )
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const reset = useCallback(() => {
    accumulatedRef.current = 0
    segmentStartedAtRef.current = runningRef.current ? Date.now() : null
    setElapsedSeconds(0)
  }, [])

  return useMemo(() => ({
    elapsedSeconds,
    formattedElapsed: formatElapsedLabel(elapsedSeconds),
    reset
  }), [elapsedSeconds, reset])
}

export default useIRSessionTimer
