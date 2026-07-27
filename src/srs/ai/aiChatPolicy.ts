/**
 * AI 请求策略：并发闸门 + 有限次退避重试。
 *
 * 两条动机：
 * 1. 后台快捷插入任务（startBackgroundQuickInsertJob）此前无并发上限，
 *    连续划选多段文字点同一提示词会同时打出 N 个请求。
 * 2. 429 / 5xx / 瞬时网络错误此前一律直接失败；多模型网关下这是高频场景。
 *
 * 只重试幂等且明确可恢复的失败，绝不重试用户取消、鉴权错误与业务 4xx。
 */

/** 同时在途的 Chat Completions 请求上限。 */
export const DEFAULT_MAX_CONCURRENT_AI_REQUESTS = 3

/** 最多额外重试次数（首次请求不计）。 */
export const DEFAULT_MAX_RETRIES = 2

/** 首次重试基准延迟；其后指数递增。 */
export const RETRY_BASE_DELAY_MS = 800

/** 单次重试等待上限，避免 Retry-After 给出离谱值时长时间挂起。 */
export const RETRY_MAX_DELAY_MS = 8_000

export class AbortedWhileQueuedError extends Error {
  constructor() {
    super("已取消生成")
    this.name = "AbortedWhileQueuedError"
  }
}

type Waiter = () => void

/**
 * 计数信号量。FIFO 唤醒，保证先到的请求先发，避免后台任务饿死交互请求。
 */
export class Semaphore {
  private active = 0
  private readonly waiters: Waiter[] = []

  constructor(private limit: number) {
    if (limit < 1) throw new Error("Semaphore limit must be >= 1")
  }

  get inFlight(): number {
    return this.active
  }

  get queued(): number {
    return this.waiters.length
  }

  /** 调整上限；放宽时立即唤醒等待者。 */
  setLimit(next: number): void {
    if (next < 1) throw new Error("Semaphore limit must be >= 1")
    this.limit = next
    while (this.active < this.limit && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!
      this.active += 1
      waiter()
    }
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new AbortedWhileQueuedError()

    if (this.active < this.limit) {
      this.active += 1
      return
    }

    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = () => {
        if (signal) signal.removeEventListener("abort", onAbort)
        resolve()
      }
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter)
        // 已被 release 唤醒并从队列摘除时不再拒绝，避免持有的名额泄漏。
        if (index >= 0) {
          this.waiters.splice(index, 1)
          reject(new AbortedWhileQueuedError())
        }
      }
      if (signal) signal.addEventListener("abort", onAbort, { once: true })
      this.waiters.push(waiter)
    })
  }

  /** 丢弃所有在途/排队状态。仅供测试隔离使用。 */
  reset(limit: number): void {
    this.limit = limit
    this.active = 0
    this.waiters.length = 0
  }

  release(): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      // 名额直接转交等待者，active 不变。
      waiter()
      return
    }
    this.active = Math.max(0, this.active - 1)
  }
}

const globalSemaphore = new Semaphore(DEFAULT_MAX_CONCURRENT_AI_REQUESTS)

export function getAiRequestSemaphore(): Semaphore {
  return globalSemaphore
}

/**
 * 测试用：重置在途计数与等待队列。
 * 只调 setLimit 不够——上一个用例泄漏的名额会让后续全部用例挂死。
 */
export function resetAiRequestSemaphore(
  limit = DEFAULT_MAX_CONCURRENT_AI_REQUESTS
): void {
  globalSemaphore.reset(limit)
}

/**
 * 该错误码是否值得重试。
 *
 * - 429：限流，等一会儿有意义
 * - 500/502/503/504：上游/网关瞬时故障
 * - NETWORK_ERROR：连接层抖动
 *
 * 明确不重试：CANCELLED（用户意图）、TIMEOUT（deadline 就是 deadline，
 * 重试会让用户等两倍时间）、其余 4xx（鉴权/参数错误，重试必然同样失败）、
 * RESPONSE_PARSE_ERROR（上游返回结构不对，重试无益）。
 */
export function isRetryableErrorCode(code: string): boolean {
  if (code === "NETWORK_ERROR") return true
  if (code === "HTTP_429") return true
  const match = /^HTTP_(\d{3})$/.exec(code)
  if (!match) return false
  const status = Number(match[1])
  return status === 500 || status === 502 || status === 503 || status === 504
}

/**
 * 解析 Retry-After：整数秒或 HTTP 日期。
 * 无法解析或为负返回 null，由调用方退回指数退避。
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
  nowMs: number
): number | null {
  if (!headerValue) return null
  const raw = headerValue.trim()
  if (!raw) return null

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw)
    if (!Number.isFinite(seconds) || seconds < 0) return null
    return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS)
  }

  // 纯数字形态到这里只剩负数/小数等非法值。不能落到 Date.parse：
  // `Date.parse("-1")` 会解析成远古日期 → delta<0 → 0ms，等于让畸形头绕过退避。
  if (/^[+-]?[\d.]+$/.test(raw)) return null

  // HTTP-date 必然含星期/月份名；不含字母的一律视为畸形。
  if (!/[a-z]/i.test(raw)) return null

  const at = Date.parse(raw)
  if (Number.isNaN(at)) return null
  const delta = at - nowMs
  if (delta <= 0) return 0
  return Math.min(delta, RETRY_MAX_DELAY_MS)
}

/** 第 attempt 次重试（从 0 起）的退避延迟。 */
export function backoffDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS)
}

/**
 * 可被 signal 打断的等待。
 * 用户在退避期间取消时立即抛出，不再空等。
 */
export function delayWithAbort(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedWhileQueuedError())
      return
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AbortedWhileQueuedError())
    }
    if (signal) signal.addEventListener("abort", onAbort, { once: true })
  })
}
