import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { callChatCompletions, normalizeChatUsage } from "./aiChatClient"
import { clearAISettingsCache } from "./aiSettingsSchema"
import {
  getAiRequestSemaphore,
  resetAiRequestSemaphore
} from "./aiChatPolicy"
import {
  clearAiRequestLog,
  getAiRequestLog,
  getAiUsageTotals
} from "./aiRequestLog"

const PLUGIN = "test-ai-chat-client"

function installSettings(overrides?: Record<string, string>) {
  ;(globalThis as any).orca = {
    state: {
      plugins: {
        [PLUGIN]: {
          settings: {
            "ai.apiKey": "test-key",
            "ai.apiUrl": "https://example.test/v1/chat/completions",
            "ai.model": "test-model",
            ...overrides
          }
        }
      }
    }
  }
}

function jsonResponse(
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  const body = JSON.stringify(payload)
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(new TextEncoder().encode(body).byteLength),
      ...extraHeaders
    }
  })
}

function okFetch(content: string, extra?: Record<string, unknown>) {
  return vi.fn(async () =>
    jsonResponse({ choices: [{ message: { content } }], ...extra })
  )
}

describe("callChatCompletions", () => {
  beforeEach(() => {
    clearAISettingsCache()
    installSettings()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAISettingsCache()
  })

  it("posts to the configured url with bearer auth and returns content", async () => {
    const fetchImpl = okFetch("hello")
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
      maxTokens: 100,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.content).toBe("hello")
    expect(result.status).toBe(200)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://example.test/v1/chat/completions")
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    )
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe("test-model")
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(100)
    expect(body.stream).toBe(false)
  })

  it("fails with NO_API_KEY before issuing any request", async () => {
    installSettings({ "ai.apiKey": "" })
    const fetchImpl = okFetch("x")
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("NO_API_KEY")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("applies modelOverride to the request body only", async () => {
    const fetchImpl = okFetch("x")
    await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      modelOverride: "  other-model  ",
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).model).toBe("other-model")
  })

  it("maps HTTP failures to HTTP_<status> with the upstream message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "model not found" } }, 404)
    )
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("HTTP_404")
    expect(result.error.message).toContain("model not found")
    expect(result.status).toBe(404)
  })

  it("redacts the api key out of upstream error bodies", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "bad key test-key rejected" } }, 401)
    )
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.message).not.toContain("test-key")
  })

  it("returns EMPTY_RESPONSE when content is missing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [] }))
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("EMPTY_RESPONSE")
  })

  it("allowEmptyContent lets a connection probe succeed without content", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ model: "gateway-model", choices: [] })
    )
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "Hi" }],
      allowEmptyContent: true,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.content).toBe("")
    expect(result.model).toBe("gateway-model")
  })

  it("reports CANCELLED when the caller signal is already aborted", async () => {
    const fetchImpl = okFetch("x")
    const controller = new AbortController()
    controller.abort()

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("CANCELLED")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("reports CANCELLED when the caller aborts mid-flight", async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
          setTimeout(() => controller.abort(), 0)
        })
    )

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("CANCELLED")
  })

  it("reports TIMEOUT with the configured label when the deadline passes", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        })
    )

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 10,
      timeoutLabel: "连接超时",
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("TIMEOUT")
    expect(result.error.message).toContain("连接超时")
  })

  it("classifies JSON parse failures separately from network errors", async () => {
    const fetchImpl = vi.fn(async () => {
      const body = "not json at all"
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length)
        }
      })
    })

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("RESPONSE_PARSE_ERROR")
  })

  it("classifies thrown transport failures as NETWORK_ERROR", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      // 本例只验分类；重试行为另有用例，这里不必空等退避
      maxRetries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("NETWORK_ERROR")
  })

  it("surfaces usage when the upstream reports it", async () => {
    const fetchImpl = okFetch("hi", {
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
    })
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 5,
      totalTokens: 17
    })
  })

  it("uses settingsOverride without touching the cached settings", async () => {
    const fetchImpl = okFetch("x")
    await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      settingsOverride: {
        apiKey: "draft-key",
        apiUrl: "https://draft.test/v1/chat/completions",
        model: "draft-model"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://draft.test/v1/chat/completions")
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer draft-key"
    )
  })
})

describe("normalizeChatUsage", () => {
  it("returns undefined when the upstream omits usage", () => {
    expect(normalizeChatUsage(undefined)).toBeUndefined()
    expect(normalizeChatUsage({})).toBeUndefined()
  })

  it("derives total from prompt + completion when absent", () => {
    expect(normalizeChatUsage({ prompt_tokens: 3, completion_tokens: 4 })).toEqual(
      { promptTokens: 3, completionTokens: 4, totalTokens: 7 }
    )
  })
})

