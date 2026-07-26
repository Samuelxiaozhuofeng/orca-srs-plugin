import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clipCardSource,
  clipCustomInstruction,
  generateFlashcardDrafts
} from "./aiService"
import {
  AI_CARD_SOURCE_MAX,
  AI_CUSTOM_INSTRUCTION_MAX
} from "./aiDraftTypes"

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
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
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
      detailLevel: "key"
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = parseRequestBody(fetchMock)
    expect(body).toMatchObject({
      model: "test-model",
      temperature: 0.2
    })
    expect(body).not.toHaveProperty("tools")
    expect(body).not.toHaveProperty("reasoning_effort")
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
      detailLevel: "key"
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
      detailLevel: "key"
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
      detailLevel: "exhaustive"
    })

    const body = parseRequestBody(fetchMock)
    const user = body.messages[1].content
    expect(body.messages[1].role).toBe("user")

    expect(user).toContain("Card type: basic")
    // 上限现在按详细程度档位推出，且明确标注为上限而非目标
    expect(user).toContain("Hard ceiling: at most 12 cards")
    expect(user).toContain("This is a limit, not a target")
    expect(user).toContain(SOURCE)
    // 「宁缺毋滥」的措辞随档位改造换了说法，但语义仍必须出现在 user prompt 里
    expect(user).toMatch(/returning fewer, or none, is expected/i)
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
      detailLevel: "key",
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
      detailLevel: "key"
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

describe("clipCardSource", () => {
  it("leaves sources within the limit untouched", () => {
    const { text, truncated } = clipCardSource("  短文本  ", 100)
    expect(text).toBe("短文本")
    expect(truncated).toBe(false)
  })

  it("clips over-long sources without injecting a marker", () => {
    const long = "あ".repeat(50)
    const { text, truncated } = clipCardSource(long, 10)
    expect(truncated).toBe(true)
    expect(text).toHaveLength(10)
    // 标记会成为模型可引用的伪源文本，接地校验就是拿这段文本做的
    expect(text).not.toContain("truncated")
    expect(long.startsWith(text)).toBe(true)
  })

  it("defaults to AI_CARD_SOURCE_MAX", () => {
    const long = "x".repeat(AI_CARD_SOURCE_MAX + 500)
    const { text, truncated } = clipCardSource(long)
    expect(truncated).toBe(true)
    expect(text).toHaveLength(AI_CARD_SOURCE_MAX)
  })
})

describe("generateFlashcardDrafts source cap", () => {
  beforeEach(() => {
    installSettings()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("caps the prompt source and tells the model it was truncated", async () => {
    const long = "使役形の説明。".repeat(3000)
    const payload = JSON.stringify({
      choices: [{ message: { content: '{"cards":[]}' } }]
    })
    const fetchMock = vi.fn(
      async () =>
        new Response(payload, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(
              new TextEncoder().encode(payload).byteLength
            )
          }
        })
    )
    vi.stubGlobal("fetch", fetchMock)

    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: long,
      cardType: "basic",
      detailLevel: "key"
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMsg = body.messages.find((m) => m.role === "user")!.content
    expect(userMsg).toContain("was truncated")
    // 整块 21000 字符不应原样进请求体
    expect(userMsg.length).toBeLessThan(long.length)
  })
})

