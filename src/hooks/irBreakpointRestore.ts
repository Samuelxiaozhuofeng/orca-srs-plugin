import type { DbId } from "../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection
} from "../srs/incrementalReadingStorage"
import { findBlockElement } from "./irBreakpointDom"

export const RESTORE_MAX_ATTEMPTS = 8
export const RESTORE_INITIAL_DELAY_MS = 50
export const RESTORE_RETRY_DELAY_MS = 250
/** 滚动停止后可见块捕获防抖；与 useIRReadingBreakpoint 共用 */
export const SCROLL_DEBOUNCE_MS = 280

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

/**
 * 卡片进入时的滚动计划：先归零，有有效断点再恢复目标；无断点保持顶部。
 * 归零属于「进入新卡」生命周期，不得在离开旧卡的 cleanup 中执行。
 */
export type CardEnterScrollPlan =
  | { kind: "top-only"; cardId: DbId }
  | {
    kind: "reset-then-restore"
    cardId: DbId
    targetRootBlockId: DbId
    targetBlockId: DbId
  }

export function planCardEnterScroll(target: RestoreTarget): CardEnterScrollPlan {
  if (isRestoreTargetNone(target)) {
    return { kind: "top-only", cardId: target.cardId }
  }
  return {
    kind: "reset-then-restore",
    cardId: target.cardId,
    targetRootBlockId: target.targetRootBlockId,
    targetBlockId: target.targetBlockId
  }
}

/** 将滚动容器归零（不触发断点保存语义；调用方须先卸掉旧卡 scroll 监听） */
export function resetScrollContainerTop(
  scrollContainer: { scrollTop: number } | null | undefined
): void {
  if (!scrollContainer) return
  scrollContainer.scrollTop = 0
}

/**
 * 断点恢复期间抑制「可见块滚动捕获」。
 * 程序化 scrollTop=0 / scrollIntoView 不得在恢复完成前把后端断点写成顶部。
 * 显式 lifecycle：begin → (success|failure|cancel/end) 释放；不依赖 React effect 顺序。
 */
export class ScrollCaptureSuppression {
  private generation = 0
  private active = false

  /** 开始一轮抑制，返回 generation token（end 时校验，防止旧 cancel 误伤新一轮） */
  begin(): number {
    this.generation += 1
    this.active = true
    return this.generation
  }

  isActive(): boolean {
    return this.active
  }

  /**
   * 结束抑制。传入 token 时仅当仍是当前 generation 才释放；
   * 省略 token 则强制释放（unmount / 切卡 cleanup）。
   */
  end(token?: number): void {
    if (token != null && token !== this.generation) return
    this.active = false
  }

  /** 当前 generation（测试 / 诊断） */
  getGeneration(): number {
    return this.generation
  }
}

/**
 * 滚动可见块捕获门闩：恢复抑制中、或 listener 已非当前卡时，不得捕获。
 */
export function shouldAllowScrollVisibleCapture(options: {
  suppressActive: boolean
  listeningForCardId: DbId | null
  activeCardId: DbId | null
}): boolean {
  if (options.suppressActive) return false
  if (options.listeningForCardId == null || options.activeCardId == null) return false
  return options.activeCardId === options.listeningForCardId
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
  /** 进入新卡时先归零的滚动容器；在尝试恢复前调用一次 */
  getScrollContainer?: () => { scrollTop: number } | null
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
  let didResetScroll = false

  const trackTimeout = (id: number) => {
    timeoutIds.push(id)
    return id
  }

  const cancel = () => {
    cancelled = true
    timeoutIds.forEach(id => clearSchedule(id))
    timeoutIds.length = 0
  }

  const ensureScrollReset = () => {
    if (didResetScroll) return
    didResetScroll = true
    resetScrollContainerTop(deps.getScrollContainer?.() ?? null)
  }

  // 无断点：归零后成功（停留顶部）
  if (isRestoreTargetNone(target)) {
    ensureScrollReset()
    deps.onSuccess?.()
    return { cancel }
  }

  // 有断点：先归零，再异步恢复目标
  ensureScrollReset()

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
