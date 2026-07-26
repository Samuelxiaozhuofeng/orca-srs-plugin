/**
 * 统一的 OpenAI 兼容 Chat Completions 客户端。
 *
 * 此前 aiService / aiQuickPrompt / aiBlockExplain / webAiSummary / aiConfigValidator
 * 各自实现了同一套 timeout controller + external abort 桥接 + HTTP 错误读取 +
 * 字节上限 + 脱敏 + choices 提取（每处 70~90 行、逐字节近似）。
 * 任何横切能力（重试、限流、usage 统计、请求日志）都要改 5 次。
 *
 * 本模块是这条链路的唯一出口；调用点只描述「发什么」，不再重复「怎么发」。
 *
 * 行为契约与拆分前保持一致：
 * - 错误码：NO_API_KEY / CANCELLED / TIMEOUT / HTTP_<status> /
 *   RESPONSE_TOO_LARGE / EMPTY_RESPONSE / NETWORK_ERROR / RESPONSE_PARSE_ERROR
 * - 所有对外 message 均经 sanitizePublicError 脱敏
 * - 错误可见：不静默降级、不返回空内容冒充成功
 */

import { getAISettings, normalizeAISettings, type AISettings } from "./aiSettingsSchema"
import {
  buildChatCompletionsBody,
  type ChatCompletionsMessage
} from "./aiChatRequest"
import {
  classifyAiFetchCatchError,
  readHttpErrorMessage
} from "./aiHttpErrors"
import {
  AI_MAX_RESPONSE_BYTES,
  GENERATION_TIMEOUT_MS,
  type AIServiceError
} from "./aiDraftTypes"
import {
  readResponseJsonLimited,
  ResponseTooLargeError
} from "../http/safeResponse"
import { sanitizePublicError } from "../http/redactSecrets"

export type ChatFetchImpl = typeof fetch

/** 上游返回的 token 用量（可选；部分网关不返回）。 */
export type ChatUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type CallChatCompletionsOptions = {
  pluginName: string
  messages: ChatCompletionsMessage[]
  temperature?: number
  maxTokens?: number
  /** 非空时覆盖设置中的 model（提示词库按条绑定模型用）。 */
  modelOverride?: string
  /** 连接探测等短请求可关掉联网 tool，默认 true。 */
  allowWebSearch?: boolean
  /** 默认 GENERATION_TIMEOUT_MS。 */
  timeoutMs?: number
  /** 超时提示前缀，如「连接超时」。默认「生成超时」。 */
  timeoutLabel?: string
  /** 取消提示。默认「已取消生成」。 */
  cancelledMessage?: string
  /**
   * 直接使用给定设置而不读缓存（测连草稿）。
   * 传入值会经 normalizeAISettings 归一。
   */
  settingsOverride?: Partial<AISettings>
  /** 测连只关心 HTTP 可达，不要求 content 非空。 */
  allowEmptyContent?: boolean
  signal?: AbortSignal
  /** 便于测试注入；默认全局 fetch。 */
  fetchImpl?: ChatFetchImpl
}

export type CallChatCompletionsResult =
  | {
      success: true
      /** allowEmptyContent 为 true 且上游无 content 时可能是空串。 */
      content: string
      /** 上游回报的实际 model（网关可能改写）。 */
      model?: string
      usage?: ChatUsage
      status: number
    }
  | { success: false; error: AIServiceError; status?: number }

type ChatCompletionsPayload = {
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof Error && error.name === "AbortError") return true
  return false
}

/** 上游 usage 字段归一；缺字段按 0 计，全缺则返回 undefined。 */
export function normalizeChatUsage(
  usage: ChatCompletionsPayload["usage"]
): ChatUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined
  const prompt = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0
  const completion =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0
  const total =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : prompt + completion
  if (prompt === 0 && completion === 0 && total === 0) return undefined
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total }
}

/**
 * 发起一次 Chat Completions 请求并提取首条 message content。
 *
 * 不做重试/并发控制（见 aiChatPolicy）；不做流式（请求体恒 stream:false）。
 */
export async function callChatCompletions(
  options: CallChatCompletionsOptions
): Promise<CallChatCompletionsResult> {
  const baseSettings = options.settingsOverride
    ? normalizeAISettings(options.settingsOverride)
    : getAISettings(options.pluginName)

  if (!baseSettings.apiKey) {
    return {
      success: false,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    }
  }

  const modelOverride = options.modelOverride?.trim()
  const settings: AISettings = modelOverride
    ? { ...baseSettings, model: modelOverride }
    : baseSettings

  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS
  const timeoutLabel = options.timeoutLabel ?? "生成超时"
  const cancelledMessage = options.cancelledMessage ?? "已取消生成"

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

  const { signal } = options
  const onExternalAbort = () => timeoutController.abort()
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      return {
        success: false,
        error: { code: "CANCELLED", message: cancelledMessage }
      }
    }
    signal.addEventListener("abort", onExternalAbort, { once: true })
  }

  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(baseSettings.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${baseSettings.apiKey}`
      },
      body: JSON.stringify(
        buildChatCompletionsBody({
          settings,
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          allowWebSearch: options.allowWebSearch
        })
      ),
      signal: timeoutController.signal
    })

    if (!response.ok) {
      const fallback = `请求失败: ${response.status}`
      const errorMessage = await readHttpErrorMessage(
        response,
        fallback,
        baseSettings.apiKey
      )
      return {
        success: false,
        status: response.status,
        error: { code: `HTTP_${response.status}`, message: errorMessage }
      }
    }

    let data: ChatCompletionsPayload
    try {
      data = await readResponseJsonLimited(response, AI_MAX_RESPONSE_BYTES)
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        return {
          success: false,
          status: response.status,
          error: {
            code: "RESPONSE_TOO_LARGE",
            message: sanitizePublicError(
              `AI 响应过大（上限 ${AI_MAX_RESPONSE_BYTES} 字节）`,
              baseSettings.apiKey
            )
          }
        }
      }
      throw error
    }

    const rawContent = data.choices?.[0]?.message?.content
    const hasContent = typeof rawContent === "string" && rawContent.length > 0

    if (!hasContent && options.allowEmptyContent !== true) {
      return {
        success: false,
        status: response.status,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      }
    }

    return {
      success: true,
      status: response.status,
      content: hasContent ? (rawContent as string) : "",
      model: typeof data.model === "string" ? data.model : undefined,
      usage: normalizeChatUsage(data.usage)
    }
  } catch (error) {
    if (isAbortError(error)) {
      const cancelledByUser = signal?.aborted === true
      return {
        success: false,
        error: {
          code: cancelledByUser ? "CANCELLED" : "TIMEOUT",
          message: cancelledByUser
            ? cancelledMessage
            : `${timeoutLabel}（${Math.round(timeoutMs / 1000)} 秒）`
        }
      }
    }

    const classified = classifyAiFetchCatchError(error)
    return {
      success: false,
      error: {
        code: classified.code,
        message: sanitizePublicError(classified.message, baseSettings.apiKey)
      }
    }
  } finally {
    clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener("abort", onExternalAbort)
    }
  }
}
