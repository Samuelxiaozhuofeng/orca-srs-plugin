import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generateFlashcardDrafts } from "./aiService"

const PLUGIN = "test-ai-service"
const SOURCE = "使役形（～させる）表示让某人做某事。"

function installSettings() {
  ;(globalThis as any).orca = {
    state: {
      plugins: {
        [PLUGIN]: {
          settings: {
            "ai.apiKey": "test-key",
            "ai.apiUrl": "https://example.test/v1/chat/completions",
            "ai.model": "test-model"
          }
        }
      }
    }
  }
}

describe("generateFlashcardDrafts", () => {
  beforeEach(() => {
    installSettings()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockOkFetch(content: string) {
    const payload = JSON.stringify({
      choices: [{ message: { content } }]
    })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response(payload, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(new TextEncoder().encode(payload).byteLength)
        }
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  function parseRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
    const init = fetchMock.mock.calls[0][1] as RequestInit
    return JSON.parse(String(init.body)) as {
      model: string
      temperature: number
      max_tokens: number
      messages: Array<{ role: string; content: string }>
    }
  }

  it("uses one Chat Completions request and returns validated drafts", async () => {
    const fetchMock = mockOkFetch(
      JSON.stringify({
        cards: [
          {
            id: "model-id",
            type: "basic",
            question: "使役形表示什么？",
            answer: "让某人做某事",
            sourceQuote: SOURCE
          }
        ]
      })
    )

    const result = await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      maxCards: 3
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = parseRequestBody(fetchMock)
    expect(body).toMatchObject({
      model: "test-model",
      temperature: 0.2
    })
    expect(body.messages).toHaveLength(2)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].id).toBe("draft_1")
  })

  it("embeds quality rules in the basic system prompt", async () => {
    const fetchMock = mockOkFetch(
      JSON.stringify({
        cards: [
          {
            id: "model-id",
            type: "basic",
            question: "使役形表示什么？",
            answer: "让某人做某事",
            sourceQuote: SOURCE
          }
        ]
      })
    )

    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      maxCards: 3
    })

    const body = parseRequestBody(fetchMock)
    const system = body.messages[0].content
    expect(body.messages[0].role).toBe("system")

    // Standalone intelligibility
    expect(system).toMatch(/standalone/i)
    expect(system).toMatch(/without the source/i)
    // Unique answer / minimum information
    expect(system).toMatch(/exactly one knowledge point/i)
    expect(system).toMatch(/unique, clear answer/i)
    // High-value filter
    expect(system).toMatch(/high-value filter/i)
    expect(system).toMatch(/core concepts/i)
    // Self-check
    expect(system).toMatch(/silently self-check/i)
    // Basic: active recall + contiguous excerpt from sourceQuote
    expect(system).toMatch(/active recall/i)
    expect(system).toMatch(/contiguous excerpt copied from sourceQuote/i)
    expect(system).toMatch(/sourceQuote must be a contiguous excerpt of the source/i)
  })

  it("embeds quality rules in the cloze system prompt", async () => {
    const clozeSource =
      "使役形（～させる）表示让某人做某事。被动形表示主语被动作影响。"
    const fetchMock = mockOkFetch(
      JSON.stringify({
        cards: [
          {
            id: "model-id",
            type: "cloze",
            text: "使役形（～させる）表示让某人做某事。",
            clozeText: "使役形",
            sourceQuote: "使役形（～させる）表示让某人做某事。"
          }
        ]
      })
    )

    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: clozeSource,
      cardType: "cloze",
      maxCards: 3
    })

    const body = parseRequestBody(fetchMock)
    const system = body.messages[0].content
    expect(body.messages[0].role).toBe("system")

    // Core non-trivial cloze targets
    expect(system).toMatch(/core, non-trivial/i)
    expect(system).toMatch(/never articles, connectives/i)
    // Sufficient context without leaking
    expect(system).toMatch(/enough context/i)
    expect(system).toMatch(/without directly leaking/i)
    // Single primary target
    expect(system).toMatch(/one primary cloze target/i)
    // Existing substring / contiguous constraints
    expect(system).toMatch(/contiguous excerpt copied from the source/i)
    expect(system).toMatch(/clozeText must occur exactly as a substring of text/i)
    expect(system).toMatch(/sourceQuote must be a contiguous excerpt of the source/i)
  })

  it("embeds quality-first rules and inserts params in the user prompt", async () => {
    const fetchMock = mockOkFetch(
      JSON.stringify({
        cards: [
          {
            id: "model-id",
            type: "basic",
            question: "使役形表示什么？",
            answer: "让某人做某事",
            sourceQuote: SOURCE
          }
        ]
      })
    )

    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      maxCards: 5
    })

    const body = parseRequestBody(fetchMock)
    const user = body.messages[1].content
    expect(body.messages[1].role).toBe("user")

    expect(user).toContain("Card type: basic")
    expect(user).toContain("Maximum cards: 5")
    expect(user).toContain(SOURCE)
    expect(user).toMatch(/quality over quantity/i)
    expect(user).toMatch(/fewer cards or an empty cards array/i)
    expect(user).toContain("-----BEGIN SOURCE-----")
    expect(user).toContain("-----END SOURCE-----")
    expect(user).toMatch(/untrusted SOURCE DATA/i)
  })

  it("returns CANCELLED when the caller aborts the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("Aborted")
              error.name = "AbortError"
              reject(error)
            })
          })
      )
    )
    const controller = new AbortController()

    const pending = generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      maxCards: 3,
      signal: controller.signal
    })
    controller.abort()

    const result = await pending
    expect(result).toEqual({
      success: false,
      error: { code: "CANCELLED", message: "已取消生成" }
    })
  })

  it("preserves a plain-text HTTP error body", async () => {
    const body = "quota exceeded for this account"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(body, {
          status: 429,
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": String(new TextEncoder().encode(body).byteLength)
          }
        })
      )
    )

    const result = await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      maxCards: 3
    })

    expect(result).toEqual({
      success: false,
      error: {
        code: "HTTP_429",
        message: "quota exceeded for this account"
      }
    })
  })
})
