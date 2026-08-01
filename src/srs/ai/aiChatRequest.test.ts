import { describe, expect, it } from "vitest"
import {
  buildChatCompletionsBody,
  isNativeWebSearchSupportedModel,
  materializeWebSearchTool,
  NATIVE_GOOGLE_SEARCH_TOOL,
  NATIVE_WEB_SEARCH_TOOL,
  resolveReasoningEffort,
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

  it("attaches web_search only for grok-4.5 when enableNativeWebSearch is true", () => {
    const body = buildChatCompletionsBody({
      settings: { ...baseSettings, enableNativeWebSearch: true },
      messages: [{ role: "user", content: "news?" }]
    })
    expect(body.tools).toEqual([{ ...NATIVE_WEB_SEARCH_TOOL }])
  })

  it("does not attach web_search for non-grok-4.5 even when setting is on", () => {
    for (const model of [
      "gemini-3.6-flash",
      "cpa/gemini-3.6-flash",
      "gpt-4.1",
      "grok-3",
      "grok-4",
      "openai-compatible-chat-xxx/gemini-3.6-flash"
    ]) {
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
          enableNativeWebSearch: true,
          webSearchToolType: "auto"
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

  it("explicit web_search stays flat and ignores model id", () => {
    for (const model of ["gpt-4.1", "cpa/gemini-3.6-flash", "grok-4.5"]) {
      const tool = resolveWebSearchTool({
        model,
        enableNativeWebSearch: true,
        webSearchToolType: "web_search"
      })
      expect(tool).toEqual({ type: "web_search" })
      expect(tool).not.toHaveProperty("google_search")
    }
  })

  it("explicit google_search attaches nested grounding tool regardless of model", () => {
    for (const model of [
      "cpa/gemini-3.6-flash",
      "gemini-3.6-flash",
      "gpt-4.1",
      "grok-4.5"
    ]) {
      const body = buildChatCompletionsBody({
        settings: {
          model,
          enableNativeWebSearch: true,
          reasoningEffort: "default",
          webSearchToolType: "google_search"
        },
        messages: [{ role: "user", content: "news?" }]
      })
      expect(body.tools).toEqual([
        { type: "google_search", google_search: {} }
      ])
    }
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
          enableNativeWebSearch: true,
          webSearchToolType: "google_search"
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
