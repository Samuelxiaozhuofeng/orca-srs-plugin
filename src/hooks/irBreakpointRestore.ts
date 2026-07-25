import type { DbId } from "../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection
} from "../srs/incrementalReadingStorage"
import { findBlockElement } from "./irBreakpointDom"
import {
  alignBlockTopOffset,
  computeReadingLineOffsetPx,
  VIEWPORT_ALIGN_EPSILON_PX
} from "./irBreakpointViewport"

export const RESTORE_MAX_ATTEMPTS = 8
export const RESTORE_INITIAL_DELAY_MS = 50
export const RESTORE_RETRY_DELAY_MS = 250
/** 滚动停止后可见块捕获防抖；与 useIRReadingBreakpoint 共用 */
export const SCROLL_DEBOUNCE_MS = 280

/** 仅非折叠且含非空文本的选区才优先于视口捕获（折叠 caret 不得覆盖） */
export function isMeaningfulTextSelection(selection: Selection | null): boolean {
  if (!selection || selection.isCollapsed) return false
  return selection.toString().trim().length > 0
}

/** 几何稳定：轮询间隔 / 最大等待 / 连续达标次数 */
export const RESTORE_STABILITY_POLL_MS = 50
export const RESTORE_STABILITY_MAX_WAIT_MS = 1500
export const RESTORE_STABILITY_CONSECUTIVE_OK = 2

export type RestoreTarget =
  | { cardId: DbId; kind: "none" }
  | {
    cardId: DbId
    targetRootBlockId: DbId
    targetBlockId: DbId
    selection: IRReadingBreakpointSelection | null
    /**
     * 块顶相对滚动 owner 顶部的目标偏移。
     * null = 旧数据 / 无 anchor：对齐到当前阅读线（非 center）。
     */
    topOffsetPx: number | null
  }

export function resolveRestoreTarget(
  cardId: DbId,
  initialBreakpoint: IRReadingBreakpoint | null | undefined,
  initialResumeBlockId: DbId | null | undefined
): RestoreTarget {
  const selection = initialBreakpoint?.selection ?? null
  const viewportAnchor = initialBreakpoint?.viewportAnchor ?? null
  const targetBlockId =
    selection?.focus.blockId
    ?? viewportAnchor?.blockId
    ?? initialResumeBlockId
    ?? null
  if (!targetBlockId) {
    return { cardId, kind: "none" }
  }

  const topOffsetPx =
    viewportAnchor && viewportAnchor.blockId === targetBlockId
      ? viewportAnchor.topOffsetPx
      : null

  return {
    cardId,
    targetRootBlockId:
      selection?.rootBlockId
      ?? viewportAnchor?.rootBlockId
      ?? cardId,
    targetBlockId,
    selection,
    topOffsetPx
  }
}

export function isRestoreTargetNone(target: RestoreTarget): target is { cardId: DbId; kind: "none" } {
  return "kind" in target && target.kind === "none"
}

export function getRestoreTargetKey(target: RestoreTarget): string {
  if (isRestoreTargetNone(target)) return `${target.cardId}:none`
  const offsetKey =
    target.topOffsetPx == null ? "line" : String(Math.round(target.topOffsetPx))
  const selKey = target.selection
    ? `${target.selection.focus.blockId}:${target.selection.focus.offset}`
    : "nosel"
  return `${target.cardId}:${target.targetRootBlockId}:${target.targetBlockId}:${offsetKey}:${selKey}`
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
 * 程序化 scrollTop=0 / 对齐滚动不得在恢复完成前把后端断点写成顶部。
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
  /**
   * 将目标块对齐到 topOffsetPx（null = 阅读线）。
   * 应返回对齐后残差（px）；测试可用 spy。
   */
  alignTarget: (
    element: HTMLElement,
    topOffsetPx: number | null,
    scrollOwner: HTMLElement | null
  ) => number
  /** 进入新卡时先归零的滚动容器；在尝试恢复前调用一次 */
  getScrollContainer?: () => HTMLElement | { scrollTop: number } | null
  onSuccess?: () => void
  onFailure?: (error: Error) => void
  schedule?: (fn: () => void, delayMs: number) => number
  clearSchedule?: (id: number) => void
  maxAttempts?: number
  /** 几何稳定参数（expand / 异步布局） */
  stabilityEpsilonPx?: number
  stabilityConsecutiveOk?: number
  stabilityMaxWaitMs?: number
  stabilityPollMs?: number
}

export type BreakpointRestoreHandle = {
  cancel: () => void
}

