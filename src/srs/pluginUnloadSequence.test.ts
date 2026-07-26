/**
 * FC-03：unload 在注销之前 flush（复习日志 + 渐进阅读断点在途写入）
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  runPluginUnloadSequence,
  UNLOAD_BREAKPOINT_FLUSH_PENDING_MESSAGE,
  UNLOAD_LOG_FLUSH_PENDING_MESSAGE
} from "./pluginUnloadSequence"
import {
  BreakpointSaveChannel,
  resetBreakpointSaveChannelRegistryForTests
} from "./incremental-reading/irBreakpointStorage"

describe("pluginUnloadSequence (FC-03)", () => {
  afterEach(() => {
    resetBreakpointSaveChannelRegistryForTests()
  })

  it("在 cleanup/注销步骤之前依次 flush 复习日志与断点", async () => {
    const order: string[] = []
    const flush = vi.fn(async () => {
      order.push("flush")
    })
    const flushBreakpoints = vi.fn(async () => {
      order.push("flushBreakpoints")
      return { drainedChannels: 0 }
    })

    const result = await runPluginUnloadSequence({
      pluginName: "orca-srs",
      flush,
      flushBreakpoints,
      cleanupSteps: [
        { name: "unregister", run: () => { order.push("unregister") } },
        { name: "cleanup", run: async () => { order.push("cleanup") } }
      ]
    })

    expect(order).toEqual(["flush", "flushBreakpoints", "unregister", "cleanup"])
    expect(result.flushOk).toBe(true)
    expect(result.breakpointFlushOk).toBe(true)
    expect(result.cleanupErrors).toHaveLength(0)
  })

  it("flush 失败时 console.error + notify，仍继续卸载", async () => {
    const order: string[] = []
    const notify = vi.fn()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await runPluginUnloadSequence({
      pluginName: "orca-srs",
      flush: async () => {
        order.push("flush-fail")
        throw new Error("disk")
      },
      flushBreakpoints: async () => {
        order.push("flushBreakpoints")
      },
      notifyFlushFailure: notify,
      cleanupSteps: [
        { name: "unregister", run: () => { order.push("unregister") } }
      ]
    })

    expect(order).toEqual(["flush-fail", "flushBreakpoints", "unregister"])
    expect(result.flushOk).toBe(false)
    expect(result.breakpointFlushOk).toBe(true)
    expect(notify).toHaveBeenCalledWith(
      UNLOAD_LOG_FLUSH_PENDING_MESSAGE,
      expect.any(Error)
    )
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("断点 flush 失败时 console.error + notify，仍继续卸载且日志 flush 不受影响", async () => {
    const order: string[] = []
    const notify = vi.fn()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await runPluginUnloadSequence({
      pluginName: "orca-srs",
      flush: async () => {
        order.push("flush")
      },
      flushBreakpoints: async () => {
        order.push("flushBreakpoints-fail")
        throw new Error("breakpoint drain boom")
      },
      notifyFlushFailure: notify,
      cleanupSteps: [
        { name: "unregister", run: () => { order.push("unregister") } }
      ]
    })

    expect(order).toEqual(["flush", "flushBreakpoints-fail", "unregister"])
    expect(result.flushOk).toBe(true)
    expect(result.breakpointFlushOk).toBe(false)
    expect(result.breakpointFlushError).toBeInstanceOf(Error)
    expect(notify).toHaveBeenCalledWith(
      UNLOAD_BREAKPOINT_FLUSH_PENDING_MESSAGE,
      expect.any(Error)
    )
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("默认断点 flush 排空活动通道：在途写入完成后才进入 cleanup", async () => {
    resetBreakpointSaveChannelRegistryForTests()
    const order: string[] = []
    const channel = new BreakpointSaveChannel()

    let resolvePending!: () => void
    const pendingGate = new Promise<void>((resolve) => {
      resolvePending = resolve
    })
    // 模拟 hook 内已入队、尚未完成的断点写入（unload 前无人 await）
    void channel.enqueue(async () => {
      await pendingGate
      order.push("breakpoint-write")
    })
    setTimeout(() => resolvePending(), 0)

    const result = await runPluginUnloadSequence({
      pluginName: "orca-srs",
      flush: async () => {
        order.push("flush-logs")
      },
      cleanupSteps: [
        { name: "unregister", run: () => { order.push("unregister") } }
      ]
    })

    expect(order).toEqual(["flush-logs", "breakpoint-write", "unregister"])
    expect(result.breakpointFlushOk).toBe(true)
  })

  it("单步 cleanup 失败不阻断后续步骤", async () => {
    const order: string[] = []
    const result = await runPluginUnloadSequence({
      pluginName: "p",
      flush: async () => {
        order.push("flush")
      },
      flushBreakpoints: async () => {
        order.push("flushBreakpoints")
      },
      cleanupSteps: [
        {
          name: "bad",
          run: () => {
            order.push("bad")
            throw new Error("x")
          }
        },
        {
          name: "good",
          run: () => {
            order.push("good")
          }
        }
      ]
    })

    expect(order).toEqual(["flush", "flushBreakpoints", "bad", "good"])
    expect(result.cleanupErrors).toHaveLength(1)
    expect(result.cleanupErrors[0].name).toBe("bad")
  })
})
