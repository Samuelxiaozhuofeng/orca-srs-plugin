/**
 * Bounded HTTP response reading: Content-Length precheck + streaming hard cap.
 * Used by Firecrawl and AI clients — never fully buffer unbounded bodies first.
 */

export class ResponseTooLargeError extends Error {
  readonly code = "response_too_large"
  readonly limit: number
  readonly actual: number | null

  constructor(message: string, limit: number, actual: number | null = null) {
    super(message)
    this.name = "ResponseTooLargeError"
    this.limit = limit
    this.actual = actual
  }
}

export class ResponseBodyUnreadableError extends Error {
  readonly code = "response_body_unreadable"

  constructor(message: string) {
    super(message)
    this.name = "ResponseBodyUnreadableError"
  }
}

function getContentLength(response: Response): number | null {
  const headers = response.headers
  if (!headers || typeof headers.get !== "function") return null
  const raw = headers.get("content-length")
  if (raw == null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * Reject when Content-Length is present and exceeds maxBytes.
 */
export function assertContentLengthWithin(
  response: Response,
  maxBytes: number
): void {
  const n = getContentLength(response)
  if (n == null) return
  if (n > maxBytes) {
    throw new ResponseTooLargeError(
      `响应过大（Content-Length ${n} > ${maxBytes} 字节）`,
      maxBytes,
      n
    )
  }
}

function hasReadableStream(response: Response): boolean {
  const body = response.body
  return Boolean(body && typeof body.getReader === "function")
}

/**
 * Read response body as UTF-8 text with a hard byte cap.
 *
 * Production rules:
 * - Prefer streaming body and enforce running total.
 * - Without a stream, fail closed. Content-Length is controlled by the peer
 *   and cannot make a later full-buffer read memory-safe.
 */
export async function readResponseTextLimited(
  response: Response,
  maxBytes: number
): Promise<string> {
  assertContentLengthWithin(response, maxBytes)

  if (hasReadableStream(response)) {
    const reader = response.body!.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > maxBytes) {
          try {
            await reader.cancel()
          } catch {
            // ignore cancel errors after size limit
          }
          throw new ResponseTooLargeError(
            `响应体超过上限（>${maxBytes} 字节）`,
            maxBytes,
            total
          )
        }
        chunks.push(value)
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }
    const merged = concatUint8(chunks, total)
    return new TextDecoder("utf-8", { fatal: false }).decode(merged)
  }

  throw new ResponseBodyUnreadableError(
    "响应缺少可读流，拒绝无界缓冲"
  )
}

/**
 * Parse one JSON value from a response body that may contain trailing junk,
 * NDJSON, or SSE `data:` frames (common on multi-model OpenAI-compatible proxies).
 */
export function parseJsonResponseText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new SyntaxError("Empty JSON response")
  }

  try {
    return JSON.parse(trimmed)
  } catch (firstError) {
    // SSE / event-stream: take the first non-[DONE] data payload
    if (/^data:\s*/m.test(trimmed) || trimmed.includes("\ndata:")) {
      const fromSse = tryParseSseDataJson(trimmed)
      if (fromSse !== undefined) return fromSse
    }

    // Trailing garbage after a complete value: `{"a":1}extra`
    if (firstError instanceof SyntaxError) {
      const posMatch = /position\s+(\d+)/i.exec(firstError.message)
      if (posMatch) {
        const pos = Number(posMatch[1])
        if (Number.isFinite(pos) && pos > 0 && pos <= trimmed.length) {
          const head = trimmed.slice(0, pos).trimEnd()
          if (head) {
            try {
              return JSON.parse(head)
            } catch {
              // fall through
            }
          }
        }
      }
    }

    // NDJSON / multi-line: first non-empty line that parses
    const lines = trimmed.split(/\r?\n/)
    if (lines.length > 1) {
      for (const line of lines) {
        const t = line.trim()
        if (!t || t === "[DONE]") continue
        const payload = t.startsWith("data:")
          ? t.slice("data:".length).trim()
          : t
        if (!payload || payload === "[DONE]") continue
        try {
          return JSON.parse(payload)
        } catch {
          // try next line
        }
      }
    }

    throw firstError
  }
}

function tryParseSseDataJson(text: string): unknown | undefined {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) continue
    const payload = trimmed.slice("data:".length).trim()
    if (!payload || payload === "[DONE]") continue
    try {
      return JSON.parse(payload)
    } catch {
      // keep scanning for a later complete data frame
    }
  }
  return undefined
}

export async function readResponseJsonLimited<T = unknown>(
  response: Response,
  maxBytes: number
): Promise<T> {
  const text = await readResponseTextLimited(response, maxBytes)
  return parseJsonResponseText(text) as T
}

function concatUint8(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
