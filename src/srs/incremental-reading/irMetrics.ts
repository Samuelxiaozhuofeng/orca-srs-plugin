/**
 * 渐进阅读会话本地聚合指标
 *
 * 只记录聚合事件，不保存正文或选区内容。
 */

export type IRMetricEventName =
  | "session.start"
  | "session.end"
  | "queue.load"
  | "queue.load_error"
  | "action.next"
  | "action.postpone"
  | "action.archive"
  | "action.extract"
  | "action.itemize"
  | "action.priority"
  | "action.failure"
  | "breakpoint.save"
  | "breakpoint.save_failure"
  | "breakpoint.restore"
  | "breakpoint.restore_failure"
  | "auto_postpone"
  | "auto_postpone.undo"

export type IRMetricEvent = {
  name: IRMetricEventName
  at: number
  /** 数值字段（毫秒、计数等） */
  value?: number
  /** 分类标签，禁止写入正文 */
  tags?: Record<string, string | number | boolean>
}

export type IRSessionMetricsSnapshot = {
  sessionStartedAt: number | null
  sessionEndedAt: number | null
  durationMs: number | null
  plannedCount: number
  completedCount: number
  topicProcessed: number
  extractProcessed: number
  itemCreated: number
  extractCreated: number
  extractSuccess: number
  extractFailure: number
  itemizeSuccess: number
  itemizeFailure: number
  postponeCount: number
  archiveCount: number
  deleteCount: number
  breakpointSaveSuccess: number
  breakpointSaveFailure: number
  breakpointRestoreSuccess: number
  breakpointRestoreFailure: number
  autoPostponeCount: number
  autoPostponeUndoCount: number
  queueLoadMs: number | null
  queueLoadFailures: number
  dwellMsTotal: number
  dwellSamples: number
}

const emptySnapshot = (): IRSessionMetricsSnapshot => ({
  sessionStartedAt: null,
  sessionEndedAt: null,
  durationMs: null,
  plannedCount: 0,
  completedCount: 0,
  topicProcessed: 0,
  extractProcessed: 0,
  itemCreated: 0,
  extractCreated: 0,
  extractSuccess: 0,
  extractFailure: 0,
  itemizeSuccess: 0,
  itemizeFailure: 0,
  postponeCount: 0,
  archiveCount: 0,
  deleteCount: 0,
  breakpointSaveSuccess: 0,
  breakpointSaveFailure: 0,
  breakpointRestoreSuccess: 0,
  breakpointRestoreFailure: 0,
  autoPostponeCount: 0,
  autoPostponeUndoCount: 0,
  queueLoadMs: null,
  queueLoadFailures: 0,
  dwellMsTotal: 0,
  dwellSamples: 0
})

export class IRSessionMetrics {
  private events: IRMetricEvent[] = []
  private snapshot: IRSessionMetricsSnapshot = emptySnapshot()

  record(name: IRMetricEventName, value?: number, tags?: IRMetricEvent["tags"]): void {
    const event: IRMetricEvent = {
      name,
      at: Date.now(),
      value,
      tags
    }
    this.events.push(event)
    this.apply(event)
  }

  getSnapshot(): IRSessionMetricsSnapshot {
    return { ...this.snapshot }
  }

  getEvents(): readonly IRMetricEvent[] {
    return this.events
  }

  reset(): void {
    this.events = []
    this.snapshot = emptySnapshot()
  }

  private apply(event: IRMetricEvent): void {
    const s = this.snapshot
    switch (event.name) {
      case "session.start":
        s.sessionStartedAt = event.at
        s.plannedCount = typeof event.value === "number" ? event.value : s.plannedCount
        break
      case "session.end":
        s.sessionEndedAt = event.at
        if (s.sessionStartedAt != null) {
          s.durationMs = event.at - s.sessionStartedAt
        }
        if (typeof event.value === "number") s.completedCount = event.value
        break
      case "queue.load":
        s.queueLoadMs = typeof event.value === "number" ? event.value : s.queueLoadMs
        break
      case "queue.load_error":
        s.queueLoadFailures += 1
        break
      case "action.next":
        s.completedCount += 1
        if (event.tags?.cardType === "topic") s.topicProcessed += 1
        if (event.tags?.cardType === "extracts") s.extractProcessed += 1
        if (typeof event.value === "number") {
          s.dwellMsTotal += event.value
          s.dwellSamples += 1
        }
        break
      case "action.postpone":
        s.postponeCount += 1
        s.completedCount += 1
        break
      case "action.archive":
        s.archiveCount += 1
        s.completedCount += 1
        break
      case "action.extract":
        s.extractCreated += 1
        s.extractSuccess += 1
        break
      case "action.itemize":
        s.itemCreated += 1
        s.itemizeSuccess += 1
        break
      case "action.failure":
        if (event.tags?.kind === "extract") s.extractFailure += 1
        if (event.tags?.kind === "itemize") s.itemizeFailure += 1
        break
      case "breakpoint.save":
        s.breakpointSaveSuccess += 1
        break
      case "breakpoint.save_failure":
        s.breakpointSaveFailure += 1
        break
      case "breakpoint.restore":
        s.breakpointRestoreSuccess += 1
        break
      case "breakpoint.restore_failure":
        s.breakpointRestoreFailure += 1
        break
      case "auto_postpone":
        s.autoPostponeCount += typeof event.value === "number" ? event.value : 1
        break
      case "auto_postpone.undo":
        s.autoPostponeUndoCount += typeof event.value === "number" ? event.value : 1
        break
      default:
        break
    }
  }
}

/** 计算断点恢复成功率（0-1），无样本时返回 null */
export function computeBreakpointRestoreRate(snapshot: IRSessionMetricsSnapshot): number | null {
  const total = snapshot.breakpointRestoreSuccess + snapshot.breakpointRestoreFailure
  if (total === 0) return null
  return snapshot.breakpointRestoreSuccess / total
}

/** 计算动作失败率（0-1），无样本时返回 null */
export function computeActionFailureRate(snapshot: IRSessionMetricsSnapshot): number | null {
  const success =
    snapshot.extractSuccess +
    snapshot.itemizeSuccess +
    snapshot.topicProcessed +
    snapshot.extractProcessed
  const failure = snapshot.extractFailure + snapshot.itemizeFailure
  const total = success + failure
  if (total === 0) return null
  return failure / total
}
