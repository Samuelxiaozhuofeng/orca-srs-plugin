/**
 * OpenAI 兼容 Chat Completions 请求体组装。
 * 统一附带可选的 model 原生联网 tool 与思考强度，避免各调用点复制。
 */

import type {
  AIReasoningEffort,
  AISettings,
  AIWebSearchToolType
} from "./aiSettingsSchema"

/**
 * 联网判定所需的最小设置面。
 * webSearchToolType 可选：旧调用点（含既有测试）无需同步改造，缺省按 "auto"。
 */
export type WebSearchAwareSettings = Pick<
  AISettings,
  "model" | "enableNativeWebSearch"
> & { webSearchToolType?: AIWebSearchToolType }

export type ChatCompletionsMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type BuildChatCompletionsBodyOptions = {
  settings: WebSearchAwareSettings &
    Pick<AISettings, "model" | "reasoningEffort">
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
 * xAI Grok 原生 server-side tool（扁平 `{ type: "web_search" }`）。
 * 不得改成带嵌套字段：Grok / 部分网关只认此形态。
 */
export const NATIVE_WEB_SEARCH_TOOL = { type: "web_search" } as const

/**
 * Gemini Google Search grounding tool。
 * 必须带空对象 `google_search: {}`：ROUTER9 等 OpenAI 兼容网关上，
 * 仅 `{ type: "google_search" }` 不稳定（常不触发检索或 malformed_function_call）。
 */
export const NATIVE_GOOGLE_SEARCH_TOOL = {
  type: "google_search",
  google_search: {}
} as const

/** 写入 Chat Completions `tools[]` 的联网 tool 条目（可序列化纯对象）。 */
export type ResolvedWebSearchTool =
  | { type: "web_search" }
  | { type: "google_search"; google_search: Record<string, never> }

/**
 * 「自动」档下认为支持原生 web_search 的模型。
 * 仅匹配 id 中含 `grok-4.5`（大小写不敏感；可含网关前缀）。
 *
 * 这条匹配天生脆弱：新版本号一发布即失效，也覆盖不到其它厂商的 tool 形态。
 * 因此它只作为「自动」档的推荐值，用户可在设置里显式指定 tool 形态覆盖它。
 */
export function isNativeWebSearchSupportedModel(
  model: string | undefined | null
): boolean {
  const id = typeof model === "string" ? model.trim().toLowerCase() : ""
  return id.includes("grok-4.5")
}

/**
 * 把设置项里的 tool 形态解析为请求体 tools 条目。
 * - `web_search` → 扁平 xAI 形态（Grok）
 * - `google_search` → Gemini grounding 形态（含 `google_search: {}`）
 */
export function materializeWebSearchTool(
  toolType: Exclude<AIWebSearchToolType, "auto">
): ResolvedWebSearchTool {
  if (toolType === "google_search") {
    return {
      type: "google_search",
      google_search: { ...NATIVE_GOOGLE_SEARCH_TOOL.google_search }
    }
  }
  return { ...NATIVE_WEB_SEARCH_TOOL }
}

/**
 * 解析本次请求应附带的联网 tool；null = 不带 tools 走普通请求。
 *
 * 优先级：allowWebSearch（调用方硬性关闭）> 总开关 > tool 形态设置。
 * 显式形态（web_search / google_search）不再看 model id——
 * 用户比这里的字符串匹配更清楚自己的网关支持什么。
 * auto 仍只推荐 Grok 的 web_search，不自动给 Gemini 挂 google_search。
 */
export function resolveWebSearchTool(
  settings: WebSearchAwareSettings,
  allowWebSearch = true
): ResolvedWebSearchTool | null {
  if (allowWebSearch !== true) return null
  if (settings.enableNativeWebSearch !== true) return null

  const toolType = settings.webSearchToolType ?? "auto"
  if (toolType === "auto") {
    return isNativeWebSearchSupportedModel(settings.model)
      ? materializeWebSearchTool("web_search")
      : null
  }
  return materializeWebSearchTool(toolType)
}

/**
 * @deprecated 用 resolveWebSearchTool；保留供既有测试与外部引用。
 */
export function shouldAttachNativeWebSearch(
  settings: WebSearchAwareSettings,
  allowWebSearch = true
): boolean {
  return resolveWebSearchTool(settings, allowWebSearch) !== null
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

  const webSearchTool = resolveWebSearchTool(
    options.settings,
    options.allowWebSearch
  )
  if (webSearchTool) {
    body.tools = [webSearchTool]
  }

  const effort = resolveReasoningEffort(options.settings.reasoningEffort)
  if (effort) {
    body.reasoning_effort = effort
  }

  return body
}
