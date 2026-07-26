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
import {
  AbortedWhileQueuedError,
  backoffDelayMs,
  delayWithAbort,
  DEFAULT_MAX_RETRIES,
  getAiRequestSemaphore,
  isRetryableErrorCode,
  parseRetryAfterMs
} from "./aiChatPolicy"
import {
  extractEndpointHost,
  recordAiRequest,
  type AiRequestPurpose
} from "./aiRequestLog"

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
  /** 请求日志归类；默认 "other"。 */
  purpose?: AiRequestPurpose
  /** 额外重试次数上限；0 表示不重试。默认 DEFAULT_MAX_RETRIES。 */
  maxRetries?: number
  /** 跳过并发闸门（连接测试等用户显式发起的单发请求）。 */
  bypassConcurrencyGate?: boolean
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
      /** 实际发出的请求次数；> 1 表示发生过重试。 */
      attempts: number
    }
  | {
      success: false
      error: AIServiceError
      status?: number
      attempts: number
    }

/** 单次尝试的内部结果；比对外结果多带一个 Retry-After。 */
type AttemptResult =
  | {
      success: true
      content: string
      model?: string
      usage?: ChatUsage
      status: number
    }
  | {
      success: false
      error: AIServiceError
      status?: number
      retryAfterMs?: number | null
    }

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
 * 单次尝试：发请求并提取首条 message content。
 * 重试与并发由 callChatCompletions 负责；本函数只关心一发一收。
 */
async function attemptChatCompletions(
  options: CallChatCompletionsOptions
): Promise<AttemptResult> {
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
        retryAfterMs: parseRetryAfterMs(
          response.headers.get("Retry-After"),
          Date.now()
        ),
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

/**
 * 发起一次 Chat Completions 调用（含并发闸门、有限次退避重试、请求日志）。
 *
 * 语义保证：
 * - 并发超限时排队等待，**排队期间不计入超时**——deadline 从真正开始发请求起算
 * - 只对 429 / 5xx / 网络抖动重试；用户取消、鉴权失败、参数错误一律立即返回
 * - 无论成功失败都写入请求日志（已脱敏），错误始终可见
 */
export async function callChatCompletions(
  options: CallChatCompletionsOptions
): Promise<CallChatCompletionsResult> {
  const settings = options.settingsOverride
    ? normalizeAISettings(options.settingsOverride)
    : getAISettings(options.pluginName)

  // 无 Key 是配置问题而非请求失败：不占并发名额、不进日志。
  if (!settings.apiKey) {
    return {
      success: false,
      attempts: 0,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    }
  }

  const purpose = options.purpose ?? "other"
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES)
  const cancelledMessage = options.cancelledMessage ?? "已取消生成"
  const requestedModel = options.modelOverride?.trim() || settings.model

  const semaphore = getAiRequestSemaphore()
  const gated = options.bypassConcurrencyGate !== true

  if (gated) {
    try {
      await semaphore.acquire(options.signal)
    } catch (error) {
      if (error instanceof AbortedWhileQueuedError) {
        return {
          success: false,
          attempts: 0,
          error: { code: "CANCELLED", message: cancelledMessage }
        }
      }
      throw error
    }
  }

  const startedAt = Date.now()
  let attempts = 0
  let last: AttemptResult | null = null

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attempts += 1
      last = await attemptChatCompletions(options)

      if (last.success) break
      if (attempt === maxRetries) break
      if (!isRetryableErrorCode(last.error.code)) break

      const wait =
        last.retryAfterMs != null ? last.retryAfterMs : backoffDelayMs(attempt)
      try {
        await delayWithAbort(wait, options.signal)
      } catch {
        // 退避期间用户取消：按取消返回，不再发下一次。
        last = {
          success: false,
          error: { code: "CANCELLED", message: cancelledMessage }
        }
        break
      }
    }
  } finally {
    if (gated) semaphore.release()
  }

  const result = last!
  recordAiRequest({
    startedAt,
    durationMs: Date.now() - startedAt,
    purpose,
    model: requestedModel,
    endpointHost: extractEndpointHost(settings.apiUrl),
    ok: result.success,
    httpStatus: result.status,
    errorCode: result.success ? undefined : result.error.code,
    errorMessage: result.success ? undefined : result.error.message,
    usage: result.success ? result.usage : undefined,
    attempts
  })

  return result.success
    ? { ...result, attempts }
    : { success: false, error: result.error, status: result.status, attempts }
}
