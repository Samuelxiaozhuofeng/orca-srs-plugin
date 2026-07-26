/**
 * 阅读断点版本控制与合并
 *
 * 同一张卡片的并发保存通过递增版本号串行化，旧响应不得覆盖新断点。
 */

import type { DbId } from "../../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection,
  IRViewportAnchor
} from "./irTypes"

export type BreakpointSaveRequest = {
  resumeBlockId?: DbId | null
  previewBlockId?: DbId | null
  selection?: IRReadingBreakpointSelection | null
  viewportAnchor?: IRViewportAnchor | null
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

  // 与 updateReadingBreakpoint 一致：换 selection/resume 且无新几何 → 清空旧 anchor
  const viewportAnchor = request.viewportAnchor !== undefined
    ? request.viewportAnchor
    : (
      request.selection !== undefined || request.resumeBlockId !== undefined
        ? null
        : (base.viewportAnchor ?? null)
    )

  const breakpoint: IRReadingBreakpoint = {
    previewBlockId: request.previewBlockId !== undefined
      ? request.previewBlockId
      : base.previewBlockId,
    selection: request.selection !== undefined
      ? request.selection
      : base.selection,
    viewportAnchor,
    schemaVersion: viewportAnchor ? 2 : 1,
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
 * 模块级活动通道注册表（WeakRef，避免已卸载组件的通道被注册表钉住）。
 *
 * 断点保存通道生存在 React hook 内部（useIRReadingBreakpoint 的 useRef），
 * unload 序列无法直接触达；通道在构造时自注册，插件卸载通过
 * flushPendingBreakpointSaves 在 Orca 数据 API 仍可用时排空所有在途写入
 * （AGENTS.md 契约：unload flush 阅读断点）。
 * 局限：仍在 debounce、尚未 capture 的断点需要组件 DOM 才能生成，模块层无法代为捕获。
 */
const activeSaveChannels = new Set<WeakRef<BreakpointSaveChannel>>()

/**
 * 单通道保存队列：保证同一 card 的保存按提交顺序串行执行
 */
export class BreakpointSaveChannel {
  private tail: Promise<void> = Promise.resolve()
  private versions = new Map<DbId, number>()

  constructor() {
    activeSaveChannels.add(new WeakRef(this))
  }

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

  /**
   * 等待当前已入队的写入全部结束（不生成新断点任务）。
   * 队列任务自身的失败由入队方报告（persist 的 onSaveError 路径），
   * drain 只保证时序，不重复抛出已上报的写入错误。
   */
  drain(): Promise<void> {
    return this.enqueue(async () => undefined)
  }
}

export type PendingBreakpointFlushResult = {
  /** 本次排空的存活通道数；已被 GC 回收的引用会顺带从注册表清除 */
  drainedChannels: number
}

/**
 * 排空所有存活通道的在途断点写入。
 * 插件 unload 的 flush 阶段调用（Orca 数据 API 仍可用时）；
 * 注册表内部异常向上抛出，由卸载序列记录，不在此处吞错。
 */
export async function flushPendingBreakpointSaves(): Promise<PendingBreakpointFlushResult> {
  const drains: Array<Promise<void>> = []
  for (const ref of activeSaveChannels) {
    const channel = ref.deref()
    if (!channel) {
      activeSaveChannels.delete(ref)
      continue
    }
    drains.push(channel.drain())
  }
  await Promise.all(drains)
  return { drainedChannels: drains.length }
}

/** 仅测试用：清空通道注册表，保证用例间的确定性 */
export function resetBreakpointSaveChannelRegistryForTests(): void {
  activeSaveChannels.clear()
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
