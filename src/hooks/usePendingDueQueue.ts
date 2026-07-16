import type { ReviewCard } from "../srs/types"
import type { SessionStatsSummary } from "../srs/sessionProgressTracker"
import type { ReviewSessionScope } from "../srs/reviewSessionScope"
import type { SessionRootCardBudget } from "../srs/reviewSessionBudget"
import type { SessionFinalizeController } from "../srs/sessionProgressFinalize"
import { reopenSessionFinalizeIfNeeded } from "../srs/sessionProgressFinalize"
import { isCardInSessionScope } from "../srs/reviewSessionScope"
import { getCardKey } from "../srs/childCardCollector"
import {
  activateEmptyPendingDueState,
  createEmptyPendingDueState,
  deactivateAndClearPending,
  isPendingWakeTokenCurrent,
  planNextPendingWake,
  processPendingWake,
  upsertPendingDueCard
} from "../srs/pendingDueRequeue"

const { useEffect, useRef } = window.React

type UsePendingDueQueueOptions = {
  queue: ReviewCard[]
  currentIndex: number
  pluginName: string
  scopeRef: React.MutableRefObject<ReviewSessionScope>
  budgetRef: React.MutableRefObject<SessionRootCardBudget | null>
  finalizeRef: React.MutableRefObject<SessionFinalizeController<SessionStatsSummary>>
  setQueue: React.Dispatch<React.SetStateAction<ReviewCard[]>>
  setNewCardsAdded: React.Dispatch<React.SetStateAction<number>>
  setLastLog: React.Dispatch<React.SetStateAction<string | null>>
  setSessionStats: React.Dispatch<React.SetStateAction<SessionStatsSummary | null>>
  resumeProgressPersistence: () => void
}

/** 管理 Again/Hard 的短期到期重入队列、唯一 timer 与完成态 reopen。 */
export function usePendingDueQueue({
  queue,
  currentIndex,
  pluginName,
  scopeRef,
  budgetRef,
  finalizeRef,
  setQueue,
  setNewCardsAdded,
  setLastLog,
  setSessionStats,
  resumeProgressPersistence
}: UsePendingDueQueueOptions) {
  const stateRef = useRef(createEmptyPendingDueState())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentIndexRef = useRef(currentIndex)
  const queueRef = useRef(queue)
  currentIndexRef.current = currentIndex
  queueRef.current = queue

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clear = (reason: string) => {
    clearTimer()
    stateRef.current = deactivateAndClearPending(stateRef.current)
    console.log(`[${pluginName}] F2-04 pending 已清理（${reason}）`)
  }

  const reset = () => {
    clearTimer()
    stateRef.current = activateEmptyPendingDueState()
  }

  const reschedule = () => {
    clearTimer()
    try {
      const planned = planNextPendingWake(stateRef.current, Date.now())
      stateRef.current = planned.state
      if (!planned.plan) return
      const { token, delayMs } = planned.plan
      console.log(
        `[${pluginName}] F2-04 调度 pending wake token=${token} delay=${delayMs}ms ` +
        `pending=${stateRef.current.entries.size}`
      )
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        check(token)
      }, delayMs)
    } catch (error) {
      console.error(`[${pluginName}] F2-04 pending timer 调度异常:`, error)
      orca.notify("error", `短期重学定时器调度失败: ${error}`, { title: "SRS 复习" })
    }
  }

  const check = (wakeToken: number) => {
    if (!stateRef.current.active) return
    if (!isPendingWakeTokenCurrent(stateRef.current, wakeToken)) return
    const stateSnapshot = stateRef.current

    try {
      const wakeResult = processPendingWake({
        state: stateSnapshot,
        wakeToken,
        nowMs: Date.now(),
        queue: queueRef.current,
        currentIndex: currentIndexRef.current,
        scope: scopeRef.current,
        budget: budgetRef.current
      })
      wakeResult.diagnostics.forEach((diagnostic) => {
        console.warn(`[${pluginName}] ${diagnostic}`)
      })
      if (wakeResult.stale || wakeResult.inactive) return

      const wasSessionComplete =
        queueRef.current.length > 0 &&
        currentIndexRef.current >= queueRef.current.length
      const appendedCount = wakeResult.appended.length
      if (appendedCount > 0) {
        queueRef.current = wakeResult.queue
        setQueue(wakeResult.queue)
      }
      stateRef.current = wakeResult.state

      if (appendedCount > 0) {
        setNewCardsAdded((count) => count + appendedCount)
        setLastLog(`${appendedCount} 张卡片已到期，加入队列`)
        orca.notify("info", `${appendedCount} 张卡片已到期`, { title: "SRS 复习" })
        const reopened = reopenSessionFinalizeIfNeeded(finalizeRef.current, {
          wasSessionComplete,
          actuallyAppendedCount: appendedCount
        })
        if (reopened) {
          setSessionStats(null)
          resumeProgressPersistence()
        }
      }

      if (wakeResult.retainedRejected.length > 0) {
        orca.notify(
          "error",
          `${wakeResult.retainedRejected.length} 张短期到期卡未接纳（scope/额度），已保留待重试`,
          { title: "SRS 复习" }
        )
      }
      if (stateRef.current.active && stateRef.current.entries.size > 0) {
        reschedule()
      }
    } catch (error) {
      console.error(`[${pluginName}] F2-04 pending 到期处理失败（pending 保留）:`, error)
      orca.notify("error", `短期重学入队失败: ${error}`, { title: "SRS 复习" })
      if (stateSnapshot.active && stateSnapshot.entries.size > 0) {
        stateRef.current = stateSnapshot
        reschedule()
      }
    }
  }

  const track = (card: ReviewCard, dueTime: Date) => {
    if (!isCardInSessionScope(card, scopeRef.current)) {
      console.warn(
        `[${pluginName}] F2-04 跳过追踪 scope 外的短期到期卡: ${getCardKey(card)}`
      )
      return
    }

    const now = Date.now()
    const upsert = upsertPendingDueCard(
      stateRef.current,
      card,
      dueTime.getTime(),
      now
    )
    stateRef.current = upsert.state
    if (upsert.status === "out_of_window") return
    if (upsert.status !== "tracked" || !upsert.entry) {
      if (upsert.status === "invalid_due") {
        orca.notify("error", "短期重学追踪失败：无效到期时间", { title: "SRS 复习" })
      }
      return
    }

    const delaySeconds = Math.round((upsert.entry.dueTime - now) / 1000)
    setLastLog(`卡片将在 ${delaySeconds} 秒后重新加入队列`)
    if (upsert.needsReschedule) reschedule()
  }

  useEffect(() => () => {
    clearTimer()
    stateRef.current = deactivateAndClearPending(stateRef.current)
  }, [])

  return { clear, reset, track }
}
