import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildBlockExplainSystemPrompt,
  buildBlockExplainUserPrompt,
  buildBlockSideSystemPrompt,
  parseBlockExplanation,
  parsePlainTextPayload,
  generateBlockExplanation,
  BLOCK_EXPLAIN_SOURCE_MAX
} from "./aiBlockExplain"

const PLUGIN = "orca-srs"

function installSettings(apiKey = "sk-test") {
  ;(globalThis as any).orca = {
    state: {
      plugins: {
        [PLUGIN]: {
          settings: {
            "ai.apiKey": apiKey,
            "ai.apiUrl": "https://example.test/v1/chat/completions",
            "ai.model": "test-model"
          }
        }
      }
    }
  }
}

function mockOkFetch(content: string) {
  const payload = JSON.stringify({
    choices: [{ message: { content } }]
  })
  const fetchMock = vi.fn(async () => {
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

describe("parseBlockExplanation", () => {
  it("parses full JSON", () => {
    const raw = JSON.stringify({
      paraphrase: "工作记忆是短时加工信息的系统。",
      terms: [{ term: "工作记忆", gloss: "短时可操作的信息缓冲" }]
    })
    const got = parseBlockExplanation(raw)
    expect(got.paraphrase).toContain("工作记忆")
    expect(got.terms).toHaveLength(1)
    expect(got.terms[0].term).toBe("工作记忆")
  })

  it("strips markdown fences", () => {
    const raw =
      "```json\n" +
      JSON.stringify({ paraphrase: "你好", terms: [] }) +
      "\n```"
    const got = parseBlockExplanation(raw)
    expect(got.paraphrase).toBe("你好")
    expect(got.selfCheck).toBeNull()
  })

  it("falls back to plain text when not JSON", () => {
    const got = parseBlockExplanation("这是一段直接返回的解释。")
    expect(got.paraphrase).toContain("直接返回")
    expect(got.terms).toEqual([])
  })

  it("throws when JSON object lacks paraphrase", () => {
    expect(() => parseBlockExplanation(JSON.stringify({ terms: [] }))).toThrow(/paraphrase/)
  })
})

describe("buildBlockExplain prompts", () => {
  it("marks thinner mode and wraps source", () => {
    const sys = buildBlockExplainSystemPrompt(true)
    expect(sys).toMatch(/1–2 short sentences/i)
    const user = buildBlockExplainUserPrompt("源文本内容", "选中词", true)
    expect(user).toContain("Mode: shorter")
    expect(user).toContain("-----BEGIN SOURCE-----")
    expect(user).toContain("源文本内容")
    expect(user).toContain("-----BEGIN FOCUS-----")
    expect(user).toContain("选中词")
  })

  it("truncates long source", () => {
    const long = "甲".repeat(BLOCK_EXPLAIN_SOURCE_MAX + 50)
    const user = buildBlockExplainUserPrompt(long, null, false)
    expect(user).toContain("[truncated]")
    expect(user).not.toContain(long)
    expect(user.includes("甲".repeat(BLOCK_EXPLAIN_SOURCE_MAX))).toBe(true)
  })
})

describe("generateBlockExplanation", () => {
  beforeEach(() => {
    installSettings()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns NO_API_KEY when missing", async () => {
    installSettings("")
    const result = await generateBlockExplanation({
      pluginName: PLUGIN,
      blockText: "hello"
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("NO_API_KEY")
  })

  it("returns EMPTY_SOURCE for blank text", async () => {
    const result = await generateBlockExplanation({
      pluginName: PLUGIN,
      blockText: "   "
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("EMPTY_SOURCE")
  })

  it("parses successful HTTP response", async () => {
    const payload = {
      paraphrase: "白话",
      terms: [{ term: "T", gloss: "G" }]
    }
    mockOkFetch(JSON.stringify(payload))

    const result = await generateBlockExplanation({
      pluginName: PLUGIN,
      blockText: "源"
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.explanation.paraphrase).toBe("白话")
      expect(result.explanation.terms[0].term).toBe("T")
    }
  })
})

describe("side / follow-up parse helpers", () => {
  it("builds example and rebuttal system prompts", () => {
    expect(buildBlockSideSystemPrompt("example")).toMatch(/example/i)
    expect(buildBlockSideSystemPrompt("rebuttal")).toMatch(/challenge|counterpoint/i)
  })

  it("parses {text} JSON and plain fallback", () => {
    expect(parsePlainTextPayload(JSON.stringify({ text: "举例内容" }))).toBe("举例内容")
    expect(parsePlainTextPayload("直接文本")).toBe("直接文本")
  })
})