/**
 * 默认对齐：确定性 scrollTop += delta，无 smooth / center。
 * topOffsetPx 为 null 时对齐到阅读线。
 */
export function defaultAlignTarget(
  element: HTMLElement,
  topOffsetPx: number | null,
  scrollOwner: HTMLElement | null
): number {
  if (!scrollOwner || typeof (scrollOwner as HTMLElement).getBoundingClientRect !== "function") {
    return 0
  }
  const owner = scrollOwner as HTMLElement
  const desired =
    topOffsetPx == null
      ? computeReadingLineOffsetPx(owner)
      : topOffsetPx
  return alignBlockTopOffset(element, owner, desired)
}

export function scheduleBreakpointRestore(
  target: RestoreTarget,
  deps: BreakpointRestoreDeps
): BreakpointRestoreHandle {
  const schedule = deps.schedule ?? ((fn, delayMs) => window.setTimeout(fn, delayMs))
  const clearSchedule = deps.clearSchedule ?? ((id) => window.clearTimeout(id))
  const maxAttempts = deps.maxAttempts ?? RESTORE_MAX_ATTEMPTS
  const epsilon = deps.stabilityEpsilonPx ?? VIEWPORT_ALIGN_EPSILON_PX
  const consecutiveNeed = deps.stabilityConsecutiveOk ?? RESTORE_STABILITY_CONSECUTIVE_OK
  const maxWaitMs = deps.stabilityMaxWaitMs ?? RESTORE_STABILITY_MAX_WAIT_MS
  const pollMs = deps.stabilityPollMs ?? RESTORE_STABILITY_POLL_MS

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

  let failed = false
  const fail = (error: Error) => {
    if (cancelled || failed) return
    failed = true
    cancelled = true
    timeoutIds.forEach(id => clearSchedule(id))
    timeoutIds.length = 0
    deps.onFailure?.(error)
  }

  const settleAlign = (
    element: HTMLElement,
    onSettled: () => void
  ) => {
    const startedAt = Date.now()
    let consecutiveOk = 0

    const tick = () => {
      if (cancelled || failed) return
      try {
        const scrollOwner = (deps.getScrollContainer?.() ?? null) as HTMLElement | null
        const residual = deps.alignTarget(
          element,
          restoreTarget.topOffsetPx,
          scrollOwner
        )
        if (Math.abs(residual) <= epsilon) {
          consecutiveOk += 1
        } else {
          consecutiveOk = 0
        }

        if (consecutiveOk >= consecutiveNeed) {
          onSettled()
          return
        }
        if (Date.now() - startedAt >= maxWaitMs) {
          // 有界超时：接受最近合法位置（文末 clamp 等），不视为失败
          onSettled()
          return
        }
        trackTimeout(schedule(tick, pollMs))
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    }

    tick()
  }

  const tryRestore = async (): Promise<"pending" | "done" | "missing"> => {
    const container = deps.getContentContainer(restoreTarget.targetRootBlockId)
    if (!container) return "missing"

    const el = findBlockElement(container, restoreTarget.targetBlockId)
    if (!el) return "missing"

    // 先粗对齐一次，再恢复选区，最后几何稳定校正
    try {
      const scrollOwner = (deps.getScrollContainer?.() ?? null) as HTMLElement | null
      deps.alignTarget(el, restoreTarget.topOffsetPx, scrollOwner)
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
      return "done"
    }

    if (restoreTarget.selection) {
      try {
        await deps.restoreSelection(restoreTarget.selection)
      } catch (error) {
        console.warn("[IR Breakpoint] 恢复选区失败，回退视口锚点对齐:", error)
      }
    }

    if (cancelled || failed) return "done"

    return new Promise(resolve => {
      settleAlign(el, () => {
        if (cancelled || failed) {
          resolve("done")
          return
        }
        deps.onSuccess?.()
        resolve("done")
      })
    })
  }

  const tick = () => {
    if (cancelled || failed) return
    attempts += 1
    void tryRestore().then(result => {
      if (cancelled || failed) return
      if (result === "done") return
      if (attempts >= maxAttempts) {
        fail(new Error("断点恢复超时：目标块未渲染"))
        return
      }
      trackTimeout(schedule(tick, RESTORE_RETRY_DELAY_MS))
    }).catch(error => {
      fail(error instanceof Error ? error : new Error(String(error)))
    })
  }

  trackTimeout(schedule(tick, RESTORE_INITIAL_DELAY_MS))

  return { cancel }
}
