/**
 * OpenAI 兼容 /models 列表拉取
 *
 * 从 chat/completions URL 推导 models 端点；失败时错误可见、不吞。
 */

import { sanitizePublicError } from "../http/redactSecrets"
import {
  readResponseJsonLimited,
  ResponseTooLargeError
} from "../http/safeResponse"
import { AI_MAX_RESPONSE_BYTES } from "./aiDraftTypes"
import { readHttpErrorMessage } from "./aiHttpErrors"

export const MODELS_FETCH_TIMEOUT_MS = 20_000

/**
 * 由 chat completions URL 推导 models 列表端点。
 * Azure 部署路径无法可靠推导，返回 null。
 */
export function deriveModelsListUrl(chatCompletionsUrl: string): string | null {
  const raw = (chatCompletionsUrl ?? "").trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.hostname.includes("openai.azure.com")) {
    return null
  }

  let path = url.pathname || ""
  // 去掉末尾斜杠
  path = path.replace(/\/+$/, "") || ""

  if (path.endsWith("/chat/completions")) {
    path = `${path.slice(0, -"/chat/completions".length)}/models`
  } else if (path.endsWith("/completions")) {
    path = `${path.slice(0, -"/completions".length)}/models`
  } else if (path.includes("/v1")) {
    // e.g. /v1 or /xxx/v1/something → 截到 /v1/models
    const v1 = path.indexOf("/v1")
    path = `${path.slice(0, v1)}/v1/models`
  } else if (path === "" || path === "/") {
    path = "/v1/models"
  } else {
    path = `${path}/models`
  }

  url.pathname = path
  url.search = ""
  url.hash = ""
  return url.toString()
}

export type FetchCompatibleModelsResult =
  | { success: true; models: string[]; modelsUrl: string }
  | { success: false; error: string; modelsUrl?: string }

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const ids: string[] = []
  for (const item of data) {
    if (!item || typeof item !== "object") continue
    const id = (item as { id?: unknown }).id
    if (typeof id === "string" && id.trim()) {
      ids.push(id.trim())
    }
  }
  // 稳定排序，便于 UI
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
}

/**
 * 使用当前草稿 Key/URL 拉取模型列表（不必先保存）。
 */
export async function fetchCompatibleModels(options: {
  apiKey: string
  apiUrl: string
  signal?: AbortSignal
}): Promise<FetchCompatibleModelsResult> {
  const apiKey = (options.apiKey ?? "").trim()
  const apiUrl = (options.apiUrl ?? "").trim()
  if (!apiKey) {
    return { success: false, error: "请先填写 API Key" }
  }
  if (!apiUrl) {
    return { success: false, error: "请先填写 API URL" }
  }

  const modelsUrl = deriveModelsListUrl(apiUrl)
  if (!modelsUrl) {
    return {
      success: false,
      error:
        "无法从当前 API URL 推导 /models 端点（Azure 等特殊路径请手动填写模型名）"
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    MODELS_FETCH_TIMEOUT_MS
  )
  const onExternalAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId)
      return { success: false, error: "已取消", modelsUrl }
    }
    options.signal.addEventListener("abort", onExternalAbort)
  }

  try {
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    })

    if (!response.ok) {
      const fallback = `HTTP ${response.status}`
      const bodyMessage = await readHttpErrorMessage(
        response,
        fallback,
        apiKey
      )
      return {
        success: false,
        error: sanitizePublicError(
          `拉取模型失败（${response.status}）：${bodyMessage}`,
          apiKey
        ),
        modelsUrl
      }
    }

    let payload: unknown
    try {
      payload = await readResponseJsonLimited(response, AI_MAX_RESPONSE_BYTES)
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        return {
          success: false,
          error: `模型列表响应过大（上限 ${AI_MAX_RESPONSE_BYTES} 字节）`,
          modelsUrl
        }
      }
      throw error
    }

    const models = extractModelIds(payload)
    if (models.length === 0) {
      return {
        success: false,
        error: "模型列表为空或响应格式非 OpenAI 兼容（期望 data[].id）",
        modelsUrl
      }
    }
    return { success: true, models, modelsUrl }
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      const cancelled = options.signal?.aborted === true
      return {
        success: false,
        error: cancelled
          ? "已取消"
          : `拉取模型超时（${Math.round(MODELS_FETCH_TIMEOUT_MS / 1000)} 秒）`,
        modelsUrl
      }
    }
    const raw = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: sanitizePublicError(raw, apiKey),
      modelsUrl
    }
  } finally {
    clearTimeout(timeoutId)
    if (options.signal) {
      options.signal.removeEventListener("abort", onExternalAbort)
    }
  }
}
