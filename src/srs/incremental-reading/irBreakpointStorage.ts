/**
 * 阅读断点版本控制与合并
 *
 * 同一张卡片的并发保存通过递增版本号串行化，旧响应不得覆盖新断点。
 */

import type { DbId } from "../../orca.d.ts"
import type { IRReadingBreakpoint, IRReadingBreakpointSelection } from "./irTypes"

export type BreakpointSaveRequest = {
  resumeBlockId?: DbId | null
  previewBlockId?: DbId | null
  selection?: IRReadingBreakpointSelection | null
  version: number
}

export type BreakpointMergeResult =
  | { accepted: true; nextVersion: number; breakpoint: IRReadingBreakpoint; resumeBlockId: DbId | null }
  | { accepted: false; reason: "stale_version"; currentVersion: number }

export function nextBreakpointVersion(current: number | undefined | null): number {
  const base = typeof current === "number" && Number.isFinite(current) ? current : 0
  return base + 1
}

export function mergeBreakpointSave(
  currentVersion: number,
  currentResume: DbId | null,
  currentBreakpoint: IRReadingBreakpoint | null | undefined,
  request: BreakpointSaveRequest
): BreakpointMergeResult {
  if (request.version < currentVersion) {
    return {
      accepted: false,
      reason: "stale_version",
      currentVersion
    }
  }

  const base = currentBreakpoint ?? {
    previewBlockId: null,
    selection: null,
    updatedAt: null,
    version: currentVersion
  }

  const nextVersion = Math.max(currentVersion, request.version)
  const resumeBlockId = request.resumeBlockId !== undefined
    ? request.resumeBlockId
    : currentResume

  const breakpoint: IRReadingBreakpoint = {
    previewBlockId: request.previewBlockId !== undefined
      ? request.previewBlockId
      : base.previewBlockId,
    selection: request.selection !== undefined
      ? request.selection
      : base.selection,
    updatedAt: new Date(),
    version: nextVersion
  }

  return {
    accepted: true,
    nextVersion,
    breakpoint,
    resumeBlockId: resumeBlockId ?? null
  }
}

/**
 * 单通道保存队列：保证同一 card 的保存按提交顺序串行执行
 */
export class BreakpointSaveChannel {
  private tail: Promise<void> = Promise.resolve()
  private versions = new Map<DbId, number>()

  getVersion(cardId: DbId): number {
    return this.versions.get(cardId) ?? 0
  }

  allocateVersion(cardId: DbId): number {
    const next = nextBreakpointVersion(this.getVersion(cardId))
    this.versions.set(cardId, next)
    return next
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task)
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

/** 从可见块候选中选择最接近阅读基准线的块 */
export function pickVisibleResumeBlockId(
  candidates: Array<{ blockId: DbId; top: number }>,
  baselineY: number
): DbId | null {
  if (candidates.length === 0) return null

  let best = candidates[0]
  let bestDistance = Math.abs(best.top - baselineY)

  for (let i = 1; i < candidates.length; i++) {
    const item = candidates[i]
    const distance = Math.abs(item.top - baselineY)
    if (distance < bestDistance || (distance === bestDistance && item.top < best.top)) {
      best = item
      bestDistance = distance
    }
  }

  return best.blockId
}
