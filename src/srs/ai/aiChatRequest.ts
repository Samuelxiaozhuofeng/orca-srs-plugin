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
 * `webSearchToolType` 为历史字段，解析时**忽略**；形态只由 model id 决定。
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

export type WebSearchToolRoute = "web_search" | "google_search"

function normalizeModelId(model: string | undefined | null): string {
  return typeof model === "string" ? model.trim().toLowerCase() : ""
}

/**
 * 取网关前缀后的模型名段（最后一段 `/` 之后）。
 * 例：`cpa/gemini-3.6-flash` → `gemini-3.6-flash`；`flash-router/gemini-pro` → `gemini-pro`。
 */
export function modelIdLeaf(model: string | undefined | null): string {
  const id = normalizeModelId(model)
  if (!id) return ""
  const slash = id.lastIndexOf("/")
  return slash >= 0 ? id.slice(slash + 1) : id
}

/** Grok 4.5 家族；`grok-4.50` 等更长数字版本不命中。 */
export function isGrokWebSearchModel(
  model: string | undefined | null
): boolean {
  // 在 leaf 上匹配，避免前缀脏数据；`(?!\d)` 防止 grok-4.50 误伤
  return /(?:^|[^a-z0-9])grok-4\.5(?!\d)/.test(modelIdLeaf(model))
}

/**
 * Gemini Flash 家族：leaf 须含 gemini，且 flash 作为独立 token
 * （`-flash` / `.flash` / `_flash`，可后接后缀如 `-high`）。
 * 排除：`gemini-pro`、`gemini-flashcards`、`flash-router/gemini-pro`。
 */
export function isGeminiFlashGoogleSearchModel(
  model: string | undefined | null
): boolean {
  const leaf = modelIdLeaf(model)
  if (!leaf.includes("gemini")) return false
  return /(?:^|[-._])flash(?:[-._]|$)/.test(leaf)
}

/**
 * 按 model 解析应走的联网路线；不支持则 null（开了总开关也不挂 tools）。
 * Grok 4.5 优先于其它匹配（防极端 id 脏数据双命中）。
 */
export function resolveWebSearchRoute(
  model: string | undefined | null
): WebSearchToolRoute | null {
  if (isGrokWebSearchModel(model)) return "web_search"
  if (isGeminiFlashGoogleSearchModel(model)) return "google_search"
  return null
}

/**
 * 开启「模型原生联网」后是否会实际附带 tools。
 * 仅 Grok 4.5 / Gemini Flash 为 true；其它 model 即使开关打开也不挂 tools。
 */
export function isNativeWebSearchSupportedModel(
  model: string | undefined | null
): boolean {
  return resolveWebSearchRoute(model) !== null
}

/**
 * 把路线解析为请求体 tools 条目。
 * - `web_search` → 扁平 xAI 形态（Grok）
 * - `google_search` → Gemini grounding 形态（含 `google_search: {}`）
 */
export function materializeWebSearchTool(
  toolType: WebSearchToolRoute
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
 * 优先级：allowWebSearch（调用方硬性关闭）> 总开关 > **model 自动路线**。
 * 历史字段 `webSearchToolType` 不再参与解析（UI 已去掉形态下拉）。
 */
export function resolveWebSearchTool(
  settings: WebSearchAwareSettings,
  allowWebSearch = true
): ResolvedWebSearchTool | null {
  if (allowWebSearch !== true) return null
  if (settings.enableNativeWebSearch !== true) return null

  const route = resolveWebSearchRoute(settings.model)
  return route ? materializeWebSearchTool(route) : null
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
