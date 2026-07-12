/**
 * FC-03：unload 在注销之前 flush
 */

import { describe, expect, it, vi } from "vitest"
import {
  runPluginUnloadSequence,
  UNLOAD_LOG_FLUSH_PENDING_MESSAGE
} from "./pluginUnloadSequence"

describe("pluginUnloadSequence (FC-03)", () => {
  it("在 cleanup/注销步骤之前 flush", async () => {
    const order: string[] = []
    const flush = vi.fn(async () => {
      order.push("flush")
    })

    const result = await runPluginUnloadSequence({
      pluginName: "orca-srs",
      flush,
      cleanupSteps: [
        { name: "unregister", run: () => { order.push("unregister") } },
        { name: "cleanup", run: async () => { order.push("cleanup") } }
      ]
    })

    expect(order).toEqual(["flush", "unregister", "cleanup"])
    expect(result.flushOk).toBe(true)
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
      notifyFlushFailure: notify,
      cleanupSteps: [
        { name: "unregister", run: () => { order.push("unregister") } }
      ]
    })

    expect(order).toEqual(["flush-fail", "unregister"])
    expect(result.flushOk).toBe(false)
    expect(notify).toHaveBeenCalledWith(
      UNLOAD_LOG_FLUSH_PENDING_MESSAGE,
      expect.any(Error)
    )
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("单步 cleanup 失败不阻断后续步骤", async () => {
    const order: string[] = []
    const result = await runPluginUnloadSequence({
      pluginName: "p",
      flush: async () => {
        order.push("flush")
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

    expect(order).toEqual(["flush", "bad", "good"])
    expect(result.cleanupErrors).toHaveLength(1)
    expect(result.cleanupErrors[0].name).toBe("bad")
  })
})
