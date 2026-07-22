/**
 * OpenAI 兼容 Chat Completions 请求体组装。
 * 统一附带可选的 model 原生联网 tool 与思考强度，避免各调用点复制。
 */

import type { AIReasoningEffort, AISettings } from "./aiSettingsSchema"

export type ChatCompletionsMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type BuildChatCompletionsBodyOptions = {
  settings: Pick<
    AISettings,
    "model" | "enableNativeWebSearch" | "reasoningEffort"
  >
  messages: ChatCompletionsMessage[]
  temperature?: number
  maxTokens?: number
  /**
   * 连接探测等短请求可关掉联网 tool，避免测连变慢/产生搜索计费。
   * 默认 true：尊重 settings.enableNativeWebSearch。
   */
  allowWebSearch?: boolean
}

/**
 * xAI 等内置 server-side tool：tools: [{ type: "web_search" }]
 * OpenAI 兼容网关若识别该 type，会走模型原生联网；不支持时由上游返回错误（可见）。
 */
export const NATIVE_WEB_SEARCH_TOOL = { type: "web_search" } as const

export function shouldAttachNativeWebSearch(
  settings: Pick<AISettings, "enableNativeWebSearch">,
  allowWebSearch = true
): boolean {
  return allowWebSearch && settings.enableNativeWebSearch === true
}

/**
 * 仅当用户显式选择 low/medium/high 时写入 reasoning_effort。
 * default = 不传，兼容不支持该字段的模型/网关。
 */
export function resolveReasoningEffort(
  effort: AIReasoningEffort | undefined
): "low" | "medium" | "high" | undefined {
  if (effort === "low" || effort === "medium" || effort === "high") {
    return effort
  }
  return undefined
}

/**
 * 组装 Chat Completions JSON body（可序列化的纯对象）。
 *
 * 始终显式 `stream: false`：部分多模型网关对个别 model 默认开流，
 * 返回 SSE/拼接体导致严格 JSON.parse 失败。
 */
export function buildChatCompletionsBody(
  options: BuildChatCompletionsBodyOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.settings.model,
    messages: options.messages,
    stream: false
  }

  if (typeof options.temperature === "number") {
    body.temperature = options.temperature
  }
  if (typeof options.maxTokens === "number") {
    body.max_tokens = options.maxTokens
  }

  if (shouldAttachNativeWebSearch(options.settings, options.allowWebSearch)) {
    body.tools = [{ ...NATIVE_WEB_SEARCH_TOOL }]
  }

  const effort = resolveReasoningEffort(options.settings.reasoningEffort)
  if (effort) {
    body.reasoning_effort = effort
  }

  return body
}
