/**
 * Web HTML sanitization and metadata helpers for article import.
 * Stricter than EPUB helpers: untrusted remote HTML.
 */

import {
  getHtmlContentRoot,
  parseHtml,
  removeMatchingTopHeading,
  sanitizeHtmlForOrca
} from "../epub/epubHtml"

const REMOVE_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "meta",
  "link",
  "base",
  "svg",
  "canvas",
  "video",
  "audio",
  "source",
  "track",
  "applet",
  "frame",
  "frameset"
] as const

/**
 * Sanitize untrusted web HTML for Orca import.
 * - Strips dangerous tags/attrs
 * - Blocks javascript:/vbscript: URLs
 * - Resolves relative image URLs to absolute http(s); drops data/blob/file
 * - Removes leading heading that duplicates the page title
 * - Applies Orca batchInsertHTML link workaround
 */
export function sanitizeWebHtml(
  html: string,
  baseUrl: string,
  pageTitle: string
): string {
  const doc = parseHtml(html)
  const root = getHtmlContentRoot(doc, html)

  for (const tag of REMOVE_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove())
  }

  // Remove event handlers, inline styles, and dangerous URLs on all elements
  const all = root.querySelectorAll("*")
  all.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      // on* handlers, inline style (positioning / background urls), srcdoc
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        el.removeAttribute(attr.name)
      }
    }

    for (const attrName of ["href", "src", "xlink:href", "action", "formaction", "poster"]) {
      const val = el.getAttribute(attrName)
      if (val == null) continue
      if (isDangerousUrl(val)) {
        el.removeAttribute(attrName)
      }
    }
  })

  // Images: only http(s); resolve relative against baseUrl
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src")
    if (!src) {
      img.remove()
      return
    }
    const absolute = resolveHttpUrl(src, baseUrl)
    if (!absolute) {
      img.remove()
      return
    }
    img.setAttribute("src", absolute)
    // Drop srcset to avoid mixed schemes
    img.removeAttribute("srcset")
  })

  // Drop remaining elements with data:/blob:/file: src
  root.querySelectorAll("[src]").forEach((el) => {
    const src = el.getAttribute("src") ?? ""
    if (/^(data:|blob:|file:)/i.test(src.trim())) {
      el.remove()
    }
  })

  removeMatchingTopHeading(root, pageTitle)
  sanitizeHtmlForOrca(root as HTMLElement)

  return root.innerHTML
}

export function isDangerousUrl(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v.startsWith("javascript:")) return true
  if (v.startsWith("vbscript:")) return true
  if (v.startsWith("data:text/html")) return true
  return false
}

export function resolveHttpUrl(src: string, baseUrl: string): string | null {
  const trimmed = src.trim()
  if (!trimmed) return null
  if (/^(data:|blob:|file:)/i.test(trimmed)) return null
  if (isDangerousUrl(trimmed)) return null
  try {
    const absolute = new URL(trimmed, baseUrl)
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
      return null
    }
    return absolute.toString()
  } catch {
    return null
  }
}

export function pickMetadataString(
  metadata: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = metadata[key]
    if (typeof v === "string" && v.trim()) return v.trim()
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) {
      return v[0].trim()
    }
  }
  return undefined
}

export function buildTitleFromMetadata(
  metadata: Record<string, unknown>,
  hostname: string
): string {
  return (
    pickMetadataString(metadata, ["title", "ogTitle", "og:title"])
    || hostname
    || "未命名网页"
  )
}

export function plainTextLength(html: string): number {
  try {
    const doc = parseHtml(`<div>${html}</div>`)
    const text = doc.body?.textContent ?? ""
    return text.replace(/\s+/g, " ").trim().length
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length
  }
}
