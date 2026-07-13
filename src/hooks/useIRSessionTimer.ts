/**
 * 会话时间预算计时
 */

import type { IRTimeBudgetMinutes } from "../srs/incremental-reading/irTypes"
import { calculateElapsedSeconds, shouldFireExpire } from "./irSessionTimerUtils"

const { useEffect, useMemo, useState, useCallback, useRef } = window.React

export type UseIRSessionTimerOptions = {
  budgetMinutes: IRTimeBudgetMinutes | number
  running?: boolean
  onExpire?: () => void
}

export type UseIRSessionTimerResult = {
  remainingSeconds: number
  elapsedSeconds: number
  budgetSeconds: number
  isExpired: boolean
  formattedRemaining: string
  reset: () => void
}

function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function useIRSessionTimer(options: UseIRSessionTimerOptions): UseIRSessionTimerResult {
  const budgetSeconds = Math.max(60, Math.floor(options.budgetMinutes * 60))
  const running = options.running !== false
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const expireFiredRef = useRef(false)
  const onExpireRef = useRef(options.onExpire)
  onExpireRef.current = options.onExpire

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      const next = calculateElapsedSeconds(startedAt, Date.now())
      setElapsedSeconds(next)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, startedAt])

  useEffect(() => {
    if (!shouldFireExpire(elapsedSeconds, budgetSeconds, expireFiredRef.current)) return
    expireFiredRef.current = true
    onExpireRef.current?.()
  }, [elapsedSeconds, budgetSeconds])

  const remainingSeconds = Math.max(0, budgetSeconds - elapsedSeconds)
  const isExpired = remainingSeconds <= 0

  const reset = useCallback(() => {
    expireFiredRef.current = false
    setStartedAt(Date.now())
    setElapsedSeconds(0)
  }, [])

  return useMemo(() => ({
    remainingSeconds,
    elapsedSeconds,
    budgetSeconds,
    isExpired,
    formattedRemaining: formatSeconds(remainingSeconds),
    reset
  }), [remainingSeconds, elapsedSeconds, budgetSeconds, isExpired, reset])
}

export default useIRSessionTimer
