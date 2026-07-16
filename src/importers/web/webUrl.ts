/**
 * URL validation, normalization, and private/local host blocking for web import.
 */

import { WebImportError } from "./types"

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443"
}

export function validateAndNormalizeUrl(raw: string): {
  sourceUrl: string
  canonicalUrl: string
  hostname: string
} {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) {
    throw new WebImportError("请输入网页地址", "invalid_url")
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new WebImportError(
      "网址格式无效，请使用以 http:// 或 https:// 开头的完整地址",
      "invalid_url"
    )
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebImportError(
      "只支持 http 或 https 网址",
      "invalid_url"
    )
  }

  if (parsed.username || parsed.password) {
    throw new WebImportError(
      "网址不能包含用户名或密码",
      "invalid_url"
    )
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isBlockedHostname(hostname)) {
    throw new WebImportError(
      "出于安全考虑，不能导入本机或内网地址",
      "private_url"
    )
  }

  // Drop fragment
  parsed.hash = ""
  // Hostname lowercase
  parsed.hostname = hostname
  // Remove default ports
  if (parsed.port && DEFAULT_PORTS[parsed.protocol] === parsed.port) {
    parsed.port = ""
  }

  const canonicalUrl = parsed.toString()
  // sourceUrl: user-facing without credentials (already none) — same as canonical after normalize
  return {
    sourceUrl: canonicalUrl,
    canonicalUrl,
    hostname
  }
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")

  if (host === "localhost" || host.endsWith(".localhost")) return true
  if (host === "0.0.0.0") return true

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return isPrivateOrLocalIPv4(host)
  }

  // IPv6 (no brackets)
  if (host.includes(":")) {
    return isPrivateOrLocalIPv6(host)
  }

  return false
}

function isPrivateOrLocalIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true // treat malformed as blocked
  }
  const [a, b] = parts
  // loopback 127.0.0.0/8
  if (a === 127) return true
  // private 10.0.0.0/8
  if (a === 10) return true
  // private 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // private 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // link-local 169.254.0.0/16
  if (a === 169 && b === 254) return true
  // CGNAT 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

/**
 * Block local/private/special IPv6 literals.
 * Covers: unspecified ::, loopback, link-local, ULA, site-local (fec0::/10),
 * multicast (ff00::/8), IPv4-mapped (::ffff:…) and IPv4-compatible (::x.x.x.x / ::hex).
 * Does not block ordinary public IPv6 (e.g. 2001:db8::, 2606:…, 2a00:…).
 */
function isPrivateOrLocalIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "")

  // unspecified ::
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true

  // loopback ::1
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true

  // Multicast ff00::/8 (first hextet starts with ff)
  const firstHextet = normalized.startsWith("::")
    ? ""
    : (normalized.split(":")[0] ?? "")
  if (/^ff[0-9a-f]{0,2}$/i.test(firstHextet)) {
    return true
  }

  // link-local fe80::/10 (fe80–febf)
  if (
    normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
  ) {
    return true
  }

  // deprecated site-local fec0::/10 (fec0–feff)
  if (
    normalized.startsWith("fec")
    || normalized.startsWith("fed")
    || normalized.startsWith("fee")
    || normalized.startsWith("fef")
  ) {
    return true
  }

  // ULA fc00::/7
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true

  // IPv4-mapped / IPv4-compatible embedded addresses
  const embedded = extractEmbeddedIPv4(normalized)
  if (embedded) {
    // Mapped/compatible form always treated carefully: block if private, or always
    // block loopback/private; also block any embedded form of private ranges.
    return isPrivateOrLocalIPv4(embedded)
  }

  return false
}

/**
 * Extract IPv4 from IPv4-mapped (::ffff:…) or IPv4-compatible (::…) forms.
 * Supports dotted-decimal and hex hextet encodings (e.g. ::ffff:7f00:1 → 127.0.0.1).
 */
export function extractEmbeddedIPv4(ipv6: string): string | null {
  const n = ipv6.toLowerCase().replace(/^\[|\]$/g, "")

  // ::ffff:a.b.c.d  or  0:0:0:0:0:ffff:a.b.c.d
  const dottedMapped = n.match(/^(?:(?:0:){5}|::)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dottedMapped) return dottedMapped[1]

  // ::ffff:HHHH:HHHH  (e.g. ::ffff:7f00:1)
  const hexMapped = n.match(/^(?:(?:0:){5}|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexMapped) {
    return hextetsToIPv4(hexMapped[1], hexMapped[2])
  }

  // IPv4-compatible dotted: ::a.b.c.d  (not ::1 which is loopback pure)
  const dottedCompat = n.match(/^::(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dottedCompat) return dottedCompat[1]

  // IPv4-compatible hex: ::HHHH:HHHH (e.g. ::7f00:1 from ::127.0.0.1)
  // Exclude pure ::1 already handled; require exactly two trailing hextets after ::
  const hexCompat = n.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexCompat) {
    return hextetsToIPv4(hexCompat[1], hexCompat[2])
  }

  return null
}

function hextetsToIPv4(hi: string, lo: string): string | null {
  const h = Number.parseInt(hi, 16)
  const l = Number.parseInt(lo, 16)
  if (!Number.isFinite(h) || !Number.isFinite(l) || h < 0 || h > 0xffff || l < 0 || l > 0xffff) {
    return null
  }
  const a = (h >> 8) & 0xff
  const b = h & 0xff
  const c = (l >> 8) & 0xff
  const d = l & 0xff
  return `${a}.${b}.${c}.${d}`
}
