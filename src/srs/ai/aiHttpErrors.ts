/**
 * Shared HTTP error body extraction for AI fetch paths.
 * Enforces byte limits before parse and redacts secrets.
 */

import { HTTP_ERROR_BODY_MAX } from "./aiDraftTypes"
import {
  readResponseTextLimited,
  ResponseTooLargeError
} from "../http/safeResponse"
import { sanitizePublicError } from "../http/redactSecrets"

/** Max bytes read from AI error bodies (before display truncate). */
export const AI_HTTP_ERROR_READ_MAX = 8_192

/**
 * Prefer JSON error.message, else truncated plain text. Always redacted.
 */
export async function readHttpErrorMessage(
  response: Response,
  fallback: string,
  apiKey?: string
): Promise<string> {
  let bodyText = ""
  try {
    bodyText = await readResponseTextLimited(response, AI_HTTP_ERROR_READ_MAX)
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return sanitizePublicError(
        `${fallback}（错误响应过大，已截断读取）`,
        apiKey
      )
    }
    return sanitizePublicError(fallback, apiKey)
  }

  if (!bodyText || !bodyText.trim()) {
    return sanitizePublicError(fallback, apiKey)
  }

  const trimmed = bodyText.trim()
  try {
    const data = JSON.parse(trimmed) as {
      error?: { message?: string }
      message?: string
    }
    const msg = data.error?.message || data.message
    if (typeof msg === "string" && msg.trim()) {
      return sanitizePublicError(msg.trim().slice(0, HTTP_ERROR_BODY_MAX), apiKey)
    }
  } catch {
    // plain text body
  }

  return sanitizePublicError(trimmed.slice(0, HTTP_ERROR_BODY_MAX), apiKey)
}
