/**
 * 统一会话 Again/Hard 短期到期重入：唯一 timer、stale token、冻结 scope、卸载清理。
 */

import type { ReviewSessionScope } from "../srs/reviewSessionScope"
import type { ReviewCard } from "../srs/types"
import type { IRSessionEntry } from "../srs/incremental-reading/irMixedQueuePolicy"
import {
  activateEmptyPendingDueState,
  createEmptyPendingDueState,
  deactivateAndClearPending,
  isPendingWakeTokenCurrent,
  planNextPendingWake
} from "../srs/pendingDueRequeue"
import {
  freezeIRMixedReviewScope,
  processIRMixedPendingWake,
  trackIRMixedPendingCard
} from "../srs/incremental-reading/irMixedPendingDue"

const { useEffect, useRef } = window.React

export type UseIRMixedPendingDueQueueOptions = {
  pluginName: string
  queue: IRSessionEntry[]
  currentIndex: number
  /** 完成 UI 或 queue 已空 */
  sessionVisiblyComplete: boolean
  setQueue: React.Dispatch<React.SetStateAction<IRSessionEntry[]>>
  /** 真正 append 时回调（planned +1、metrics、reopen summary） */
  onAppended: (params: {
    appendedCount: number
    shouldReopenSession: boolean
    nextQueueLength: number
  }) => void
}

export type UseIRMixedPendingDueQueueResult = {
  /** 会话种子变化时：冻结 scope 并激活空 pending */
  resetForSession: (entries: readonly IRSessionEntry[]) => void
  track: (card: ReviewCard) => void
  clear: (reason: string) => void
  hasPending: () => boolean
  getPendingCount: () => number
}

export function useIRMixedPendingDueQueue({
  pluginName,
  queue,
  currentIndex,
  sessionVisiblyComplete,
  setQueue,
  onAppended
}: UseIRMixedPendingDueQueueOptions): UseIRMixedPendingDueQueueResult {
  const stateRef = useRef(createEmptyPendingDueState(false))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scopeRef = useRef<ReviewSessionScope>(freezeIRMixedReviewScope([]))
  const queueRef = useRef(queue)
  const currentIndexRef = useRef(currentIndex)
  const completeRef = useRef(sessionVisiblyComplete)
  const onAppendedRef = useRef(onAppended)
  queueRef.current = queue
  currentIndexRef.current = currentIndex
  completeRef.current = sessionVisiblyComplete
  onAppendedRef.current = onAppended

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clear = (reason: string) => {
    clearTimer()
    stateRef.current = deactivateAndClearPending(stateRef.current)
    console.log(`[${pluginName}] IR mixed pending 已清理（${reason}）`)
  }

  const reschedule = () => {
    clearTimer()
    try {
      const planned = planNextPendingWake(stateRef.current, Date.now())
      stateRef.current = planned.state
      if (!planned.plan) return
      const { token, delayMs } = planned.plan
      console.log(
        `[${pluginName}] IR mixed pending wake token=${token} delay=${delayMs}ms ` +
          `pending=${stateRef.current.entries.size}`
      )
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        check(token)
      }, delayMs)
    } catch (error) {
      console.error(`[${pluginName}] IR mixed pending timer 调度失败:`, error)
      orca.notify("error", `短期重学定时器调度失败: ${error}`, { title: "今日学习" })
    }
  }

  const check = (wakeToken: number) => {
    if (!stateRef.current.active) return
    if (!isPendingWakeTokenCurrent(stateRef.current, wakeToken)) return
    const stateSnapshot = stateRef.current
    try {
      const wake = processIRMixedPendingWake({
        state: stateSnapshot,
        wakeToken,
        nowMs: Date.now(),
        queue: queueRef.current,
        currentIndex: currentIndexRef.current,
        scope: scopeRef.current,
        sessionVisiblyComplete: completeRef.current
      })
      wake.diagnostics.forEach((d) => console.warn(`[${pluginName}] ${d}`))
      if (wake.stale || wake.inactive) return

      stateRef.current = wake.state
      if (wake.appended.length > 0) {
        queueRef.current = wake.queue
        setQueue(wake.queue)
        onAppendedRef.current({
          appendedCount: wake.appended.length,
          shouldReopenSession: wake.shouldReopenSession,
          nextQueueLength: wake.queue.length
        })
        orca.notify("info", `${wake.appended.length} 张卡片已到期`, { title: "今日学习" })
      }

      if (wake.retainedRejected.length > 0) {
        orca.notify(
          "error",
          `${wake.retainedRejected.length} 张短期到期卡未接纳（不在本次会话范围），已保留待重试`,
          { title: "今日学习" }
        )
      }

      if (stateRef.current.active && stateRef.current.entries.size > 0) {
        reschedule()
      }
    } catch (error) {
      console.error(`[${pluginName}] IR mixed pending 到期处理失败（pending 保留）:`, error)
      orca.notify("error", `短期重学入队失败: ${error}`, { title: "今日学习" })
      if (stateSnapshot.active && stateSnapshot.entries.size > 0) {
        stateRef.current = stateSnapshot
        reschedule()
      }
    }
  }

  const track = (card: ReviewCard) => {
    const now = Date.now()
    const result = trackIRMixedPendingCard(
      stateRef.current,
      card,
      now,
      scopeRef.current
    )
    stateRef.current = result.state
    if (result.status === "out_of_scope") {
      console.warn(
        `[${pluginName}] IR mixed pending 跳过 scope 外卡片`
      )
      return
    }
    if (result.status === "out_of_window") return
    if (result.status === "invalid_due") {
      orca.notify("error", "短期重学追踪失败：无效到期时间", { title: "今日学习" })
      return
    }
    if (result.status === "inactive") {
      console.warn(`[${pluginName}] IR mixed pending 未激活，跳过追踪`)
      return
    }
    if (result.status === "tracked" && result.needsReschedule) {
      const delaySeconds =
        result.dueTimeMs != null
          ? Math.round((result.dueTimeMs - now) / 1000)
          : 0
      console.log(
        `[${pluginName}] IR mixed pending 已跟踪，约 ${delaySeconds}s 后回流`
      )
      reschedule()
    }
  }

  const resetForSession = (entries: readonly IRSessionEntry[]) => {
    clearTimer()
    scopeRef.current = freezeIRMixedReviewScope(entries)
    stateRef.current = activateEmptyPendingDueState()
  }

  const hasPending = () => stateRef.current.entries.size > 0
  const getPendingCount = () => stateRef.current.entries.size

  useEffect(() => () => {
    clearTimer()
    stateRef.current = deactivateAndClearPending(stateRef.current)
  }, [])

  return { resetForSession, track, clear, hasPending, getPendingCount }
}
