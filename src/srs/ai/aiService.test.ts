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

  it("uses one Chat Completions request and returns validated drafts", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
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
            }
          }
        ]
      })
    }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      maxCards: 3
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(init.body))
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => "quota exceeded for this account"
      }))
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
