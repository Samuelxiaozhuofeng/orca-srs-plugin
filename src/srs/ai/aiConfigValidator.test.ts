import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createAIConnectionConfigFingerprint,
  isCurrentAIConnectionTestResult,
  testAIConfigWithDetails,
  validateAIConfig
} from "./aiConfigValidator"
import { CONNECTION_TEST_TIMEOUT_MS } from "./aiDraftTypes"

const PLUGIN = "test-ai-config"

function installSettings(settings: Record<string, string>) {
  ;(globalThis as any).orca = {
    state: {
      plugins: {
        [PLUGIN]: { settings }
      }
    }
  }
}

describe("validateAIConfig", () => {
  it("rejects Ollama native /api/chat", () => {
    installSettings({
      "ai.apiKey": "k",
      "ai.apiUrl": "http://localhost:11434/api/chat",
      "ai.model": "llama2"
    })
    const result = validateAIConfig(PLUGIN)
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.includes("/api/chat"))).toBe(true)
    expect(
      result.suggestions.some(s => s.includes("/v1/chat/completions"))
    ).toBe(true)
  })

  it("accepts OpenAI-compatible Ollama endpoint", () => {
    installSettings({
      "ai.apiKey": "k",
      "ai.apiUrl": "http://localhost:11434/v1/chat/completions",
      "ai.model": "llama2"
    })
    const result = validateAIConfig(PLUGIN)
    expect(result.isValid).toBe(true)
  })
})

describe("testAIConfigWithDetails", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installSettings({
      "ai.apiKey": "k",
      "ai.apiUrl": "https://api.openai.com/v1/chat/completions",
      "ai.model": "gpt-3.5-turbo"
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("preserves plain-text HTTP error bodies", async () => {
    const body = "upstream gateway exploded: detail-xyz"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(body, {
          status: 502,
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": String(new TextEncoder().encode(body).byteLength)
          }
        })
      )
    )

    const result = await testAIConfigWithDetails(PLUGIN)
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/upstream gateway exploded/)
  })

  it.each([{}, { choices: [] }])(
    "rejects a 2xx response without a valid choices envelope: %j",
    async (payload) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
      )

      const result = await testAIConfigWithDetails(PLUGIN)
      expect(result.success).toBe(false)
      expect(result.details?.code).toBe("INVALID_RESPONSE_ENVELOPE")
    }
  )

  it("forwards an external abort signal to the connection request", async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"))
            })
          })
      )
    )

    const promise = testAIConfigWithDetails(PLUGIN, undefined, controller.signal)
    controller.abort()
    const result = await promise

    expect(result.success).toBe(false)
    expect(result.details?.code).toBe("CANCELLED")
  })

  it("times out when fetch never resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("Aborted")
              err.name = "AbortError"
              reject(err)
            })
          })
      )
    )

    const promise = testAIConfigWithDetails(PLUGIN)
    await vi.advanceTimersByTimeAsync(CONNECTION_TEST_TIMEOUT_MS + 10)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/超时|TIMEOUT/i)
  })
})

describe("createAIConnectionConfigFingerprint", () => {
  const base = {
    apiKey: "key-a",
    apiUrl: "https://a.test/v1/chat/completions",
    model: "model-a"
  }

  it.each([
    { apiKey: "key-b" },
    { apiUrl: "https://b.test/v1/chat/completions" },
    { model: "model-b" }
  ])("changes when a connection field changes: %j", (change) => {
    expect(createAIConnectionConfigFingerprint({ ...base, ...change })).not.toBe(
      createAIConnectionConfigFingerprint(base)
    )
  })

  it("rejects A after B becomes the current connection test", () => {
    const controllerA = new AbortController()
    const controllerB = new AbortController()
    const fingerprintA = createAIConnectionConfigFingerprint(base)
    const fingerprintB = createAIConnectionConfigFingerprint({
      ...base,
      model: "model-b"
    })

    expect(
      isCurrentAIConnectionTestResult(
        controllerA,
        fingerprintA,
        controllerB,
        fingerprintB
      )
    ).toBe(false)
    expect(
      isCurrentAIConnectionTestResult(
        controllerB,
        fingerprintB,
        controllerB,
        fingerprintB
      )
    ).toBe(true)

    controllerB.abort()
    expect(
      isCurrentAIConnectionTestResult(
        controllerB,
        fingerprintB,
        controllerB,
        fingerprintB
      )
    ).toBe(false)
  })
})
