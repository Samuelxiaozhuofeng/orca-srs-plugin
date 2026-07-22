import { describe, expect, it } from "vitest"
import {
  buildChatCompletionsBody,
  isNativeWebSearchSupportedModel,
  NATIVE_WEB_SEARCH_TOOL,
  resolveReasoningEffort,
  shouldAttachNativeWebSearch
} from "./aiChatRequest"
import type { AISettings } from "./aiSettingsSchema"

const baseSettings: Pick<
  AISettings,
  "model" | "enableNativeWebSearch" | "reasoningEffort"
> = {
  model: "grok-4.5",
  enableNativeWebSearch: false,
  reasoningEffort: "default"
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
      "gpt-4.1",
      "grok-3",
      "grok-4",
      "openai-compatible-chat-xxx/gemini-3.6-flash"
    ]) {
      const body = buildChatCompletionsBody({
        settings: {
          model,
          enableNativeWebSearch: true,
          reasoningEffort: "default"
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
        reasoningEffort: "default"
      },
      messages: [{ role: "user", content: "Hi" }]
    })
    expect(body.tools).toEqual([{ type: "web_search" }])
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
        reasoningEffort: "high"
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
