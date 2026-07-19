/**
 * Unified redaction for logs, notifications, and UI error messages.
 * Strips exact configured secrets, Bearer tokens, and common auth field shapes.
 */

const AUTH_FIELD_PATTERNS: RegExp[] = [
  /Bearer\s+\S+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /fc-[A-Za-z0-9_-]+/g,
  /api[_-]?key["'\s:=]+["']?[^\s"',}{]+/gi,
  /x-api-key["'\s:=]+["']?[^\s"',}{]+/gi,
  /authorization["'\s:=]+["']?[^\s"',}{]+/gi,
  /"token"\s*:\s*"[^"]+"/gi,
  /"access_token"\s*:\s*"[^"]+"/gi,
  /"refresh_token"\s*:\s*"[^"]+"/gi
]

/**
 * Redact exact key first, then common auth patterns.
 */
export function sanitizePublicError(message: string, apiKey?: string): string {
  let out = message
  const key = (apiKey ?? "").trim()
  if (key.length > 0) {
    out = out.split(key).join("***")
  }
  for (const re of AUTH_FIELD_PATTERNS) {
    // Reset lastIndex for global regex reuse
    re.lastIndex = 0
    out = out.replace(re, (match) => {
      if (/^Bearer\s+/i.test(match)) return "Bearer ***"
      if (match.startsWith("sk-")) return "sk-***"
      if (match.startsWith("fc-")) return "fc-***"
      if (/api[_-]?key/i.test(match)) return "api_key=***"
      if (/x-api-key/i.test(match)) return "x-api-key=***"
      if (/authorization/i.test(match)) return "authorization=***"
      if (/"token"/i.test(match)) return '"token":"***"'
      if (/"access_token"/i.test(match)) return '"access_token":"***"'
      if (/"refresh_token"/i.test(match)) return '"refresh_token":"***"'
      return "***"
    })
  }
  return out
}
