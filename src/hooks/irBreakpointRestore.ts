import type { DbId } from "../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection
} from "../srs/incrementalReadingStorage"
import { findBlockElement } from "./irBreakpointDom"

export const RESTORE_MAX_ATTEMPTS = 8
export const RESTORE_INITIAL_DELAY_MS = 50
export const RESTORE_RETRY_DELAY_MS = 250

export type RestoreTarget =
  | { cardId: DbId; kind: "none" }
  | {
    cardId: DbId
    targetRootBlockId: DbId
    targetBlockId: DbId
    selection: IRReadingBreakpointSelection | null
  }

export function resolveRestoreTarget(
  cardId: DbId,
  initialBreakpoint: IRReadingBreakpoint | null | undefined,
  initialResumeBlockId: DbId | null | undefined
): RestoreTarget {
  const selection = initialBreakpoint?.selection ?? null
  const targetBlockId = selection?.focus.blockId ?? initialResumeBlockId ?? null
  if (!targetBlockId) {
    return { cardId, kind: "none" }
  }

  return {
    cardId,
    targetRootBlockId: selection?.rootBlockId ?? cardId,
    targetBlockId,
    selection
  }
}

export function isRestoreTargetNone(target: RestoreTarget): target is { cardId: DbId; kind: "none" } {
  return "kind" in target && target.kind === "none"
}

export function getRestoreTargetKey(target: RestoreTarget): string {
  if (isRestoreTargetNone(target)) return `${target.cardId}:none`
  return `${target.cardId}:${target.targetRootBlockId}:${target.targetBlockId}`
}

export function shouldRunRestoreForTarget(
  lastCompletedKey: string | null,
  targetKey: string
): boolean {
  return lastCompletedKey !== targetKey
}

export class BreakpointRestoreRunGuard {
  private currentKey: string | null = null
  private state: "idle" | "active" | "completed" = "idle"

  begin(targetKey: string): boolean {
    if (this.currentKey !== targetKey) {
      this.currentKey = targetKey
      this.state = "active"
      return true
    }
    if (this.state !== "idle") return false
    this.state = "active"
    return true
  }

  complete(targetKey: string): void {
    if (this.currentKey === targetKey) this.state = "completed"
  }

  cancel(targetKey: string): void {
    if (this.currentKey === targetKey && this.state === "active") this.state = "idle"
  }
}

export type BreakpointRestoreDeps = {
  getContentContainer: (targetRootBlockId: DbId) => HTMLElement | null
  restoreSelection: (selection: IRReadingBreakpointSelection) => Promise<void>
  scrollIntoView: (element: HTMLElement) => void
  onSuccess?: () => void
  onFailure?: (error: Error) => void
  schedule?: (fn: () => void, delayMs: number) => number
  clearSchedule?: (id: number) => void
  maxAttempts?: number
}

export type BreakpointRestoreHandle = {
  cancel: () => void
}

export function scheduleBreakpointRestore(
  target: RestoreTarget,
  deps: BreakpointRestoreDeps
): BreakpointRestoreHandle {
  const schedule = deps.schedule ?? ((fn, delayMs) => window.setTimeout(fn, delayMs))
  const clearSchedule = deps.clearSchedule ?? ((id) => window.clearTimeout(id))
  const maxAttempts = deps.maxAttempts ?? RESTORE_MAX_ATTEMPTS
  let cancelled = false
  let attempts = 0
  const timeoutIds: number[] = []

  const trackTimeout = (id: number) => {
    timeoutIds.push(id)
    return id
  }

  const cancel = () => {
    cancelled = true
    timeoutIds.forEach(id => clearSchedule(id))
    timeoutIds.length = 0
  }

  if (isRestoreTargetNone(target)) {
    deps.onSuccess?.()
    return { cancel }
  }

  const restoreTarget = target

  const tryRestore = async (): Promise<boolean> => {
    const container = deps.getContentContainer(restoreTarget.targetRootBlockId)
    if (!container) return false

    const el = findBlockElement(container, restoreTarget.targetBlockId)
    if (!el) return false

    deps.scrollIntoView(el)

    if (restoreTarget.selection) {
      try {
        await deps.restoreSelection(restoreTarget.selection)
      } catch (error) {
        console.warn("[IR Breakpoint] 恢复选区失败，已滚动到块:", error)
      }
    }

    if (cancelled) return false
    deps.onSuccess?.()
    return true
  }

  const tick = () => {
    if (cancelled) return
    attempts += 1
    void tryRestore().then(ok => {
      if (cancelled) return
      if (ok) return
      if (attempts >= maxAttempts) {
        deps.onFailure?.(new Error("断点恢复超时：目标块未渲染"))
        return
      }
      trackTimeout(schedule(tick, RESTORE_RETRY_DELAY_MS))
    })
  }

  trackTimeout(schedule(tick, RESTORE_INITIAL_DELAY_MS))

  return { cancel }
}
