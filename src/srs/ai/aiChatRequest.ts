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
 * xAI Grok 原生 server-side tool。
 * 本插件仅在 model 为 grok-4.5 时附带；其它模型即使开关打开也不发 tools。
 */
export const NATIVE_WEB_SEARCH_TOOL = { type: "web_search" } as const

/**
 * 是否为支持原生 web_search 的模型。
 * 仅匹配 id 中含 `grok-4.5`（大小写不敏感；可含网关前缀）。
 */
export function isNativeWebSearchSupportedModel(
  model: string | undefined | null
): boolean {
  const id = typeof model === "string" ? model.trim().toLowerCase() : ""
  return id.includes("grok-4.5")
}

/**
 * 是否应在请求体中附带 web_search tool。
 * 条件：开关开 + allowWebSearch + model 为 grok-4.5；否则普通请求、不带 tools。
 */
export function shouldAttachNativeWebSearch(
  settings: Pick<AISettings, "enableNativeWebSearch" | "model">,
  allowWebSearch = true
): boolean {
  return (
    allowWebSearch === true &&
    settings.enableNativeWebSearch === true &&
    isNativeWebSearchSupportedModel(settings.model)
  )
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
