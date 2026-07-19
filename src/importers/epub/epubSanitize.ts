/**
 * Strict EPUB HTML sanitizer for import.
 * Security boundary — separate from compatibility-only sanitizeHtmlForOrca.
 */

import { getHtmlContentRoot, parseHtml, sanitizeHtmlForOrca } from "./epubHtml"

/** Tags allowed to remain in imported chapter HTML. */
export const EPUB_ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
])

/** Attributes allowed on any remaining element (after on-handlers / style / srcdoc strip). */
const GLOBAL_ALLOWED_ATTRS = new Set([
  "id",
  "class",
  "title",
  "lang",
  "dir",
  "alt",
  "colspan",
  "rowspan",
  "scope",
  "headers",
  "start",
  "type",
  "width",
  "height"
])

const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"])

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
  "option",
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
  "frameset",
  "math",
  "foreignObject"
] as const

/**
 * In-place strict sanitization of an EPUB chapter content root.
 * Images must already point at trusted local Orca asset paths (or be removed).
 */
export function sanitizeEpubHtmlForImport(root: HTMLElement): void {
  for (const tag of REMOVE_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove())
  }

  // Unwrap disallowed tags (keep children text/structure) or remove void-ish nodes.
  const all = Array.from(root.querySelectorAll("*"))
  for (const el of all) {
    const tag = el.tagName.toLowerCase()
    if (EPUB_ALLOWED_TAGS.has(tag)) continue
    // Prefer unwrap to preserve nested text
    const parent = el.parentNode
    if (!parent) {
      el.remove()
      continue
    }
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    el.remove()
  }

  root.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        el.removeAttribute(attr.name)
        continue
      }
      if (URL_ATTRS.has(name)) {
        if (isDangerousEpubUrl(attr.value)) {
          el.removeAttribute(attr.name)
        }
        continue
      }
      if (!GLOBAL_ALLOWED_ATTRS.has(name) && name !== "src" && name !== "href") {
        // Drop unknown attrs (data-*, aria can be dropped for first release simplicity)
        if (!name.startsWith("aria-") && name !== "role") {
          el.removeAttribute(attr.name)
        }
      }
    }
  })

  // Images: only keep src that looks like an already-uploaded / relative-safe asset.
  // External/data/blob/file must never remain.
  root.querySelectorAll("img").forEach((img) => {
    const src = (img.getAttribute("src") ?? "").trim()
    if (!src || isRejectedImageSrc(src)) {
      img.remove()
      return
    }
    img.removeAttribute("srcset")
    img.removeAttribute("crossorigin")
  })

  // Final Orca compatibility pass (anchors without href, etc.)
  sanitizeHtmlForOrca(root)
}

/**
 * Parse HTML string, sanitize, return innerHTML of content root.
 */
export function sanitizeEpubHtmlString(html: string): string {
  const doc = parseHtml(html)
  const root = getHtmlContentRoot(doc, html) as HTMLElement
  sanitizeEpubHtmlForImport(root)
  return root.innerHTML
}

export function isDangerousEpubUrl(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (!v) return false
  if (v.startsWith("javascript:")) return true
  if (v.startsWith("vbscript:")) return true
  if (v.startsWith("data:text/html")) return true
  return false
}

/** Image src that must not survive import (external / data / blob / file / unknown scheme). */
export function isRejectedImageSrc(src: string): boolean {
  const v = src.trim()
  if (!v) return true
  if (v.startsWith("//")) return true
  if (/^(data:|blob:|file:)/i.test(v)) return true
  // scheme present and not a relative path
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    // Allow only if it is already an Orca asset-like path host might use; reject http(s) etc.
    // Orca uploaded assets are typically relative paths or app-specific without external host.
    if (/^https?:/i.test(v)) return true
    if (/^javascript:/i.test(v)) return true
    // unknown custom schemes rejected
    return true
  }
  return false
}

/** Whether a rewritten/local asset path is acceptable for img src after upload. */
export function isTrustedLocalAssetSrc(src: string): boolean {
  const v = src.trim()
  if (!v) return false
  if (isRejectedImageSrc(v)) return false
  // Relative path or absolute path without scheme
  return true
}
