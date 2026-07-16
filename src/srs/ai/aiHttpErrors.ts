/**
 * Shared HTTP error body extraction for AI fetch paths.
 */

import { HTTP_ERROR_BODY_MAX } from "./aiDraftTypes"

/**
 * Prefer JSON error.message, else truncated plain text.
 */
export async function readHttpErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  let bodyText = ""
  try {
    bodyText = await response.text()
  } catch {
    return fallback
  }

  if (!bodyText || !bodyText.trim()) {
    return fallback
  }

  const trimmed = bodyText.trim()
  try {
    const data = JSON.parse(trimmed) as {
      error?: { message?: string }
      message?: string
    }
    const msg = data.error?.message || data.message
    if (typeof msg === "string" && msg.trim()) {
      return msg.trim().slice(0, HTTP_ERROR_BODY_MAX)
    }
  } catch {
    // plain text body
  }

  return trimmed.slice(0, HTTP_ERROR_BODY_MAX)
}
