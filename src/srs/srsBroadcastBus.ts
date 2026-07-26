/**
 * SRS 广播总线（模块级）
 *
 * Orca `orca.broadcasts` 每个事件类型只允许注册**一个** handler
 * （`isHandlerRegistered(type)` 按类型判断；重复 register 会抛错）。
 *
 * 本模块对每个 SRS 事件类型只注册一个底层 handler，再扇出到本地订阅者 Set，
 * 从而支持多 Flash Home 实例共存、反复挂载/卸载而不抛错、不丢刷新。
 */

import { SRS_EVENTS } from "./srsEvents"

export type SrsBroadcastEventType =
  | typeof SRS_EVENTS.CARD_GRADED
  | typeof SRS_EVENTS.CARD_POSTPONED
  | typeof SRS_EVENTS.CARD_SUSPENDED

export type SrsBroadcastHandler = (...args: unknown[]) => void

const ALL_TYPES: SrsBroadcastEventType[] = [
  SRS_EVENTS.CARD_GRADED,
  SRS_EVENTS.CARD_POSTPONED,
  SRS_EVENTS.CARD_SUSPENDED
]

/** 每个事件类型的订阅者 */
const subscribers = new Map<SrsBroadcastEventType, Set<SrsBroadcastHandler>>()

/** 已挂到 orca.broadcasts 的底层 handler（每类型至多一个） */
const orcaHandlers = new Map<SrsBroadcastEventType, SrsBroadcastHandler>()

function getSubscriberSet(type: SrsBroadcastEventType): Set<SrsBroadcastHandler> {
  let set = subscribers.get(type)
  if (!set) {
    set = new Set()
    subscribers.set(type, set)
  }
  return set
}

function fanOut(type: SrsBroadcastEventType, ...args: unknown[]): void {
  const set = subscribers.get(type)
  if (!set || set.size === 0) return
  // 拷贝后迭代，避免回调里 subscribe/unsubscribe 改 Set 导致漏调
  for (const cb of Array.from(set)) {
    try {
      cb(...args)
    } catch (error) {
      console.error(`[srsBroadcastBus] 订阅者处理 ${type} 失败:`, error)
    }
  }
}

/**
 * 确保该类型在 orca.broadcasts 上有且仅有一个底层 handler。
 * 幂等：已注册或 isHandlerRegistered 为真时不重复 register。
 */
function ensureOrcaHandler(type: SrsBroadcastEventType): void {
  if (orcaHandlers.has(type)) return

  const broadcasts = orca?.broadcasts
  if (!broadcasts) {
    console.error(`[srsBroadcastBus] orca.broadcasts 不可用，无法注册 ${type}`)
    return
  }

  // 宿主可能已有残留（插件热重载）；先尽量摘掉未知旧 handler 的「已注册」状态无法摘，
  // 但 isHandlerRegistered 为真时不得再 register（会抛错）。
  try {
    if (typeof broadcasts.isHandlerRegistered === "function"
      && broadcasts.isHandlerRegistered(type)) {
      // 残留占用：仍装本地 fan-out 代理，但无法替换宿主侧未知 handler。
      // 记录可见错误；订阅者本地 Set 仍工作于「我们之后成功注册」的路径。
      // 若宿主残留的是本插件旧实例 handler，热重载场景可能收不到新 fan-out——
      // unload teardown 会 unregister 我们自己的 handler 以降低残留。
      console.warn(
        `[srsBroadcastBus] ${type} 已被宿主注册，跳过底层 register（避免 already registered）`
      )
      return
    }
  } catch (error) {
    console.error(`[srsBroadcastBus] isHandlerRegistered(${type}) 失败:`, error)
  }

  const handler: SrsBroadcastHandler = (...args: unknown[]) => {
    fanOut(type, ...args)
  }

  try {
    broadcasts.registerHandler(type, handler)
    orcaHandlers.set(type, handler)
  } catch (error) {
    // 竞态或宿主仍抛 already registered：可见但不让 UI 崩溃
    console.error(
      `[srsBroadcastBus] registerHandler(${type}) 失败:`,
      error
    )
  }
}

function dropOrcaHandler(type: SrsBroadcastEventType): void {
  const handler = orcaHandlers.get(type)
  if (!handler) return

  const broadcasts = orca?.broadcasts
  if (broadcasts?.unregisterHandler) {
    try {
      broadcasts.unregisterHandler(type, handler)
    } catch (error) {
      console.error(
        `[srsBroadcastBus] unregisterHandler(${type}) 失败:`,
        error
      )
    }
  }
  orcaHandlers.delete(type)
}

/**
 * 订阅 SRS 广播。返回 dispose，调用后从 Set 移除；
 * 该类型无剩余订阅者时注销底层 Orca handler。
 */
export function subscribeSrsBroadcast(
  type: SrsBroadcastEventType,
  handler: SrsBroadcastHandler
): () => void {
  const set = getSubscriberSet(type)
  set.add(handler)
  ensureOrcaHandler(type)

  return () => {
    set.delete(handler)
    if (set.size === 0) {
      dropOrcaHandler(type)
    }
  }
}

/**
 * 一次订阅三个 Flash Home 关心的事件；返回统一 dispose。
 */
export function subscribeSrsCardLifecycleEvents(handlers: {
  graded?: SrsBroadcastHandler
  postponed?: SrsBroadcastHandler
  suspended?: SrsBroadcastHandler
}): () => void {
  const disposers: Array<() => void> = []
  if (handlers.graded) {
    disposers.push(subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, handlers.graded))
  }
  if (handlers.postponed) {
    disposers.push(
      subscribeSrsBroadcast(SRS_EVENTS.CARD_POSTPONED, handlers.postponed)
    )
  }
  if (handlers.suspended) {
    disposers.push(
      subscribeSrsBroadcast(SRS_EVENTS.CARD_SUSPENDED, handlers.suspended)
    )
  }
  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}

/**
 * 插件卸载时注销所有底层 Orca handler 并清空订阅者。
 * 保证热重载后不会因残留 isHandlerRegistered 而无法再注册。
 */
export function teardownSrsBroadcastBus(): void {
  for (const type of ALL_TYPES) {
    dropOrcaHandler(type)
    subscribers.get(type)?.clear()
  }
}

/** 测试用：当前某类型订阅者数量 */
export function getSrsBroadcastSubscriberCount(
  type: SrsBroadcastEventType
): number {
  return subscribers.get(type)?.size ?? 0
}

/** 测试用：是否已挂底层 Orca handler */
export function isSrsBroadcastOrcaHandlerActive(
  type: SrsBroadcastEventType
): boolean {
  return orcaHandlers.has(type)
}
