import { describe, expect, it, vi } from "vitest"
import {
  AbortedWhileQueuedError,
  backoffDelayMs,
  delayWithAbort,
  isRetryableErrorCode,
  parseRetryAfterMs,
  RETRY_MAX_DELAY_MS,
  Semaphore
} from "./aiChatPolicy"

describe("isRetryableErrorCode", () => {
  it("retries rate limits, gateway faults and network flakes", () => {
    for (const code of [
      "HTTP_429",
      "HTTP_500",
      "HTTP_502",
      "HTTP_503",
      "HTTP_504",
      "NETWORK_ERROR"
    ]) {
      expect(isRetryableErrorCode(code)).toBe(true)
    }
  })

  it("never retries user intent, auth or request-shape failures", () => {
    // CANCELLED 是用户意图；TIMEOUT 重试会让用户等两倍时间；
    // 4xx 与解析错误重试必然同样失败。
    for (const code of [
      "CANCELLED",
      "TIMEOUT",
      "HTTP_400",
      "HTTP_401",
      "HTTP_403",
      "HTTP_404",
      "HTTP_422",
      "HTTP_501",
      "RESPONSE_PARSE_ERROR",
      "RESPONSE_TOO_LARGE",
      "EMPTY_RESPONSE",
      "NO_API_KEY"
    ]) {
      expect(isRetryableErrorCode(code)).toBe(false)
    }
  })
})

describe("parseRetryAfterMs", () => {
  const now = 1_700_000_000_000

  it("reads integer seconds", () => {
    expect(parseRetryAfterMs("2", now)).toBe(2000)
  })

  it("reads HTTP dates as a delta from now", () => {
    const at = new Date(now + 3000).toUTCString()
    const parsed = parseRetryAfterMs(at, now)
    expect(parsed).not.toBeNull()
    expect(parsed!).toBeGreaterThan(0)
    expect(parsed!).toBeLessThanOrEqual(3000)
  })

  it("clamps absurd values to the max wait", () => {
    expect(parseRetryAfterMs("99999", now)).toBe(RETRY_MAX_DELAY_MS)
  })

  it("treats past dates as no wait", () => {
    expect(parseRetryAfterMs(new Date(now - 5000).toUTCString(), now)).toBe(0)
  })

  it("returns null for missing or unparsable values", () => {
    expect(parseRetryAfterMs(null, now)).toBeNull()
    expect(parseRetryAfterMs("", now)).toBeNull()
    expect(parseRetryAfterMs("soon", now)).toBeNull()
    expect(parseRetryAfterMs("-1", now)).toBeNull()
  })
})

describe("backoffDelayMs", () => {
  it("grows exponentially and saturates", () => {
    expect(backoffDelayMs(0)).toBe(800)
    expect(backoffDelayMs(1)).toBe(1600)
    expect(backoffDelayMs(2)).toBe(3200)
    expect(backoffDelayMs(20)).toBe(RETRY_MAX_DELAY_MS)
  })
})

describe("Semaphore", () => {
  it("caps how many holders run at once", async () => {
    const sem = new Semaphore(2)
    await sem.acquire()
    await sem.acquire()
    expect(sem.inFlight).toBe(2)

    let third = false
    const pending = sem.acquire().then(() => {
      third = true
    })

    await Promise.resolve()
    expect(third).toBe(false)
    expect(sem.queued).toBe(1)

    sem.release()
    await pending
    expect(third).toBe(true)
  })

  it("wakes waiters in FIFO order so interactive work is not starved", async () => {
    const sem = new Semaphore(1)
    await sem.acquire()

    const order: number[] = []
    const a = sem.acquire().then(() => order.push(1))
    const b = sem.acquire().then(() => order.push(2))
    const c = sem.acquire().then(() => order.push(3))

    sem.release()
    await a
    sem.release()
    await b
    sem.release()
    await c

    expect(order).toEqual([1, 2, 3])
  })

  it("rejects a queued waiter when the caller aborts", async () => {
    const sem = new Semaphore(1)
    await sem.acquire()

    const controller = new AbortController()
    const pending = sem.acquire(controller.signal)
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(AbortedWhileQueuedError)
    expect(sem.queued).toBe(0)
  })

  it("rejects immediately when the signal is already aborted", async () => {
    const sem = new Semaphore(1)
    const controller = new AbortController()
    controller.abort()
    await expect(sem.acquire(controller.signal)).rejects.toBeInstanceOf(
      AbortedWhileQueuedError
    )
    expect(sem.inFlight).toBe(0)
  })

  it("does not leak a permit when abort races a release", async () => {
    const sem = new Semaphore(1)
    await sem.acquire()

    const controller = new AbortController()
    const pending = sem.acquire(controller.signal)

    // release 先把名额交给 waiter，随后到达的 abort 不应再拒绝或吞掉名额
    sem.release()
    controller.abort()

    await expect(pending).resolves.toBeUndefined()
    expect(sem.inFlight).toBe(1)

    sem.release()
    expect(sem.inFlight).toBe(0)
  })

  it("releasing more than acquired never drives the count negative", () => {
    const sem = new Semaphore(1)
    sem.release()
    sem.release()
    expect(sem.inFlight).toBe(0)
  })

  it("raising the limit wakes queued waiters", async () => {
    const sem = new Semaphore(1)
    await sem.acquire()

    let woke = false
    const pending = sem.acquire().then(() => {
      woke = true
    })
    await Promise.resolve()
    expect(woke).toBe(false)

    sem.setLimit(2)
    await pending
    expect(woke).toBe(true)
  })
})

describe("delayWithAbort", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers()
    try {
      const p = delayWithAbort(500)
      vi.advanceTimersByTime(500)
      await expect(p).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("resolves immediately for non-positive waits", async () => {
    await expect(delayWithAbort(0)).resolves.toBeUndefined()
  })

  it("rejects as soon as the caller aborts mid-wait", async () => {
    const controller = new AbortController()
    const p = delayWithAbort(10_000, controller.signal)
    controller.abort()
    await expect(p).rejects.toBeInstanceOf(AbortedWhileQueuedError)
  })

  it("rejects when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      delayWithAbort(10_000, controller.signal)
    ).rejects.toBeInstanceOf(AbortedWhileQueuedError)
  })
})
