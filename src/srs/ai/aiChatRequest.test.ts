import { describe, expect, it } from "vitest"
import {
  buildChatCompletionsBody,
  isGeminiFlashGoogleSearchModel,
  isGrokWebSearchModel,
  isNativeWebSearchSupportedModel,
  materializeWebSearchTool,
  NATIVE_GOOGLE_SEARCH_TOOL,
  NATIVE_WEB_SEARCH_TOOL,
  resolveReasoningEffort,
  resolveWebSearchRoute,
  resolveWebSearchTool,
  shouldAttachNativeWebSearch
} from "./aiChatRequest"
import type { AISettings } from "./aiSettingsSchema"

const baseSettings: Pick<
  AISettings,
  "model" | "enableNativeWebSearch" | "reasoningEffort" | "webSearchToolType"
> = {
  model: "grok-4.5",
  enableNativeWebSearch: false,
  reasoningEffort: "default",
  webSearchToolType: "auto"
}

describe("aiChatRequest", () => {
  it("builds minimal body without tools or reasoning_effort by default", () => {
    const body = buildChatCompletionsBody({
      settings: baseSettings,
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0.2,
      maxTokens: 100
    })
    expect(body).toEqual({
      model: "grok-4.5",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      temperature: 0.2,
      max_tokens: 100
    })
    expect(body).not.toHaveProperty("tools")
    expect(body).not.toHaveProperty("reasoning_effort")
  })

  it("routes Grok 4.5 to flat web_search when enableNativeWebSearch is true", () => {
    const body = buildChatCompletionsBody({
      settings: { ...baseSettings, enableNativeWebSearch: true },
      messages: [{ role: "user", content: "news?" }]
    })
    expect(body.tools).toEqual([{ ...NATIVE_WEB_SEARCH_TOOL }])
    expect(resolveWebSearchRoute("grok-4.5")).toBe("web_search")
    expect(isGrokWebSearchModel("cpa/grok-4.5")).toBe(true)
  })

  it("routes Gemini Flash to nested google_search when enableNativeWebSearch is true", () => {
    for (const model of [
      "gemini-3.6-flash",
      "cpa/gemini-3.6-flash",
      "cpa/gemini-3.6-flash-high",
      "ag/gemini-3-flash",
      "openai-compatible-chat-xxx/gemini-3.6-flash"
    ]) {
      expect(isGeminiFlashGoogleSearchModel(model)).toBe(true)
      expect(resolveWebSearchRoute(model)).toBe("google_search")
      const body = buildChatCompletionsBody({
        settings: {
          model,
          enableNativeWebSearch: true,
          reasoningEffort: "default",
          webSearchToolType: "auto"
        },
        messages: [{ role: "user", content: "news?" }]
      })
      expect(body.tools).toEqual([
        { type: "google_search", google_search: {} }
      ])
    }
  })

  it("does not attach tools for unsupported models even when switch is on", () => {
    for (const model of [
      "gpt-4.1",
      "grok-3",
      "grok-4",
      "cpa/grok-4.3",
      "grok-4.50",
      "cpa/gemini-3.1-pro-low",
      "gemini-pro-agent",
      // 前缀含 flash、leaf 是 pro → 不得当 Gemini Flash
      "flash-router/gemini-3.1-pro",
      // flash 不是独立 token
      "gemini-flashcards-v1"
    ]) {
      expect(isNativeWebSearchSupportedModel(model)).toBe(false)
      expect(isGeminiFlashGoogleSearchModel(model)).toBe(false)
      const body = buildChatCompletionsBody({
        settings: {
          model,
          enableNativeWebSearch: true,
          reasoningEffort: "default",
          webSearchToolType: "auto"
        },
        messages: [{ role: "user", content: "Hi" }]
      })
      expect(body).not.toHaveProperty("tools")
      expect(
        shouldAttachNativeWebSearch({
          model,
          enableNativeWebSearch: true
        })
      ).toBe(false)
    }
  })

  it("matches grok-4.5 behind gateway prefixes", () => {
    const routed =
      "openai-compatible-chat-c1581bce-f417-4b7e-9461-0ad88093f26b/grok-4.5"
    expect(isNativeWebSearchSupportedModel(routed)).toBe(true)
    const body = buildChatCompletionsBody({
      settings: {
        model: routed,
        enableNativeWebSearch: true,
        reasoningEffort: "default",
        webSearchToolType: "auto"
      },
      messages: [{ role: "user", content: "Hi" }]
    })
    expect(body.tools).toEqual([{ type: "web_search" }])
  })

  it("materializes flat web_search for Grok and nested google_search for Gemini", () => {
    expect(materializeWebSearchTool("web_search")).toEqual({
      type: "web_search"
    })
    expect(materializeWebSearchTool("google_search")).toEqual({
      type: "google_search",
      google_search: {}
    })
    expect(materializeWebSearchTool("google_search")).toEqual({
      ...NATIVE_GOOGLE_SEARCH_TOOL
    })
  })

  it("ignores legacy webSearchToolType overrides; model alone decides the route", () => {
    // 旧数据写过 google_search，但当前 model 是 Grok → 仍走 web_search
    expect(
      resolveWebSearchTool({
        model: "grok-4.5",
        enableNativeWebSearch: true,
        webSearchToolType: "google_search"
      })
    ).toEqual({ type: "web_search" })

    // 旧数据写过 web_search，但当前 model 是 Gemini Flash → 仍走 nested google_search
    expect(
      resolveWebSearchTool({
        model: "cpa/gemini-3.6-flash",
        enableNativeWebSearch: true,
        webSearchToolType: "web_search"
      })
    ).toEqual({ type: "google_search", google_search: {} })

    // 旧数据写过 google_search，但 model 不支持 → 不挂 tools
    expect(
      resolveWebSearchTool({
        model: "gpt-4.1",
        enableNativeWebSearch: true,
        webSearchToolType: "google_search"
      })
    ).toBeNull()
  })

  it("does not mutate shared google_search empty object across calls", () => {
    const a = materializeWebSearchTool("google_search")
    const b = materializeWebSearchTool("google_search")
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    if (a.type === "google_search" && b.type === "google_search") {
      expect(a.google_search).not.toBe(b.google_search)
      expect(a.google_search).not.toBe(NATIVE_GOOGLE_SEARCH_TOOL.google_search)
    }
  })

  it("allowWebSearch=false skips tools even when setting is on", () => {
    expect(
      shouldAttachNativeWebSearch(
        { enableNativeWebSearch: true, model: "grok-4.5" },
        false
      )
    ).toBe(false)
    const body = buildChatCompletionsBody({
      settings: { ...baseSettings, enableNativeWebSearch: true },
      messages: [{ role: "user", content: "Hi" }],
      allowWebSearch: false
    })
    expect(body).not.toHaveProperty("tools")
    expect(
      resolveWebSearchTool(
        {
          model: "cpa/gemini-3.6-flash",
          enableNativeWebSearch: true
        },
        false
      )
    ).toBeNull()
  })

  it("writes reasoning_effort for low/medium/high only", () => {
    expect(resolveReasoningEffort("default")).toBeUndefined()
    expect(resolveReasoningEffort("low")).toBe("low")
    expect(resolveReasoningEffort("medium")).toBe("medium")
    expect(resolveReasoningEffort("high")).toBe("high")

    const body = buildChatCompletionsBody({
      settings: { ...baseSettings, reasoningEffort: "medium" },
      messages: [{ role: "user", content: "Hi" }]
    })
    expect(body.reasoning_effort).toBe("medium")
  })

  it("combines web search and reasoning effort for grok-4.5", () => {
    const body = buildChatCompletionsBody({
      settings: {
        model: "grok-4.5",
        enableNativeWebSearch: true,
        reasoningEffort: "high",
        webSearchToolType: "auto"
      },
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "u" }
      ],
      temperature: 0.3,
      maxTokens: 500
    })
    expect(body).toMatchObject({
      model: "grok-4.5",
      temperature: 0.3,
      max_tokens: 500,
      tools: [{ type: "web_search" }],
      reasoning_effort: "high"
    })
  })
})
