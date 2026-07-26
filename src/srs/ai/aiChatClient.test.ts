import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { callChatCompletions, normalizeChatUsage } from "./aiChatClient"
import { clearAISettingsCache } from "./aiSettingsSchema"

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

function jsonResponse(payload: unknown, status = 200): Response {
  const body = JSON.stringify(payload)
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(new TextEncoder().encode(body).byteLength)
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
