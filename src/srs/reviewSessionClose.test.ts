/**
 * FC-03：会话统一 close helper
 */

import { describe, expect, it, vi } from "vitest"
import {
  closeReviewSessionWithFlush,
  createGuardedSessionCloser,
  REVIEW_LOG_FLUSH_PENDING_MESSAGE
} from "./reviewSessionClose"

describe("reviewSessionClose (FC-03)", () => {
  it("完成/关闭均调用 flush；成功时 close 执行", async () => {
    const flush = vi.fn(async () => undefined)
    const close = vi.fn()

    const result = await closeReviewSessionWithFlush({
      pluginName: "orca-srs",
      flush,
      close
    })

    expect(flush).toHaveBeenCalledWith("orca-srs")
    expect(close).toHaveBeenCalledTimes(1)
    expect(result.flushOk).toBe(true)
    expect(result.closed).toBe(true)
  })

  it("flush 失败仍 close，并 notify 可见警告", async () => {
    const flush = vi.fn(async () => {
      throw new Error("flush boom")
    })
    const close = vi.fn()
    const notify = vi.fn()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await closeReviewSessionWithFlush({
      pluginName: "orca-srs",
      flush,
      close,
      notifyFlushFailure: notify
    })

    expect(result.flushOk).toBe(false)
    expect(result.closed).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      REVIEW_LOG_FLUSH_PENDING_MESSAGE,
      expect.any(Error)
    )
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("guarded closer 避免重复点击并发 close", async () => {
    let resolveFlush: (() => void) | null = null
    const flush = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveFlush = resolve
        })
    )
    const close = vi.fn()

    const guarded = createGuardedSessionCloser({
      pluginName: "p",
      flush,
      close
    })

    const p1 = guarded()
    const p2 = guarded()
    expect(p1).toBe(p2)
    expect(flush).toHaveBeenCalledTimes(1)

    resolveFlush!()
    await p1
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("beforeFlush 在 flush 之前执行", async () => {
    const order: string[] = []
    await closeReviewSessionWithFlush({
      pluginName: "p",
      beforeFlush: () => {
        order.push("before")
      },
      flush: async () => {
        order.push("flush")
      },
      close: () => {
        order.push("close")
      }
    })
    expect(order).toEqual(["before", "flush", "close"])
  })
})
