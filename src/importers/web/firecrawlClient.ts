/**
 * Firecrawl v2 scrape client: request, timeout/cancel, API error parsing, key redaction.
 * Does not write to Orca. Never logs the API key.
 */

import { DEFAULT_FIRECRAWL_SCRAPE_URL } from "../../srs/settings/webImportSettingsSchema"
import {
  readResponseJsonLimited,
  ResponseTooLargeError
} from "../../srs/http/safeResponse"
import { sanitizePublicError } from "../../srs/http/redactSecrets"
import { WebImportError } from "./types"

/** Client-side request timeout (ms); also passed to Firecrawl as timeout. */
export const FIRECRAWL_TIMEOUT_MS = 60_000

/** Hard cap for Firecrawl success/error JSON bodies (bytes). */
export const FIRECRAWL_MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export interface FirecrawlScrapeOptions {
  url: string
  apiKey: string
  apiUrl?: string
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * Call Firecrawl v2 scrape. Does not write to Orca.
 * Never logs or returns the API key.
 */
export async function scrapeWithFirecrawl(
  options: FirecrawlScrapeOptions
): Promise<{ html: string; metadata: Record<string, unknown> }> {
  const apiKey = (options.apiKey ?? "").trim()
  if (!apiKey) {
    throw new WebImportError(
      "未配置 Firecrawl API Key。请在插件设置中填写 webImport.firecrawlApiKey",
      "missing_api_key"
    )
  }

  const apiUrl = (options.apiUrl ?? DEFAULT_FIRECRAWL_SCRAPE_URL).trim()
  const timeoutMs = options.timeoutMs ?? FIRECRAWL_TIMEOUT_MS
  const fetchFn = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchFn !== "function") {
    throw new WebImportError("当前环境不支持网络请求（fetch 不可用）", "network")
  }

  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) {
      throw new WebImportError("已取消解析", "aborted")
    }
    options.signal.addEventListener("abort", onExternalAbort, { once: true })
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetchFn(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          url: options.url,
          formats: ["html"],
          onlyMainContent: true,
          timeout: Math.min(Math.max(timeoutMs, 1000), 300_000)
        }),
        signal: controller.signal
      })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new WebImportError("已取消解析", "aborted")
        }
        throw new WebImportError(
          `解析超时（${Math.round(timeoutMs / 1000)} 秒）。请检查网络后重试`,
          "timeout"
        )
      }
      const msg = error instanceof Error ? error.message : String(error)
      throw new WebImportError(
        `网络错误，无法连接 Firecrawl：${sanitizePublicError(msg, apiKey)}`,
        "network",
        { cause: error }
      )
    }

    const status = response.status
    let body: unknown = null
    try {
      body = await readResponseJsonLimited(response, FIRECRAWL_MAX_RESPONSE_BYTES)
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new WebImportError("已取消解析", "aborted")
        }
        throw new WebImportError(
          `解析超时（${Math.round(timeoutMs / 1000)} 秒）。请检查网络后重试`,
          "timeout"
        )
      }
      if (error instanceof ResponseTooLargeError) {
        throw new WebImportError(
          `Firecrawl 响应过大（上限 ${FIRECRAWL_MAX_RESPONSE_BYTES} 字节），已中止`,
          "http_error",
          { cause: error }
        )
      }
      // Non-abort parse failures leave body null → handled as unparseable below.
      body = null
    }

    if (status === 401) {
      throw new WebImportError(
        "Firecrawl API Key 无效或已过期（HTTP 401）。请检查插件设置中的密钥",
        "http_401"
      )
    }
    if (status === 402) {
      throw new WebImportError(
        `Firecrawl 账户额度不足或需付费（HTTP 402）。${extractApiErrorSummary(body, apiKey)}`,
        "http_402"
      )
    }
    if (status === 429) {
      throw new WebImportError(
        `请求过于频繁（HTTP 429）。请稍后再试。${extractApiErrorSummary(body, apiKey)}`,
        "http_429"
      )
    }
    if (status < 200 || status >= 300) {
      throw new WebImportError(
        `Firecrawl 请求失败（HTTP ${status}）。${extractApiErrorSummary(body, apiKey)}`,
        "http_error"
      )
    }

    if (!body || typeof body !== "object") {
      throw new WebImportError(
        "Firecrawl 返回了无法解析的响应",
        "api_error"
      )
    }

    const json = body as {
      success?: unknown
      data?: { html?: unknown; metadata?: Record<string, unknown> }
      error?: unknown
      message?: unknown
      details?: unknown
    }

    if (json.success !== true) {
      throw new WebImportError(
        `Firecrawl 解析失败：${extractApiErrorSummary(body, apiKey) || "success 不为 true"}`,
        "api_error"
      )
    }

    const html = json.data?.html
    if (typeof html !== "string" || !html.trim()) {
      throw new WebImportError(
        "网页正文为空：Firecrawl 未返回可用 HTML。请确认该页可公开访问",
        "empty_html"
      )
    }

    return {
      html,
      metadata: (json.data?.metadata && typeof json.data.metadata === "object")
        ? json.data.metadata
        : {}
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onExternalAbort)
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = (error as { name?: string }).name
  return name === "AbortError" || name === "TimeoutError"
}

/** Re-export shared redaction (exact key + Bearer + common auth fields). */
export { sanitizePublicError }

export function extractApiErrorSummary(body: unknown, apiKey?: string): string {
  if (!body || typeof body !== "object") return ""
  const o = body as Record<string, unknown>
  const parts: string[] = []
  for (const key of ["error", "message", "details", "code"] as const) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) {
      parts.push(sanitizePublicError(v.trim(), apiKey))
    } else if (v != null && typeof v === "object") {
      try {
        const s = JSON.stringify(v)
        if (s.length < 400) parts.push(sanitizePublicError(s, apiKey))
      } catch {
        // ignore
      }
    }
  }
  return parts.slice(0, 3).join(" — ")
}