describe("callChatCompletions retry policy", () => {
  beforeEach(() => {
    clearAISettingsCache()
    installSettings()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAISettingsCache()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  it("retries a 503 and reports the attempt count on success", async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      if (calls === 1) return jsonResponse({ error: { message: "busy" } }, 503)
      return jsonResponse({ choices: [{ message: { content: "ok" } }] })
    })

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      // Retry-After: 0 让退避不真的睡，测的是重试决策本身
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.content).toBe("ok")
    expect(result.attempts).toBe(2)
  })

  it("does not retry a 401", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "bad key" } }, 401)
    )

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.attempts).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("honours maxRetries: 0", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503))

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0
    })

    expect(result.success).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("gives up after maxRetries and surfaces the last error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "still busy" } }, 503, {
        "Retry-After": "0"
      })
    )

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("HTTP_503")
    expect(result.attempts).toBe(3)
  })

  it("stops retrying when the caller aborts during backoff", async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => {
      queueMicrotask(() => controller.abort())
      return jsonResponse({}, 503)
    })

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 3
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("CANCELLED")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe("callChatCompletions concurrency gate", () => {
  beforeEach(() => {
    clearAISettingsCache()
    installSettings()
    clearAiRequestLog()
    resetAiRequestSemaphore(2)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAISettingsCache()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  it("never exceeds the configured in-flight limit", async () => {
    let inFlight = 0
    let peak = 0
    const release: Array<() => void> = []

    const fetchImpl = vi.fn(() => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      return new Promise<Response>((resolve) => {
        release.push(() => {
          inFlight -= 1
          resolve(jsonResponse({ choices: [{ message: { content: "x" } }] }))
        })
      })
    })

    const calls = Array.from({ length: 5 }, () =>
      callChatCompletions({
        pluginName: PLUGIN,
        messages: [{ role: "user", content: "hi" }],
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    )

    // acquire 是异步的：先让出一轮，等首批请求真正进入 fetch
    await new Promise((r) => setTimeout(r, 0))

    let settled = 0
    // 逐个放行，直到 5 个请求全部完成
    while (settled < 5) {
      const next = release.shift()
      if (next) {
        next()
        settled += 1
      }
      await new Promise((r) => setTimeout(r, 0))
    }
    await Promise.all(calls)

    expect(peak).toBeLessThanOrEqual(2)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it("bypassConcurrencyGate skips the queue entirely", async () => {
    const semaphore = getAiRequestSemaphore()
    // 占满名额：被闸门管辖的请求会排队，绕过闸门的不会
    await semaphore.acquire()
    await semaphore.acquire()

    const fetchImpl = okFetch("probe")
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "Hi" }],
      bypassConcurrencyGate: true,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(true)
    semaphore.release()
    semaphore.release()
  })
})

describe("callChatCompletions request log", () => {
  beforeEach(() => {
    clearAISettingsCache()
    installSettings()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAISettingsCache()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  it("records a successful call with usage and host", async () => {
    const fetchImpl = okFetch("hi", {
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
    })
    await callChatCompletions({
      pluginName: PLUGIN,
      purpose: "card",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const [entry] = getAiRequestLog()
    expect(entry.ok).toBe(true)
    expect(entry.purpose).toBe("card")
    expect(entry.model).toBe("test-model")
    expect(entry.endpointHost).toBe("example.test")
    expect(entry.usage?.totalTokens).toBe(14)

    const totals = getAiUsageTotals()
    expect(totals.requests).toBe(1)
    expect(totals.totalTokens).toBe(14)
  })

  it("records failures with a redacted message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "key test-key is invalid" } }, 401)
    )
    await callChatCompletions({
      pluginName: PLUGIN,
      purpose: "quick",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const [entry] = getAiRequestLog()
    expect(entry.ok).toBe(false)
    expect(entry.errorCode).toBe("HTTP_401")
    expect(entry.errorMessage).not.toContain("test-key")
    expect(getAiUsageTotals().failed).toBe(1)
  })

  it("does not log a missing-key configuration error as a request", async () => {
    installSettings({ "ai.apiKey": "" })
    await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: okFetch("x") as unknown as typeof fetch
    })

    expect(getAiRequestLog()).toHaveLength(0)
    expect(getAiUsageTotals().requests).toBe(0)
  })
})

describe("callChatCompletions output-budget truncation", () => {
  beforeEach(() => {
    clearAISettingsCache()
    installSettings()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAISettingsCache()
    clearAiRequestLog()
    resetAiRequestSemaphore()
  })

  it("reports a truncated response instead of letting broken JSON through", async () => {
    // 真实案例：deepseek-v4-flash 把 2000 中的 1827 花在推理上，
    // 正文只写到一半。以前这会被报成「不是合法 JSON」——把预算问题
    // 说成模型返回有问题，用户照着排查永远查不到根因。
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: { content: '{"cards":[{"type":"choice","question":"半' },
            finish_reason: "length"
          }
        ],
        usage: {
          prompt_tokens: 685,
          completion_tokens: 2000,
          total_tokens: 2685,
          completion_tokens_details: { reasoning_tokens: 1827 }
        }
      })
    )

    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      maxRetries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("RESPONSE_TRUNCATED")
    expect(result.error.message).toContain("2000")
    expect(result.error.message).toContain("1827")
    expect(result.error.message).toContain("最大输出 token")
  })

  it("still reports truncation when usage is absent", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: "half" }, finish_reason: "length" }]
      })
    )
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      maxRetries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("RESPONSE_TRUNCATED")
  })

  it("names the budget when only reasoning came back", async () => {
    // 语言选项那个 bug：推理吃光预算，content 一个字都没剩
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          { message: { content: "", reasoning_content: "想了很久…" } }
        ]
      })
    )
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      maxRetries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("EMPTY_RESPONSE")
    expect(result.error.message).toContain("最大输出 token")
  })

  it("surfaces reasoning tokens in usage", async () => {
    const fetchImpl = okFetch("ok", {
      usage: {
        prompt_tokens: 10,
        completion_tokens: 500,
        total_tokens: 510,
        completion_tokens_details: { reasoning_tokens: 400 }
      }
    })
    const result = await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.usage?.reasoningTokens).toBe(400)
  })

  it("sends the configured output budget by default", async () => {
    const fetchImpl = okFetch("ok")
    await callChatCompletions({
      pluginName: PLUGIN,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).max_tokens).toBe(16384)
  })
})
