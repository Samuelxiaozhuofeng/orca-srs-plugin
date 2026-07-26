// @ts-nocheck
/**
 * 模块级广播总线：每事件类型只向 orca.broadcasts 注册一个 handler，扇出到多订阅者
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SRS_EVENTS } from "./srsEvents"

const registerHandler = vi.fn()
const unregisterHandler = vi.fn()
const isHandlerRegistered = vi.fn((_type?: string) => false)
const registeredByType = new Map()

globalThis.orca = {
  broadcasts: {
    isHandlerRegistered: (type) => {
      if (registeredByType.has(type)) return true
      return isHandlerRegistered(type)
    },
    registerHandler: (type, handler) => {
      if (registeredByType.has(type)) {
        throw new Error(`Broadcast handler for ${type} already registered.`)
      }
      registeredByType.set(type, handler)
      registerHandler(type, handler)
    },
    unregisterHandler: (type, handler) => {
      const current = registeredByType.get(type)
      if (current === handler) {
        registeredByType.delete(type)
      }
      unregisterHandler(type, handler)
    },
    broadcast: (type, ...args) => {
      const handler = registeredByType.get(type)
      handler?.(...args)
    }
  }
}

// 动态 import，确保在 mock orca 之后加载模块（模块级 Map 状态）
const {
  subscribeSrsBroadcast,
  subscribeSrsCardLifecycleEvents,
  teardownSrsBroadcastBus,
  getSrsBroadcastSubscriberCount,
  isSrsBroadcastOrcaHandlerActive
} = await import("./srsBroadcastBus")

describe("srsBroadcastBus", () => {
  beforeEach(() => {
    teardownSrsBroadcastBus()
    registeredByType.clear()
    vi.clearAllMocks()
    isHandlerRegistered.mockReturnValue(false)
  })

  afterEach(() => {
    teardownSrsBroadcastBus()
    registeredByType.clear()
  })

  it("多次 subscribe 同一类型只 registerHandler 一次", () => {
    const a = vi.fn()
    const b = vi.fn()
    const d1 = subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, a)
    const d2 = subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, b)

    expect(registerHandler).toHaveBeenCalledTimes(1)
    expect(registerHandler).toHaveBeenCalledWith(
      SRS_EVENTS.CARD_GRADED,
      expect.any(Function)
    )
    expect(getSrsBroadcastSubscriberCount(SRS_EVENTS.CARD_GRADED)).toBe(2)
    expect(isSrsBroadcastOrcaHandlerActive(SRS_EVENTS.CARD_GRADED)).toBe(true)

    d1()
    d2()
  })

  it("两个订阅者共存时都能收到广播", () => {
    const a = vi.fn()
    const b = vi.fn()
    const d1 = subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, a)
    const d2 = subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, b)

    orca.broadcasts.broadcast(SRS_EVENTS.CARD_GRADED, { blockId: 1 })

    expect(a).toHaveBeenCalledWith({ blockId: 1 })
    expect(b).toHaveBeenCalledWith({ blockId: 1 })

    d1()
    d2()
  })

  it("全部退订后调用 unregisterHandler", () => {
    const a = vi.fn()
    const b = vi.fn()
    const d1 = subscribeSrsBroadcast(SRS_EVENTS.CARD_POSTPONED, a)
    const d2 = subscribeSrsBroadcast(SRS_EVENTS.CARD_POSTPONED, b)

    d1()
    expect(unregisterHandler).not.toHaveBeenCalled()
    expect(isSrsBroadcastOrcaHandlerActive(SRS_EVENTS.CARD_POSTPONED)).toBe(true)

    d2()
    expect(unregisterHandler).toHaveBeenCalledTimes(1)
    expect(unregisterHandler).toHaveBeenCalledWith(
      SRS_EVENTS.CARD_POSTPONED,
      expect.any(Function)
    )
    expect(isSrsBroadcastOrcaHandlerActive(SRS_EVENTS.CARD_POSTPONED)).toBe(false)
  })

  it("重复注册不抛错（二次 subscribe 不触发底层 register）", () => {
    const a = vi.fn()
    const b = vi.fn()
    expect(() => {
      subscribeSrsBroadcast(SRS_EVENTS.CARD_SUSPENDED, a)
      subscribeSrsBroadcast(SRS_EVENTS.CARD_SUSPENDED, b)
    }).not.toThrow()
    expect(registerHandler).toHaveBeenCalledTimes(1)
  })

  it("subscribeSrsCardLifecycleEvents 一次订阅三事件并统一 dispose", () => {
    const graded = vi.fn()
    const postponed = vi.fn()
    const suspended = vi.fn()
    const dispose = subscribeSrsCardLifecycleEvents({
      graded,
      postponed,
      suspended
    })

    expect(registerHandler).toHaveBeenCalledTimes(3)

    orca.broadcasts.broadcast(SRS_EVENTS.CARD_GRADED, { x: 1 })
    orca.broadcasts.broadcast(SRS_EVENTS.CARD_POSTPONED, { x: 2 })
    orca.broadcasts.broadcast(SRS_EVENTS.CARD_SUSPENDED, { x: 3 })

    expect(graded).toHaveBeenCalledWith({ x: 1 })
    expect(postponed).toHaveBeenCalledWith({ x: 2 })
    expect(suspended).toHaveBeenCalledWith({ x: 3 })

    dispose()
    expect(unregisterHandler).toHaveBeenCalledTimes(3)
  })

  it("teardown 清空底层 handler，之后可再次注册", () => {
    const a = vi.fn()
    subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, a)
    expect(registerHandler).toHaveBeenCalledTimes(1)

    teardownSrsBroadcastBus()
    expect(isSrsBroadcastOrcaHandlerActive(SRS_EVENTS.CARD_GRADED)).toBe(false)

    subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, a)
    expect(registerHandler).toHaveBeenCalledTimes(2)
  })

  it("宿主已注册时不抛 already registered", () => {
    registeredByType.set(SRS_EVENTS.CARD_GRADED, () => {})
    const a = vi.fn()
    expect(() => {
      subscribeSrsBroadcast(SRS_EVENTS.CARD_GRADED, a)
    }).not.toThrow()
    // 未再次 register（避免抛错）
    expect(registerHandler).not.toHaveBeenCalled()
  })
})