describe("制卡弹窗 v2 prompt 选项", () => {
  beforeEach(() => {
    installSettings()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function captureBody(fetchMock: ReturnType<typeof vi.fn>) {
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    return JSON.parse(String(init.body)) as {
      max_tokens: number
      messages: Array<{ role: string; content: string }>
    }
  }

  function mockEmptyCards() {
    const payload = JSON.stringify({
      choices: [{ message: { content: '{"cards":[]}' } }]
    })
    const fetchMock = vi.fn(
      async () =>
        new Response(payload, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(
              new TextEncoder().encode(payload).byteLength
            )
          }
        })
    )
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("maps each detail level to its own ceiling", async () => {
    for (const [level, cap] of [
      ["summary", 2],
      ["key", 5],
      ["exhaustive", 12]
    ] as const) {
      const fetchMock = mockEmptyCards()
      await generateFlashcardDrafts({
        pluginName: PLUGIN,
        sourceText: SOURCE,
        cardType: "basic",
        detailLevel: level
      })
      const user = captureBody(fetchMock).messages.find(
        (m) => m.role === "user"
      )!.content
      expect(user).toContain(`Hard ceiling: at most ${cap} cards`)
      vi.unstubAllGlobals()
    }
  })

  it("frames the ceiling as a limit rather than a production target", async () => {
    // 旧 prompt 的 "Maximum cards: 3" 会被模型当成配额去凑，
    // 与 system prompt 的 quality-over-quantity 直接打架
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic"
    })
    const user = captureBody(fetchMock).messages.find(
      (m) => m.role === "user"
    )!.content
    expect(user).toContain("This is a limit, not a target")
    expect(user).not.toContain("Maximum cards:")
  })

  it("raises max_tokens for the exhaustive level", async () => {
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      detailLevel: "exhaustive"
    })
    // 12 张结构化卡在 2000 tokens 下会被截成半个 JSON
    expect(captureBody(fetchMock).max_tokens).toBe(4000)
  })

  it("passes a custom instruction outside the untrusted source markers", async () => {
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      customInstruction: "只做定义类"
    })
    const user = captureBody(fetchMock).messages.find(
      (m) => m.role === "user"
    )!.content
    const instructionAt = user.indexOf("只做定义类")
    const sourceBeginAt = user.indexOf("-----BEGIN SOURCE-----")
    expect(instructionAt).toBeGreaterThan(-1)
    // 自定义指令是受信输入，必须在 SOURCE 分隔符之外
    expect(instructionAt).toBeLessThan(sourceBeginAt)
  })

  it("clips an over-long custom instruction", () => {
    const long = "x".repeat(AI_CUSTOM_INSTRUCTION_MAX + 200)
    expect(clipCustomInstruction(long)).toHaveLength(AI_CUSTOM_INSTRUCTION_MAX)
    expect(clipCustomInstruction("  spaced  ")).toBe("spaced")
    expect(clipCustomInstruction(undefined)).toBe("")
  })

  it("asks for target-language wording but forbids translating quotes", async () => {
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      cardLanguage: "en"
    })
    const system = captureBody(fetchMock).messages.find(
      (m) => m.role === "system"
    )!.content
    expect(system).toContain("Write question wording")
    expect(system).toContain("English")
    // 翻译摘录会让接地校验整批失败
    expect(system).toContain("Do NOT translate answer, text, or sourceQuote")
  })

  it("keeps source-matching wording when language is auto", async () => {
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      cardLanguage: "auto"
    })
    const system = captureBody(fetchMock).messages.find(
      (m) => m.role === "system"
    )!.content
    expect(system).toContain("Match the language of the source.")
    expect(system).not.toContain("Do NOT translate")
  })

  it("sends existing cards as an exclusion list when asking for more", async () => {
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic",
      excludeSummaries: ["已有问题一", "  ", "已有问题二"]
    })
    const user = captureBody(fetchMock).messages.find(
      (m) => m.role === "user"
    )!.content
    expect(user).toContain("- 已有问题一")
    expect(user).toContain("- 已有问题二")
    expect(user).toContain("Draft only NEW cards")
  })

  it("omits the exclusion block entirely on a first batch", async () => {
    const fetchMock = mockEmptyCards()
    await generateFlashcardDrafts({
      pluginName: PLUGIN,
      sourceText: SOURCE,
      cardType: "basic"
    })
    const user = captureBody(fetchMock).messages.find(
      (m) => m.role === "user"
    )!.content
    expect(user).not.toContain("Draft only NEW cards")
  })
})
